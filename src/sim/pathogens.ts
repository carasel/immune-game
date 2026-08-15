import type { PathogenDef } from '../content/pathogens'
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
  health: number
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

    if (gap <= target.radius + def.radius) {
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
  const edge = def.radius

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
