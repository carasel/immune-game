import { inflammation as numbers } from '../content/inflammation'
import { findPathogen } from '../content/pathogens'
import { distance } from './geometry'
import { pathogenRadius, type Pathogen } from './pathogens'
import type { BodyCell } from './tissue'

/**
 * One inflamed patch of tissue: a circle the player put down.
 *
 * It lives while there is a fight in it. Put down somewhere quiet it waits a
 * few seconds for bacteria to turn up; once there are none in it, it calms
 * down, shrinking and weakening as it goes, and it swells straight back up if
 * more arrive before it has gone.
 */
export interface Inflammation {
  id: number
  x: number
  y: number
  /** How long it will still wait for bacteria before it starts to calm down. */
  graceLeft: number
  /** 0 at full strength, 1 once it has calmed down completely and is gone. */
  calmed: number
  alive: boolean
}

export interface InflammationContext {
  dt: number
  pathogens: Pathogen[]
  bodyCells: BodyCell[]
  onBodyCellDied: (cell: BodyCell) => void
  /** Does a circle this big here reach a splinter that is still in? */
  touchesSplinter: (x: number, y: number, radius: number) => boolean
}

/** 1 at full strength, falling to 0 as it calms down. Everything it does scales by this. */
export function strengthOf(patch: Inflammation): number {
  return 1 - patch.calmed
}

/** How big it is right now. It shrinks as it calms down. */
export function radiusOf(patch: Inflammation): number {
  const size = numbers.smallestFadingSize + (1 - numbers.smallestFadingSize) * strengthOf(patch)
  return numbers.radius * size
}

/**
 * How inflamed (x, y) is, from 0 to 1.
 *
 * Overlapping circles don't add up: inflamed is inflamed. Where two overlap
 * it is as inflamed as the stronger of the two, and no more.
 */
export function inflamedAt(patches: Inflammation[], x: number, y: number): number {
  let strongest = 0

  for (const patch of patches) {
    if (!patch.alive) continue
    if (distance(patch.x, patch.y, x, y) > radiusOf(patch)) continue
    strongest = Math.max(strongest, strengthOf(patch))
  }

  return strongest
}

/**
 * How much a speed is changed at (x, y): 1 outside every circle, `multiplier`
 * in the middle of one at full strength, and in between while it calms down.
 */
export function speedFactorAt(patches: Inflammation[], x: number, y: number, multiplier: number): number {
  const strength = inflamedAt(patches, x, y)
  return 1 + (multiplier - 1) * strength
}

/** One tick of one circle: is the fight still on, and how calm has it got? */
export function updateInflammation(patch: Inflammation, ctx: InflammationContext): void {
  // Something stuck in the tissue keeps it inflamed, bacteria or not.
  const onTheSplinter =
    numbers.splinterKeepsItGoing && ctx.touchesSplinter(patch.x, patch.y, radiusOf(patch))

  if (onTheSplinter || hasBacteriaIn(patch, ctx.pathogens)) {
    // The fight is on: no more waiting, and it swells back to full.
    patch.graceLeft = 0
    patch.calmed = Math.max(0, patch.calmed - ctx.dt / numbers.fadeSeconds)
    return
  }

  if (patch.graceLeft > 0) {
    patch.graceLeft -= ctx.dt
    return
  }

  patch.calmed += ctx.dt / numbers.fadeSeconds
  if (patch.calmed >= 1) {
    patch.calmed = 1
    patch.alive = false
  }
}

/**
 * Swelling hurts. Every living body cell inside any circle takes a little
 * damage, as much as the strongest circle it is in. Once per tick for all the
 * circles together, so overlapping ones don't hurt twice.
 */
export function hurtInflamedTissue(patches: Inflammation[], ctx: InflammationContext): void {
  if (!patches.some((patch) => patch.alive)) return

  for (const cell of ctx.bodyCells) {
    if (!cell.alive) continue

    const strength = inflamedAt(patches, cell.x, cell.y)
    if (strength <= 0) continue

    cell.health -= numbers.bodyCellDamagePerSecond * strength * ctx.dt
    if (cell.health > 0) continue

    cell.health = 0
    cell.alive = false
    cell.debris = true
    ctx.onBodyCellDied(cell)
  }
}

function hasBacteriaIn(patch: Inflammation, pathogens: Pathogen[]): boolean {
  const radius = radiusOf(patch)

  for (const pathogen of pathogens) {
    if (!pathogen.alive) continue

    const def = findPathogen(pathogen.defId)
    const reach = radius + (def ? pathogenRadius(pathogen, def) : 0)
    if (distance(patch.x, patch.y, pathogen.x, pathogen.y) <= reach) return true
  }

  return false
}
