import { cocciRadius, type PathogenDef, type SpiralDef } from '../content/pathogens'
import { clamp, distance, type Size, type Vec2 } from './geometry'
import type { ImmuneCell } from './immuneCells'
import { isTrapped, type Net } from './nets'
import type { Rng } from './rng'
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
 * Bacteria overlap everything — each other, body cells, the vessels — so there
 * is no collision to resolve here. They just swim.
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

  const target = nearestBodyCellInRange(ctx.bodyCells, pathogen, def.visionRange)
  const biting =
    target !== undefined &&
    distance(pathogen.x, pathogen.y, target.x, target.y) <=
      target.radius + pathogenRadius(pathogen, def)

  // Fear or hunger, for the colours that have the choice. A green rod is a
  // coward and drops its meal to run; a green cocci crawls, so running could
  // only ever delay things — it commits the moment its teeth are in and carries
  // on eating while you take it apart.
  const hunter = nearestHunterInRange(ctx.immuneCells, pathogen, def.fleeRange ?? 0)

  if (hunter && (!biting || def.fleeWhileEating)) {
    pathogen.angle = Math.atan2(pathogen.y - hunter.y, pathogen.x - hunter.x)
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
 * whichever body cell it is on top of, darting or resting.
 *
 * Only ever one cell at a time, the one it is most squarely over, so a spiral
 * straddling two cells hits exactly as hard as the rod of its colour and not
 * twice as hard.
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

/** The living body cell this is touching whose middle is nearest its own, if any. */
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
    if (away <= cell.radius + radius && away < bestDistance) {
      bestDistance = away
      best = cell
    }
  }

  return best
}

/** Move forwards, bouncing off the edges of the tissue. */
function swim(pathogen: Pathogen, def: PathogenDef, ctx: PathogenContext): void {
  const step = def.speed * ctx.speedFactorAt(pathogen.x, pathogen.y) * ctx.dt
  const edge = pathogenRadius(pathogen, def)

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
 * The immune cell a nervous bacterium is most worried about: the nearest living
 * one inside `range`, or nothing at all when `range` is 0, which is every
 * colour up to red.
 *
 * A cell part-way through digesting still counts. It can't chase and it can't
 * bite, but a bacterium has no way of knowing that, and a green that parked
 * itself against a full macrophage would read as a bug rather than as nerve.
 */
function nearestHunterInRange(
  immuneCells: ImmuneCell[],
  pathogen: Pathogen,
  range: number,
): ImmuneCell | undefined {
  if (range <= 0) return undefined

  let best: ImmuneCell | undefined
  let bestDistance = range

  for (const cell of immuneCells) {
    if (!cell.alive) continue

    const away = distance(pathogen.x, pathogen.y, cell.x, cell.y)
    if (away < bestDistance) {
      bestDistance = away
      best = cell
    }
  }

  return best
}

function nearestBodyCellInRange(
  bodyCells: BodyCell[],
  pathogen: Pathogen,
  range: number,
): BodyCell | undefined {
  let best: BodyCell | undefined
  let bestDistance = range

  for (const cell of bodyCells) {
    if (!cell.alive) continue

    const away = distance(pathogen.x, pathogen.y, cell.x, cell.y)
    if (away < bestDistance) {
      bestDistance = away
      best = cell
    }
  }

  return best
}
