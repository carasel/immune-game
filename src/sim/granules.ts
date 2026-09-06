import { findPathogen } from '../content/pathogens'
import { distance, type Size } from './geometry'
import { damagePathogen, loseBall, pathogenRadius, type Pathogen } from './pathogens'
import type { BodyCell } from './tissue'

/**
 * A blob of poison thrown by a neutrophil.
 *
 * It flies in a straight line until it hits something or the poison is spent.
 * Whatever it hits first takes the damage — a bacterium dies, one of your own
 * body cells is hurt — and the granule is gone either way.
 *
 * It carries its own numbers rather than looking them up from the cell that
 * threw it, so a granule outlives its neutrophil quite happily. Which matters:
 * neutrophils die all the time.
 */
export interface Granule {
  id: number
  x: number
  y: number
  /** Which way it is flying, in radians. */
  angle: number
  speed: number
  /** Pixels left before the poison is spent. */
  rangeLeft: number
  damageToPathogens: number
  damageToBodyCells: number
  alive: boolean
}

/** How big a granule is for the purpose of hitting things. */
const GRANULE_RADIUS = 4

/**
 * Close enough to zero to count as dead. Damage that ought to divide a body
 * cell exactly — six hits of a sixth — lands a hair above zero in floating
 * point, and a body cell surviving on 0.0000000000000001 health is nonsense.
 */
const DEAD_ENOUGH = 1e-9

export interface GranuleContext {
  /** Seconds this tick. */
  dt: number
  bodyCells: BodyCell[]
  pathogens: Pathogen[]
  bounds: Size
  /** Called once for each body cell a granule finishes off. */
  onBodyCellDied: (cell: BodyCell) => void
}

/**
 * One tick of a granule's flight.
 *
 * Pathogens are checked before body cells, so a bacterium sitting on top of a
 * body cell takes the hit — which is what you were aiming at.
 */
export function updateGranule(granule: Granule, ctx: GranuleContext): void {
  const step = granule.speed * ctx.dt

  granule.x += Math.cos(granule.angle) * step
  granule.y += Math.sin(granule.angle) * step
  granule.rangeLeft -= step

  const strayed =
    granule.x < 0 ||
    granule.y < 0 ||
    granule.x > ctx.bounds.width ||
    granule.y > ctx.bounds.height

  if (granule.rangeLeft <= 0 || strayed) {
    granule.alive = false
    return
  }

  const pathogen = pathogenHit(granule, ctx.pathogens)
  if (pathogen) {
    const def = findPathogen(pathogen.defId)

    if (def?.shape === 'cocci') {
      // A clump loses one whole ball to a hit like this, however much life that
      // ball had left — but only ever the one. Emptying a neutrophil into a
      // clump of four takes four granules, and the other three balls are still
      // eating your tissue the whole time.
      loseBall(pathogen, def)
    } else if (def) {
      damagePathogen(pathogen, def, granule.damageToPathogens)
    }

    granule.alive = false
    return
  }

  const bodyCell = bodyCellHit(granule, ctx.bodyCells)
  if (!bodyCell) return

  bodyCell.health -= granule.damageToBodyCells
  if (bodyCell.health <= DEAD_ENOUGH) {
    bodyCell.health = 0
    bodyCell.alive = false
    // Killed by your own side, but it still leaves a mess and still costs you.
    bodyCell.debris = true
    ctx.onBodyCellDied(bodyCell)
  }

  granule.alive = false
}

function pathogenHit(granule: Granule, pathogens: Pathogen[]): Pathogen | undefined {
  for (const pathogen of pathogens) {
    if (!pathogen.alive) continue

    const def = findPathogen(pathogen.defId)
    if (!def) continue

    const reach = pathogenRadius(pathogen, def) + GRANULE_RADIUS

    if (distance(granule.x, granule.y, pathogen.x, pathogen.y) <= reach) {
      return pathogen
    }
  }

  return undefined
}

function bodyCellHit(granule: Granule, bodyCells: BodyCell[]): BodyCell | undefined {
  for (const cell of bodyCells) {
    if (!cell.alive) continue

    if (distance(granule.x, granule.y, cell.x, cell.y) <= cell.radius + GRANULE_RADIUS) {
      return cell
    }
  }

  return undefined
}
