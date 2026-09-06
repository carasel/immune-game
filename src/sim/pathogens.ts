import { cocciRadius, type PathogenDef } from '../content/pathogens'
import { clamp, distance, type Size } from './geometry'
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
  /** Seconds until it picks a new direction to wander in. */
  wanderIn: number
}

export interface PathogenContext {
  /** Seconds this tick. */
  dt: number
  bodyCells: BodyCell[]
  bounds: Size
  rng: Rng
  /** Webs on the ground. Anything inside one is stuck fast. */
  nets: Net[]
  /** Called once for each body cell that dies, so energy can be charged. */
  onBodyCellDied: (cell: BodyCell) => void
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

  const target = nearestBodyCellInRange(ctx.bodyCells, pathogen, def.visionRange)

  if (target) {
    const gap = distance(pathogen.x, pathogen.y, target.x, target.y)
    pathogen.angle = Math.atan2(target.y - pathogen.y, target.x - pathogen.x)

    if (gap <= target.radius + pathogenRadius(pathogen, def)) {
      // Close enough to eat into it. Stop moving and do damage.
      target.health -= def.damagePerSecond * ctx.dt

      if (target.health <= 0) {
        target.health = 0
        target.alive = false
        // It leaves its outline behind for a macrophage to clear away.
        target.debris = true
        ctx.onBodyCellDied(target)
      }
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

/** Move forwards, bouncing off the edges of the tissue. */
function swim(pathogen: Pathogen, def: PathogenDef, ctx: PathogenContext): void {
  const step = def.speed * ctx.dt
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

  pathogen.x = x
  pathogen.y = y
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
