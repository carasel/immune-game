import { balance } from '../content/balance'
import { cocciRadius, type PathogenDef, type SpiralDef } from '../content/pathogens'
import { tissueSpeedFactor, TOUCHING_SLACK } from './crowding'
import { clamp, distance, type Size, type Vec2 } from './geometry'
import type { ImmuneCell } from './immuneCells'
import { isTrapped, type Net } from './nets'
import type { Rng } from './rng'
import { stickyTarget } from './targeting'
import type { BodyCell } from './tissue'

export interface Pathogen {
  id: number
  /** Which PathogenDef in content/pathogens.ts this is. */
  defId: string
  x: number
  y: number
  /** Which way it is facing, in radians. Rods swim along their long axis. */
  angle: number
  /**
   * How much life the ball currently being worked on has left. A rod is one
   * single body, so for a rod this is simply its health.
   */
  health: number
  /**
   * How many balls it still has. A rod is always 1, and loses that 1 when it
   * dies. A cocci starts at its def's `balls` and comes apart from there.
   */
  balls: number
  alive: boolean
  /** Seconds until it splits in two. */
  divideIn: number
  /**
   * Seconds until it picks a new direction to wander in. For a spiral, seconds
   * until the dart or rest it is in now ends.
   */
  wanderIn: number
  /**
   * The body cell it is going for, or null. Remembered so it sticks with one
   * instead of flickering between two the same distance away.
   */
  targetId: number | null
  /**
   * Whether it is running away right now. Once it starts it keeps going until
   * it is well clear — see `balance.stopFleeingMargin`.
   */
  fleeing: boolean
  /** Spirals only: sitting still between darts. Anything else leaves it out. */
  resting?: boolean
}

export interface PathogenContext {
  /** Seconds this tick. */
  dt: number
  bodyCells: BodyCell[]
  /** What a fleeing pathogen is running from. Ignored by everything else. */
  immuneCells: ImmuneCell[]
  bounds: Size
  rng: Rng
  /** Webs on the ground. Anything inside one is stuck fast. */
  nets: Net[]
  /** Called once for each body cell that dies, so energy can be charged. */
  onBodyCellDied: (cell: BodyCell) => void
  /** How much faster or slower it swims at (x, y). 1 is normal; inflammation slows it. */
  speedFactorAt: (x: number, y: number) => number
  /** Where it really ends up moving from `from` to `to`, with anything solid in the way. */
  steer: (from: Vec2, to: Vec2, radius: number) => Vec2
}

/**
 * How big this pathogen is right now.
 *
 * A rod is always the size its def says. A cocci is the size of the clump it
 * has left, so knocking balls off really does make it a smaller target — which
 * is why a half-eaten clump is fiddlier to finish than it was to start.
 */
export function pathogenRadius(pathogen: Pathogen, def: PathogenDef): number {
  if (def.shape !== 'cocci') return def.radius

  return cocciRadius(pathogen.balls, def.ballRadius)
}

/**
 * Damage spread over time, the way a NET poisons what it holds. It wears the
 * current ball down, and when that ball is finished it comes off and the next
 * one takes over.
 *
 * Damage never carries over from one ball to the next: each ball has to be
 * worn down on its own. That is what "only one ball at a time" means for
 * anything that does damage gradually.
 */
export function damagePathogen(pathogen: Pathogen, def: PathogenDef, amount: number): void {
  pathogen.health -= amount
  if (pathogen.health > 0) return

  loseBall(pathogen, def)
}

/**
 * One whole ball comes off, however much life was left in it. This is what a
 * macrophage's bite and a neutrophil's granule both do: a clean hit takes a
 * ball, not a slice of one.
 *
 * A rod has a single ball, so the same hit finishes it outright.
 */
export function loseBall(pathogen: Pathogen, def: PathogenDef): void {
  pathogen.balls--

  if (pathogen.balls <= 0) {
    pathogen.balls = 0
    pathogen.health = 0
    pathogen.alive = false
    return
  }

  // The next ball is untouched, whatever was done to the one that just went.
  pathogen.health = def.health
}

