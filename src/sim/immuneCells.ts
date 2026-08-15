import { balance } from '../content/balance'
import { findImmuneCell, type ImmuneCellDef } from '../content/cells'
import { findPathogen } from '../content/pathogens'
import { clamp, distance, type Size, type Vec2 } from './geometry'
import type { Pathogen } from './pathogens'
import type { Rng } from './rng'
import type { BodyCell } from './tissue'

/**
 * How close a macrophage has to get before it can swallow a pathogen, as a
 * fraction of its own radius. Under 1 so the pathogen looks like it goes inside
 * the cell rather than sticking to its nose.
 */
const PATHOGEN_REACH = 0.8

/**
 * The same idea for a dead body cell. Smaller, because a body cell is bigger
 * than the macrophage — it has to crawl on top of the husk to clear it.
 */
const DEBRIS_REACH = 0.5

/** How close a cell has to get to where it was sent before it counts as arrived. */
const ARRIVED_WITHIN = 2

/**
 * What the player has told a cell to do. A cell has one of these at a time, or
 * none, which is most of the time — orders are a temporary override, never a
 * mode the cell stays in.
 *
 * `move` walks to a place. `chase` goes after one specific pathogen and keeps
 * going until it is dead, however many easier ones it passes on the way.
 */
export type Order =
  | { kind: 'move'; x: number; y: number }
  | { kind: 'chase'; pathogenId: number }

/** What an immune cell is currently busy swallowing. */
export interface Meal {
  kind: 'pathogen' | 'debris'
  /** Which pathogen it swallowed, so it can be drawn inside. Not set for debris. */
  pathogenDefId?: string
  secondsLeft: number
  /** What secondsLeft started at, so the render can show how far along it is. */
  totalSeconds: number
  /** Energy paid out when the meal is finished. */
  reward: number
}

export interface ImmuneCell {
  id: number
  /** Which ImmuneCellDef in content/cells.ts this is. */
  defId: string
  x: number
  y: number
  /** Which way it faces, in radians. The pear points where it is going. */
  angle: number
  alive: boolean
  /** Seconds since it arrived, for cells that die of old age. */
  ageSeconds: number
  /** Seconds until it picks a new direction to wander in. */
  wanderIn: number
  /**
   * Seconds until it can throw another granule. Sits at 0 when it is loaded and
   * waiting for something to come into range. Unused by cells with no granules.
   */
  fireIn: number
  /** Set while it is eating. It stops moving and hunting until it's done. */
  meal: Meal | null
  /**
   * What the player has told it to do, or null when it is doing its own thing,
   * which is most of the time. Either way it goes back to hunting on its own
   * the moment the order is done with.
   */
  order: Order | null
  /**
   * When it died, in level seconds, or null while it is alive. Dead cells stay
   * in the list so the player can see them go — a cell that vanishes between
   * one frame and the next just looks like a bug.
   */
  diedAtSeconds: number | null
}

export interface ImmuneCellContext {
  /** Seconds this tick. */
  dt: number
  /** How long the level has been running, for recording when a cell died. */
  elapsedSeconds: number
  bodyCells: BodyCell[]
  pathogens: Pathogen[]
  bounds: Size
  rng: Rng
  /** Called when a meal finishes, so the energy can be paid out. */
  onMealFinished: (cell: ImmuneCell, meal: Meal) => void
  /** Called when a cell throws a granule, with the direction it threw it. */
  onGranuleThrown: (cell: ImmuneCell, def: ImmuneCellDef, angle: number) => void
}

/**
 * One tick of an immune cell's life.
 *
 * A macrophage hunts by sight, exactly like a bacterium does: anything within
 * vision range and it goes straight for it, otherwise it wanders. Pathogens come
 * first and dead body cells second — an infection won't wait, the mess will.
 *
 * Swallowing takes time, and while it is swallowing the cell does nothing else.
 * That is the whole balance of the macrophage: one of them is a good earner, but
 * a swarm walks straight past one that is busy.
 *
 * A player order sits above all of that but only until it is carried out, which
 * is what GAME_DESIGN.md §4 means by a temporary override.
 */
