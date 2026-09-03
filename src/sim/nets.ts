import { findPathogen } from '../content/pathogens'
import { distance } from './geometry'
import { damagePathogen, type Pathogen } from './pathogens'
import type { BodyCell } from './tissue'

/**
 * A neutrophil extracellular trap: the web a neutrophil leaves behind when it
 * tears itself apart.
 *
 * It sits where the cell died, holding any bacteria inside it still and
 * poisoning them, until it breaks down. The damage to your own tissue was done
 * the moment it landed — see `formNet` over in world.ts — so a net that is
 * already down is only dangerous to the things trapped in it.
 */
export interface Net {
  id: number
  x: number
  y: number
  radius: number
  /** Seconds until it breaks down. */
  secondsLeft: number
  /** What it started with, so the render can show it thinning out. */
  totalSeconds: number
  damagePerSecondToPathogens: number
  alive: boolean
}

export interface NetContext {
  /** Seconds this tick. */
  dt: number
  pathogens: Pathogen[]
}

/** One tick of a net: poison what it holds, and rot a little. */
export function updateNet(net: Net, ctx: NetContext): void {
  net.secondsLeft -= ctx.dt

  if (net.secondsLeft <= 0) {
    net.alive = false
    return
  }

  for (const pathogen of ctx.pathogens) {
    if (!pathogen.alive) continue
    if (distance(net.x, net.y, pathogen.x, pathogen.y) > net.radius) continue

    const def = findPathogen(pathogen.defId)
    if (!def) continue

    // Poison seeps in gradually, so a cocci held in a web comes apart one ball
    // at a time — a slow, certain way to take a clump down that a macrophage
    // would have to make several trips for.
    damagePathogen(pathogen, def, net.damagePerSecondToPathogens * ctx.dt)
  }
}

/**
 * Is this pathogen held in a web? Trapped bacteria can neither move nor eat —
 * being stuck to a mesh of DNA is the whole point of it.
 */
export function isTrapped(pathogen: Pathogen, nets: Net[]): boolean {
  for (const net of nets) {
    if (!net.alive) continue
    if (distance(net.x, net.y, pathogen.x, pathogen.y) <= net.radius) return true
  }

  return false
}

/** The body cells a net smothers as it lands. Applied once, by the world. */
export function bodyCellsUnder(net: Net, bodyCells: BodyCell[]): BodyCell[] {
  return bodyCells.filter(
    (cell) => cell.alive && distance(net.x, net.y, cell.x, cell.y) <= net.radius,
  )
}
