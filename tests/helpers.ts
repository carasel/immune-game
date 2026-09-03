import { theCut, TISSUE_VIEW, type LevelDef, type StartingCellDef } from '../src/content/levels'
import { findPathogen } from '../src/content/pathogens'
import type { ImmuneCell } from '../src/sim/immuneCells'
import type { Pathogen } from '../src/sim/pathogens'
import { TICKS_PER_SECOND, World } from '../src/sim/world'

/**
 * Shared bits and pieces for the tests.
 *
 * The golden rule in here: never change the real level. `theCut` is a single
 * shared object, so a test that edited it would quietly change every test after
 * it. `testLevel` always hands back a copy.
 */

/**
 * Level 1, copied, with no waves unless you ask for them — most tests want to
 * put a specific bacterium in a specific place rather than have four waves of
 * them wandering about.
 */
export function testLevel(overrides: Partial<LevelDef> = {}): LevelDef {
  return { ...theCut, waves: [], ...overrides }
}

/** A world on a quiet copy of level 1. */
export function testWorld(overrides: Partial<LevelDef> = {}): World {
  return new World(testLevel(overrides), TISSUE_VIEW)
}

/** A world with the immune cells you name, and nothing else alive. */
export function worldWith(startingCells: StartingCellDef[]): World {
  return testWorld({ startingCells })
}

export const bounds = TISSUE_VIEW

/** Runs the simulation for a number of seconds. */
export function run(world: World, seconds: number): void {
  const ticks = Math.round(seconds * TICKS_PER_SECOND)
  for (let tick = 0; tick < ticks; tick++) world.step()
}

/**
 * Runs until `done` is true, or gives up after `seconds`. Returns how long it
 * took, or null if it never happened — so a test can assert on both.
 */
export function runUntil(
  world: World,
  seconds: number,
  done: (world: World) => boolean,
): number | null {
  const ticks = Math.round(seconds * TICKS_PER_SECOND)

  for (let tick = 0; tick < ticks; tick++) {
    world.step()
    if (done(world)) return world.elapsedSeconds
  }

  return null
}

/** Kills every body cell but the first, so only starvation can end the level. */
export function stripTissue(world: World, keep = 1): void {
  for (const cell of world.bodyCells.slice(keep)) {
    cell.alive = false
    cell.health = 0
    cell.debris = false
  }
}

/**
 * Turns some body cells into the husks a macrophage clears up.
 *
 * Pass `near` and it picks the ones closest to that spot rather than the first
 * in the list. Worth doing whenever a test cares that a cell can see the mess:
 * where the tissue happened to put body cell 0 is the tissue's business, and it
 * moves the moment anything about the level changes.
 */
export function leaveDebris(
  world: World,
  count: number,
  near?: { x: number; y: number },
): void {
  const cells = world.bodyCells.slice()
  if (near) cells.sort((a, b) => gap(a, near) - gap(b, near))

  for (const cell of cells.slice(0, count)) {
    cell.alive = false
    cell.health = 0
    cell.debris = true
  }
}

/**
 * Drops a bacterium at an exact spot, with division and wandering switched off.
 * Blue rods unless you name something else — `placeBacterium(world, x, y,
 * 'blue-cocci')` puts a whole clump there.
 */
export function placeBacterium(
  world: World,
  x: number,
  y: number,
  defId = 'blue-bacteria',
): Pathogen {
  const def = findPathogen(defId)
  if (!def) throw new Error(`no pathogen called ${defId}`)

  const bacterium: Pathogen = {
    id: 90000 + world.pathogens.length,
    defId,
    x,
    y,
    angle: 0,
    health: def.health,
    balls: def.balls,
    alive: true,
    // Far enough away that neither fires during a test.
    divideIn: Number.MAX_SAFE_INTEGER,
    wanderIn: Number.MAX_SAFE_INTEGER,
  }

  world.pathogens.push(bacterium)
  return bacterium
}

export function cellsOfType(world: World, defId: string): ImmuneCell[] {
  return world.immuneCells.filter((cell) => cell.alive && cell.defId === defId)
}

export function firstOfType(world: World, defId: string): ImmuneCell {
  const cell = cellsOfType(world, defId)[0]
  if (!cell) throw new Error(`no living ${defId} in this world`)
  return cell
}

/** How far apart two things are. */
export function gap(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}