export function updateImmuneCell(
  cell: ImmuneCell,
  def: ImmuneCellDef,
  ctx: ImmuneCellContext,
): void {
  cell.ageSeconds += ctx.dt

  // Old age. Macrophages live for months, so they have no lifespan at all and
  // this never fires for them; neutrophils will die here all the time.
  if (def.lifespanSeconds !== undefined && cell.ageSeconds >= def.lifespanSeconds) {
    killImmuneCell(cell, ctx.elapsedSeconds)
    return
  }

  // Degranulation is a reflex, not something the cell decides to do, so it
  // happens whatever else is going on — mid-meal, mid-order, anything. That is
  // what makes a neutrophil's four slow seconds of digesting bearable.
  throwGranules(cell, def, ctx)

  if (cell.meal) {
    cell.meal.secondsLeft -= ctx.dt
    if (cell.meal.secondsLeft > 0) return

    // Finished. The energy arrives when the meal is done, not when it started.
    const meal = cell.meal
    cell.meal = null
    ctx.onMealFinished(cell, meal)
    return
  }

  const order = cell.order

  // Sent after one particular pathogen: it goes for that one and nothing else,
  // however many easier ones it walks past, until either it eats it or someone
  // else does. Then the order is done and it hunts normally again.
  if (order?.kind === 'chase') {
    const quarry = ctx.pathogens.find(
      (pathogen) => pathogen.id === order.pathogenId && pathogen.alive,
    )

    if (quarry) {
      cell.angle = Math.atan2(quarry.y - cell.y, quarry.x - cell.x)

      if (withinReach(cell, def, quarry)) {
        swallow(cell, def, quarry)
        cell.order = null
        return
      }

      crawl(cell, def, ctx)
      return
    }

    // It died on the way — eaten by someone else, most likely.
    cell.order = null
    cell.wanderIn = def.wanderChangeSeconds
  }

  // Told to go somewhere: it goes, and nothing distracts it on the way. Once it
  // arrives the order is forgotten and it picks up hunting again immediately —
  // this same tick, since the code below runs on.
  //
  // "Arrived" is generous on purpose. Once the destination is close enough to
  // see, a pathogen in sight ends the order there and then: you sent it to the
  // fight, so let it fight rather than stand on an exact spot with a bacterium
  // under its nose. Far from where it was sent it still ignores everything, so
  // crossing the map is not a series of distractions.
  if (order?.kind === 'move') {
    const toDestination = distance(cell.x, cell.y, order.x, order.y)
    const closeEnough =
      // Somewhere that isn't a real place counts as arrived, so a bad order can
      // never walk a cell off into nowhere.
      !Number.isFinite(toDestination) ||
      toDestination <= ARRIVED_WITHIN ||
      (toDestination <= def.visionRange &&
        nearestPathogenInRange(cell, def.visionRange, ctx.pathogens) !== undefined)

    if (!closeEnough) {
      cell.angle = Math.atan2(order.y - cell.y, order.x - cell.x)
      crawl(cell, def, ctx)
      return
    }

    cell.order = null
    // Wander off in a fresh direction rather than continuing the way it came.
    cell.wanderIn = def.wanderChangeSeconds
  }

  const prey = nearestPathogenInRange(cell, def.visionRange, ctx.pathogens)
  if (prey) {
    cell.angle = Math.atan2(prey.y - cell.y, prey.x - cell.x)

    if (withinReach(cell, def, prey)) {
      swallow(cell, def, prey)
      return
    }

    crawl(cell, def, ctx)
    return
  }

  // Clearing up is the macrophage's job. A cell with no clean-up stats — a
  // neutrophil — walks straight past the mess.
  if (def.engulfDebrisSeconds !== undefined) {
    const husk = nearestDebrisInRange(cell, def.visionRange, ctx.bodyCells)

    if (husk) {
      cell.angle = Math.atan2(husk.y - cell.y, husk.x - cell.x)

      const reach = (def.radius + husk.radius) * DEBRIS_REACH

      if (distance(cell.x, cell.y, husk.x, husk.y) <= reach) {
        // Cleared. The outline goes now, so no other macrophage comes for it.
        husk.debris = false
        cell.meal = {
          kind: 'debris',
          secondsLeft: def.engulfDebrisSeconds,
          totalSeconds: def.engulfDebrisSeconds,
          reward: def.energyPerDebris ?? 0,
        }
        return
      }

      crawl(cell, def, ctx)
      return
    }
  }

  cell.wanderIn -= ctx.dt
  if (cell.wanderIn <= 0) {
    cell.angle = ctx.rng() * Math.PI * 2
    cell.wanderIn = def.wanderChangeSeconds
  }

  crawl(cell, def, ctx)
}

/**
 * Throws a granule at the nearest pathogen in range, if the cell has granules
 * and one is ready.
 *
 * With nothing to aim at, the timer sits at zero rather than counting down into
 * the negatives: a neutrophil that has been waiting around is loaded, and fires
 * the moment something comes into view.
 */
function throwGranules(cell: ImmuneCell, def: ImmuneCellDef, ctx: ImmuneCellContext): void {
  if (!def.granules) return

  if (cell.fireIn > 0) {
    cell.fireIn -= ctx.dt
    return
  }

  const target = nearestPathogenInRange(cell, def.granules.range, ctx.pathogens)
  if (!target) {
    cell.fireIn = 0
    return
  }

  cell.fireIn = def.granules.everySeconds
  ctx.onGranuleThrown(cell, def, Math.atan2(target.y - cell.y, target.x - cell.x))
}

/** Is the cell close enough to swallow this pathogen? */
function withinReach(cell: ImmuneCell, def: ImmuneCellDef, prey: Pathogen): boolean {
  const preyDef = findPathogen(prey.defId)
  const reach = def.radius * PATHOGEN_REACH + (preyDef?.radius ?? 0)

  return distance(cell.x, cell.y, prey.x, prey.y) <= reach
}

/**
 * Swallowed whole. It is inside the cell now, so it stops being a problem
 * immediately even though digesting it takes a while.
 */