/**
 * One tick of a pathogen's life.
 *
 * Bacteria hunt by sight: if a living body cell is within vision range they go
 * straight for it, and eat into it once they touch. Otherwise they wander.
 * From green up they also watch their own backs — see `fleeRange`.
 *
 * Tissue is in a bacterium's way just like it is for an immune cell: it pushes
 * body cells aside, or squeezes past ones that won't give. Bacteria also crowd
 * each other, but that is sorted out once they have all moved — see
 * crowding.ts.
 */
export function updatePathogen(
  pathogen: Pathogen,
  def: PathogenDef,
  ctx: PathogenContext,
): void {
  // Stuck to a web: it can't swim and it can't reach anything to eat. All it
  // can do is sit there being poisoned, which is exactly what a NET is for.
  if (isTrapped(pathogen, ctx.nets)) return

  if (def.shape === 'spiral') {
    updateSpiral(pathogen, def, ctx)
    return
  }

  const target = stickyTarget(
    pathogen,
    def.visionRange,
    ctx.bodyCells,
    isAlive,
    pathogen.targetId,
  )
  pathogen.targetId = target?.id ?? null
  const biting =
    target !== undefined &&
    distance(pathogen.x, pathogen.y, target.x, target.y) <=
      target.radius + pathogenRadius(pathogen, def) + TOUCHING_SLACK

  // Fear or hunger, for the colours that have the choice. A green rod is a
  // coward and drops its meal to run; a green cocci crawls, so running could
  // only ever delay things — it commits the moment its teeth are in and carries
  // on eating while you take it apart.
  //
  // Already running, it looks further: it only calms down once it is well
  // clear, not the moment it steps over the line it panicked at.
  const calmRange = (def.fleeRange ?? 0) * (1 + balance.stopFleeingMargin)
  const fleeRange = pathogen.fleeing ? calmRange : (def.fleeRange ?? 0)
  const hunters = huntersInRange(ctx.immuneCells, pathogen, fleeRange, calmRange)
  pathogen.fleeing = hunters !== undefined && (!biting || def.fleeWhileEating === true)

  if (hunters && pathogen.fleeing) {
    // Straight away from the middle of them all. Exactly on top of the middle
    // — boxed in evenly on every side — it keeps going the way it was.
    if (hunters.x !== pathogen.x || hunters.y !== pathogen.y) {
      pathogen.angle = Math.atan2(pathogen.y - hunters.y, pathogen.x - hunters.x)
    }
    swim(pathogen, def, ctx)
    return
  }

  if (target) {
    pathogen.angle = Math.atan2(target.y - pathogen.y, target.x - pathogen.x)

    if (biting) {
      // Close enough to eat into it. Stop moving and do damage.
      hurtBodyCell(target, def, ctx)
      return
    }

    swim(pathogen, def, ctx)
    return
  }

  pathogen.wanderIn -= ctx.dt
  if (pathogen.wanderIn <= 0) {
    pathogen.angle = ctx.rng() * Math.PI * 2
    pathogen.wanderIn = def.wanderChangeSeconds
  }

  swim(pathogen, def, ctx)
}

/**
 * One tick of a spiral. It never looks for anything: it darts in a random
 * direction, sits still for a rest, then darts off in a new one, and hurts
 * whichever body cell it is touching, darting or resting.
 *
 * Only ever one cell at a time, the one it is most squarely against, so a
 * spiral wedged between two cells hits exactly as hard as the rod of its colour
 * and not twice as hard.
 */
function updateSpiral(
  pathogen: Pathogen,
  def: SpiralDef,
  ctx: PathogenContext,
): void {
  pathogen.wanderIn -= ctx.dt

  if (pathogen.wanderIn <= 0) {
    if (pathogen.resting) {
      pathogen.resting = false
      pathogen.angle = ctx.rng() * Math.PI * 2
      pathogen.wanderIn += def.dartSeconds
    } else {
      pathogen.resting = true
      pathogen.wanderIn += def.restSeconds
    }
  }

  const under = bodyCellUnder(ctx.bodyCells, pathogen, def.radius)
  if (under) hurtBodyCell(under, def, ctx)

  if (!pathogen.resting) swim(pathogen, def, ctx)
}

