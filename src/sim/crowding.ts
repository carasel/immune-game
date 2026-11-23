import { balance } from '../content/balance'
import { clamp, distance, type Size, type Vec2 } from './geometry'
import { bodyCellWidth, type BodyCell } from './tissue'

/**
 * Who is in whose way.
 *
 * Body cells sit on springs. Anything moving through the tissue — an immune
 * cell or a bacterium — pushes them aside, they shove the cells next to them
 * along, and once nothing is pushing they spring back to where they grew. A
 * body cell can only be pushed so far (`bodyCellMaxPush`); past that it stops
 * giving way and whatever is pushing has to squeeze past it, slowly.
 *
 * Bacteria also crowd each other: they can overlap, but only so much
 * (`bacteriaOverlap`), so a swarm spreads out and you can see how big it is.
 */

/** Anything that takes up room and pushes the tissue about. */
export interface Mover extends Vec2 {
  radius: number
}

/**
 * How many times a tick the pushing and shoving is worked through. A push
 * ripples one cell further out each time round, so this is also how far a
 * single tick's push can travel through the tissue.
 */
const PASSES = 3

/**
 * How much a mover can already be overlapping a body cell before it counts as
 * squeezing. Pushing leaves nothing overlapping at all, so anything more than a
 * sliver means the tissue there has stopped giving way.
 */
const SQUEEZE_SLACK = 1.5

/**
 * How close counts as touching. Pushing leaves things exactly touching, give or
 * take rounding, so anything that has to *reach* a body cell — a bacterium
 * biting one, a macrophage clearing a husk — allows this much over.
 */
export const TOUCHING_SLACK = 1

/** Living cells and the husks dead ones leave both take up room. Eaten ones don't. */
function isSolid(cell: BodyCell): boolean {
  return cell.alive || cell.debris
}

/**
 * How fast something can move from `from` to `to` through the tissue, as a
 * fraction of its normal speed.
 *
 *  - open channel: full speed
 *  - pushing living cells aside: `pushSpeedMultiplier`
 *  - pushing only debris aside: `pushDebrisSpeedMultiplier`, which is quicker
 *  - already jammed into tissue that won't give: `squeezeSpeedMultiplier`
 */
export function tissueSpeedFactor(
  bodyCells: BodyCell[],
  from: Vec2,
  to: Vec2,
  radius: number,
): number {
  let factor = 1

  for (const cell of bodyCells) {
    if (!isSolid(cell)) continue

    const reach = radius + cell.radius

    // Cheap rejection first: this runs for every bacterium, every tick.
    if (Math.abs(cell.x - from.x) >= reach + 4 || Math.abs(cell.y - from.y) >= reach + 4) continue

    // Still overlapping after last tick's pushing: this cell has gone as far as
    // it can and we are squeezing past it.
    if (distance(from.x, from.y, cell.x, cell.y) < reach - SQUEEZE_SLACK) {
      return balance.squeezeSpeedMultiplier
    }

    if (distance(to.x, to.y, cell.x, cell.y) < reach) {
      const pushing = cell.alive ? balance.pushSpeedMultiplier : balance.pushDebrisSpeedMultiplier
      factor = Math.min(factor, pushing)
    }
  }

  return factor
}

/**
 * One tick of the tissue's springs. Run after everything has moved.
 *
 *  1. every pushed body cell springs a little way back home
 *  2. anything overlapping a body cell pushes it out of the way
 *  3. body cells pushed into each other shove each other apart
 *  4. nobody goes further from home than `bodyCellMaxPush`
 *
 * Steps 2–4 are repeated a few times so a push can ripple outwards through
 * the neighbours. `keepClear` puts back any body cell shoved somewhere it can't
 * be, such as inside the splinter.
 */