function swallow(cell: ImmuneCell, def: ImmuneCellDef, prey: Pathogen): void {
  prey.alive = false

  cell.meal = {
    kind: 'pathogen',
    pathogenDefId: prey.defId,
    secondsLeft: def.engulfPathogenSeconds,
    totalSeconds: def.engulfPathogenSeconds,
    reward: def.energyPerPathogen,
  }
}

/**
 * Kills a cell, remembering when so it can be drawn fading away rather than
 * blinking out of existence. Everything that kills an immune cell goes through
 * here — old age here, starvation over in world.ts.
 */
export function killImmuneCell(cell: ImmuneCell, elapsedSeconds: number): void {
  cell.alive = false
  cell.diedAtSeconds = elapsedSeconds
  cell.order = null
  cell.meal = null
}

/**
 * Crawl forwards, bouncing off the edges of the tissue.
 *
 * Moving through a body cell is allowed but slow — squeezing through tissue is
 * what white blood cells really do, and it means nothing ever gets hard-blocked,
 * so "walk towards the nearest bacterium" needs no pathfinding at all.
 */
function crawl(cell: ImmuneCell, def: ImmuneCellDef, ctx: ImmuneCellContext): void {
  const step = def.speed * ctx.dt
  const edge = def.radius

  let x = cell.x + Math.cos(cell.angle) * step
  let y = cell.y + Math.sin(cell.angle) * step

  if (touchesLivingBodyCell(x, y, def.radius, ctx.bodyCells)) {
    const squeezed = step * balance.squeezeSpeedMultiplier
    x = cell.x + Math.cos(cell.angle) * squeezed
    y = cell.y + Math.sin(cell.angle) * squeezed
  }

  if (x < edge || x > ctx.bounds.width - edge) {
    cell.angle = Math.PI - cell.angle
    x = clamp(x, edge, ctx.bounds.width - edge)
  }
  if (y < edge || y > ctx.bounds.height - edge) {
    cell.angle = -cell.angle
    y = clamp(y, edge, ctx.bounds.height - edge)
  }

  cell.x = x
  cell.y = y
}

/**
 * Immune cells are solid, so they shove each other apart instead of stacking up
 * into one blob. Run once per tick, after they have all moved.
 */
export function separateImmuneCells(cells: ImmuneCell[], bounds: Size): void {
  if (!balance.immuneCellsBlockEachOther) return

  for (let i = 0; i < cells.length; i++) {
    const a = cells[i]
    if (!a.alive) continue

    const aDef = findImmuneCell(a.defId)
    if (!aDef) continue

    for (let j = i + 1; j < cells.length; j++) {
      const b = cells[j]
      if (!b.alive) continue

      const bDef = findImmuneCell(b.defId)
      if (!bDef) continue

      let dx = b.x - a.x
      let dy = b.y - a.y
      let gap = Math.hypot(dx, dy)

      // Exactly on top of each other: pick an arbitrary direction.
      if (gap === 0) {
        dx = 1
        dy = 0
        gap = 1
      }

      const minGap = aDef.radius + bDef.radius
      if (gap >= minGap) continue

      const push = (minGap - gap) / 2
      nudge(a, aDef, (-dx / gap) * push, (-dy / gap) * push, bounds)
      nudge(b, bDef, (dx / gap) * push, (dy / gap) * push, bounds)
    }
  }
}

function nudge(
  cell: ImmuneCell,
  def: ImmuneCellDef,
  dx: number,
  dy: number,
  bounds: Size,
): void {
  cell.x = clamp(cell.x + dx, def.radius, bounds.width - def.radius)
  cell.y = clamp(cell.y + dy, def.radius, bounds.height - def.radius)
}

/** Is any living body cell in the way at (x, y)? Then we are squeezing. */
function touchesLivingBodyCell(
  x: number,
  y: number,
  radius: number,
  bodyCells: BodyCell[],
): boolean {
  for (const bodyCell of bodyCells) {
    if (!bodyCell.alive) continue
    if (distance(x, y, bodyCell.x, bodyCell.y) < radius + bodyCell.radius) return true
  }

  return false
}

function nearestPathogenInRange(
  cell: ImmuneCell,
  range: number,
  pathogens: Pathogen[],
): Pathogen | undefined {
  let best: Pathogen | undefined
  let bestDistance = range

  for (const pathogen of pathogens) {
    if (!pathogen.alive) continue

    const away = distance(cell.x, cell.y, pathogen.x, pathogen.y)
    if (away < bestDistance) {
      bestDistance = away
      best = pathogen
    }
  }

  return best
}

/** The outline a dead body cell left behind, waiting to be cleared. */
function nearestDebrisInRange(
  cell: ImmuneCell,
  range: number,
  bodyCells: BodyCell[],
): BodyCell | undefined {
  let best: BodyCell | undefined
  let bestDistance = range

  for (const bodyCell of bodyCells) {
    if (!bodyCell.debris) continue

    const away = distance(cell.x, cell.y, bodyCell.x, bodyCell.y)
    if (away < bestDistance) {
      bestDistance = away
      best = bodyCell
    }
  }

  return best
}