/** Eat into a body cell for one tick, and see to it if that finishes it off. */
function hurtBodyCell(cell: BodyCell, def: PathogenDef, ctx: PathogenContext): void {
  cell.health -= def.damagePerSecond * ctx.dt
  if (cell.health > 0) return

  cell.health = 0
  cell.alive = false
  // It leaves its outline behind for a macrophage to clear away.
  cell.debris = true
  ctx.onBodyCellDied(cell)
}

/**
 * The living body cell this is touching whose middle is nearest its own, if any.
 * Pushing leaves things exactly touching, so this allows `TOUCHING_SLACK` over,
 * the same as a rod biting.
 */
function bodyCellUnder(
  bodyCells: BodyCell[],
  pathogen: Pathogen,
  radius: number,
): BodyCell | undefined {
  let best: BodyCell | undefined
  let bestDistance = Infinity

  for (const cell of bodyCells) {
    if (!cell.alive) continue

    const away = distance(pathogen.x, pathogen.y, cell.x, cell.y)
    if (away <= cell.radius + radius + TOUCHING_SLACK && away < bestDistance) {
      bestDistance = away
      best = cell
    }
  }

  return best
}

/** Move forwards, pushing through the tissue and bouncing off the edges of it. */
function swim(pathogen: Pathogen, def: PathogenDef, ctx: PathogenContext): void {
  const edge = pathogenRadius(pathogen, def)
  let step = def.speed * ctx.speedFactorAt(pathogen.x, pathogen.y) * ctx.dt

  const ahead = {
    x: pathogen.x + Math.cos(pathogen.angle) * step,
    y: pathogen.y + Math.sin(pathogen.angle) * step,
  }
  step *= tissueSpeedFactor(ctx.bodyCells, pathogen, ahead, edge)

  let x = pathogen.x + Math.cos(pathogen.angle) * step
  let y = pathogen.y + Math.sin(pathogen.angle) * step

  if (x < edge || x > ctx.bounds.width - edge) {
    pathogen.angle = Math.PI - pathogen.angle
    x = clamp(x, edge, ctx.bounds.width - edge)
  }
  if (y < edge || y > ctx.bounds.height - edge) {
    pathogen.angle = -pathogen.angle
    y = clamp(y, edge, ctx.bounds.height - edge)
  }

  const steered = ctx.steer(pathogen, { x, y }, edge)
  pathogen.x = steered.x
  pathogen.y = steered.y
}

/**
 * What a nervous bacterium is running from: the middle of every living immune
 * cell inside `range`, or nothing at all when none are there or `range` is 0,
 * which is every colour up to red.
 *
 * The middle of them all rather than the nearest one, so a bacterium between
 * two hunters the same distance away doesn't flick back and forth between
 * running from one and running from the other.
 *
 * Closer hunters count for more, fading to nothing at `fadeRange`. Counted
 * equally, a hunter drifting in and out over the edge of the range would make
 * the middle jump about, and the bacterium would jerk round every time it did.
 *
 * A cell part-way through digesting still counts. It can't chase and it can't
 * bite, but a bacterium has no way of knowing that, and a green that parked
 * itself against a full macrophage would read as a bug rather than as nerve.
 */
function huntersInRange(
  immuneCells: ImmuneCell[],
  pathogen: Pathogen,
  range: number,
  fadeRange: number,
): Vec2 | undefined {
  if (range <= 0) return undefined

  let x = 0
  let y = 0
  let weight = 0
  let count = 0

  for (const cell of immuneCells) {
    if (!cell.alive) continue

    const away = distance(pathogen.x, pathogen.y, cell.x, cell.y)
    if (away >= range) continue
    count++

    const w = 1 - away / fadeRange
    x += cell.x * w
    y += cell.y * w
    weight += w
  }

  if (count === 0) return undefined
  // In range but every one of them right on the fade line: nothing to tell it
  // which way, so it runs straight on.
  if (weight <= 0) return { x: pathogen.x, y: pathogen.y }

  return { x: x / weight, y: y / weight }
}

function isAlive(bodyCell: BodyCell): boolean {
  return bodyCell.alive
}