export function settleTissue(
  bodyCells: BodyCell[],
  movers: Mover[],
  dt: number,
  bounds: Size,
  keepClear: (cell: BodyCell) => void = () => {},
): void {
  const width = bodyCellWidth()
  const maxPush = Math.max(0, balance.bodyCellMaxPush) * width
  const solid = bodyCells.filter(isSolid)

  // 1. Spring back. A fixed fraction of the way home each tick, so it slows down
  //    smoothly as it arrives rather than overshooting.
  //    Close enough counts as home, so a cell that has settled is truly at rest.
  const keep = Math.exp(-dt / Math.max(0.001, balance.bodyCellSpringBackSeconds))
  // Body cells at home never overlap each other, so only pairs where at least
  // one has been pushed need looking at — which is most of them, most ticks.
  const pushed = solid.map((cell) => {
    const dx = (cell.x - cell.homeX) * keep
    const dy = (cell.y - cell.homeY) * keep
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) {
      cell.x = cell.homeX
      cell.y = cell.homeY
      return false
    }
    cell.x = cell.homeX + dx
    cell.y = cell.homeY + dy
    return true
  })

  let biggestMover = 0
  for (const mover of movers) biggestMover = Math.max(biggestMover, mover.radius)

  const grid = new SpatialGrid<Mover>(Math.max(16, biggestMover * 2), bounds, movers.length)
  for (const mover of movers) grid.insert(mover)

  const hold = (cell: BodyCell) => {
    // Only so far from home, however hard it is pushed.
    const dx = cell.x - cell.homeX
    const dy = cell.y - cell.homeY
    const away = Math.hypot(dx, dy)
    if (away > maxPush) {
      cell.x = cell.homeX + (dx / away) * maxPush
      cell.y = cell.homeY + (dy / away) * maxPush
    }

    cell.x = clamp(cell.x, cell.radius, bounds.width - cell.radius)
    cell.y = clamp(cell.y, cell.radius, bounds.height - cell.radius)
    keepClear(cell)
  }

  for (let pass = 0; pass < PASSES; pass++) {
    // 2. Movers push body cells out of their way.
    for (let i = 0; i < solid.length; i++) {
      const cell = solid[i]
      let moved = false

      grid.forEachNear(cell.x, cell.y, cell.radius + biggestMover, (mover) => {
        let dx = cell.x - mover.x
        let dy = cell.y - mover.y
        let gap = Math.hypot(dx, dy)
        const overlap = mover.radius + cell.radius - gap
        if (overlap <= 0) return

        // Dead centre: push it any way at all, as long as it is consistent.
        if (gap === 0) {
          dx = 1
          dy = 0
          gap = 1
        }

        cell.x += (dx / gap) * overlap
        cell.y += (dy / gap) * overlap
        moved = true
      })

      if (moved) {
        hold(cell)
        pushed[i] = true
      }
    }

    // 3. Pushed cells shove their neighbours along. Body cells never overlap each
    //    other unless both are already pushed as far as they will go.
    for (let i = 0; i < solid.length; i++) {
      for (let j = i + 1; j < solid.length; j++) {
        if (!pushed[i] && !pushed[j]) continue

        const a = solid[i]
        const b = solid[j]
        let dx = b.x - a.x
        let dy = b.y - a.y

        // Cheap rejection first: most pairs are nowhere near each other.
        if (Math.abs(dx) >= width || Math.abs(dy) >= width) continue

        let gap = Math.hypot(dx, dy)
        if (gap >= width) continue

        const overlap = width - gap

        if (gap === 0) {
          dx = 1
          dy = 0
          gap = 1
        }

        // A husk is light and empty, so against a living cell it is the husk
        // that gets shoved. Two of a kind share the push evenly.
        const aShare = a.alive === b.alive ? 0.5 : a.alive ? 0 : 1
        const bShare = 1 - aShare

        a.x -= (dx / gap) * overlap * aShare
        a.y -= (dy / gap) * overlap * aShare
        b.x += (dx / gap) * overlap * bShare
        b.y += (dy / gap) * overlap * bShare
        hold(a)
        hold(b)
        pushed[i] = true
        pushed[j] = true
      }
    }
  }
}

/**
 * Bacteria shove each other apart, but only down to `bacteriaOverlap`: at 0.6
 * two of them can sit 60% on top of each other and no closer. Run once a tick,
 * after they have all moved.
 *
 * `isHeld` says which ones can't be moved — anything stuck in a NET. Whatever
 * bumps into one of those does all the moving itself.
 */
export function crowdPathogens<T extends Vec2 & { id: number; alive: boolean }>(
  pathogens: T[],
  radiusOf: (pathogen: T) => number,
  isHeld: (pathogen: T) => boolean,
  bounds: Size,
): void {
  const keepApart = 1 - clamp(balance.bacteriaOverlap, 0, 1)
  if (keepApart <= 0) return

  // Everything about each one worked out once, rather than once per neighbour.
  const crowd: Crowded<T>[] = []
  let biggest = 0
  for (const pathogen of pathogens) {
    if (!pathogen.alive) continue
    const radius = radiusOf(pathogen)
    crowd.push({ x: pathogen.x, y: pathogen.y, pathogen, radius, held: isHeld(pathogen) })
    biggest = Math.max(biggest, radius)
  }
  if (crowd.length < 2) return

  const reach = biggest * 2 * keepApart
  const grid = new SpatialGrid<Crowded<T>>(Math.max(8, reach), bounds, crowd.length)
  for (const entry of crowd) grid.insert(entry)

  for (const a of crowd) {
    grid.forEachNear(a.x, a.y, reach, (b) => {
      // Each pair once.
      if (b.pathogen.id <= a.pathogen.id) return
      if (a.held && b.held) return

      const minGap = (a.radius + b.radius) * keepApart
      const p = a.pathogen
      const q = b.pathogen

      let dx = q.x - p.x
      let dy = q.y - p.y
      if (Math.abs(dx) >= minGap || Math.abs(dy) >= minGap) return

      let gap = Math.hypot(dx, dy)
      if (gap >= minGap) return

      const push = minGap - gap

      // Exactly stacked, which is what a bacterium that just divided can be.
      // Split them along a direction that is fixed per pair, so it never jitters.
      if (gap === 0) {
        const turn = p.id * 7 + q.id * 13
        dx = Math.cos(turn)
        dy = Math.sin(turn)
        gap = 1
      }

      const pShare = a.held ? 0 : b.held ? 1 : 0.5
      const qShare = 1 - pShare

      p.x = clamp(p.x - (dx / gap) * push * pShare, a.radius, bounds.width - a.radius)
      p.y = clamp(p.y - (dy / gap) * push * pShare, a.radius, bounds.height - a.radius)
      q.x = clamp(q.x + (dx / gap) * push * qShare, b.radius, bounds.width - b.radius)
      q.y = clamp(q.y + (dy / gap) * push * qShare, b.radius, bounds.height - b.radius)
    })
  }
}

/** One bacterium in the crowd, filed in the grid by where it was at the start of the tick. */
interface Crowded<T> extends Vec2 {
  pathogen: T
  radius: number
  /** Stuck in a NET, so it can't be shoved. */
  held: boolean
}

/**
 * Buckets things by where they are, so "what is near here" looks at a handful
 * of neighbours rather than all 400 bacteria. Built fresh each tick.
 *
 * Stored as flat arrays — each bucket is a chain of indexes — because this is
 * filled and searched every tick with hundreds of bacteria in it, and that is
 * much quicker than a lookup table of lists.
 */
class SpatialGrid<T extends Vec2> {
  private readonly columns: number
  private readonly rows: number
  /** The first item in each bucket, or -1 for none. */
  private readonly heads: Int32Array
  /** The item after each item in its bucket, or -1 at the end. */
  private readonly next: Int32Array
  private readonly items: T[] = []

  constructor(
    private readonly size: number,
    bounds: Size,
    capacity: number,
  ) {
    this.columns = Math.max(1, Math.ceil(bounds.width / size))
    this.rows = Math.max(1, Math.ceil(bounds.height / size))
    this.heads = new Int32Array(this.columns * this.rows).fill(-1)
    this.next = new Int32Array(Math.max(1, capacity))
  }

  insert(item: T): void {
    const index = this.items.length
    this.items.push(item)

    const bucket = this.column(item.x) * this.rows + this.row(item.y)
    this.next[index] = this.heads[bucket]
    this.heads[bucket] = index
  }

  /** Visits everything in the buckets within `range` of (x, y), and maybe a little more. */
  forEachNear(x: number, y: number, range: number, visit: (item: T) => void): void {
    const left = this.column(x - range)
    const right = this.column(x + range)
    const top = this.row(y - range)
    const bottom = this.row(y + range)

    for (let column = left; column <= right; column++) {
      for (let row = top; row <= bottom; row++) {
        for (let index = this.heads[column * this.rows + row]; index !== -1; index = this.next[index]) {
          visit(this.items[index])
        }
      }
    }
  }

  // Anything off the edge of the screen goes in the edge bucket.
  private column(x: number): number {
    return clamp(Math.floor(x / this.size), 0, this.columns - 1)
  }

  private row(y: number): number {
    return clamp(Math.floor(y / this.size), 0, this.rows - 1)
  }
}
