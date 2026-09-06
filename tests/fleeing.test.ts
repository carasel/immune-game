import { describe, expect, it } from 'vitest'
import { macrophage } from '../src/content/cells'
import { greenBacteria, greenCocci } from '../src/content/pathogens'
import type { ImmuneCell } from '../src/sim/immuneCells'
import type { BodyCell } from '../src/sim/tissue'
import type { World } from '../src/sim/world'
import {
  firstOfType,
  gap,
  placeBacterium,
  run,
  runUntil,
  stripTissue,
  worldWith,
} from './helpers'

/**
 * GREEN — the colour that runs away.
 *
 * Green is the fourth rung of the ladder and the first one that is behaviour
 * rather than numbers. A green hits exactly as hard as a red and moves exactly
 * as fast; the whole difference is that it watches for immune cells and swims
 * away from them.
 *
 * Shape splits it in two, and that split is the thing most worth protecting:
 *
 *   a green ROD   is a coward. It drops a body cell it was eating to run, and
 *                 at 30 against a macrophage's 16 that makes it uncatchable by
 *                 a macrophage on its own.
 *   a green COCCI commits. It shies away while it is wandering, but once its
 *                 teeth are in it stays and eats, because a clump at half a
 *                 rod's speed was never going to outrun anything anyway.
 *
 * Orange and purple inherit all of it, so these tests are really about all
 * three of the top colours.
 */

/**
 * One immune cell, pinned in the open channel down the left with tissue a
 * little way to its right — the same spot the macrophage tests use, and pinned
 * for the same reason: left to itself a starting cell lands wherever the tissue
 * and the wound happen to leave room, which moves whenever either changes.
 */
const oneMacrophage = [{ cell: 'macrophage', count: 1, at: { x: 0.1, y: 0.24 } }]
const oneNeutrophil = [{ cell: 'neutrophil', count: 1, at: { x: 0.1, y: 0.24 } }]

/** Far corner of the tissue: somewhere to park a cell so it isn't a factor. */
const AWAY = { x: 900, y: 500 }

/** The living body cell closest to `to`. */
function nearestBodyCell(world: World, to: { x: number; y: number }): BodyCell {
  const cells = world.bodyCells.filter((cell) => cell.alive)
  cells.sort((a, b) => gap(a, to) - gap(b, to))

  const nearest = cells[0]
  if (!nearest) throw new Error('no living body cells in this world')
  return nearest
}

/**
 * Sets a bacterium eating a body cell, with the immune cell parked out of the
 * way, and hands back the cell it is chewing on. Every test below that cares
 * about meals starts here, so "does it let go?" is the only difference between
 * them.
 */
function setEating(world: World, cell: ImmuneCell, defId: string): BodyCell {
  const victim = nearestBodyCell(world, cell)

  // Inside its reach whatever shape it is: a rod's radius is 10 and a clump's
  // is bigger, so a body cell's own radius is always close enough.
  placeBacterium(world, victim.x + victim.radius, victim.y, defId)

  cell.x = AWAY.x
  cell.y = AWAY.y
  run(world, 2)

  expect(victim.health).toBeLessThan(1)
  return victim
}

describe('a green rod running away', () => {
  it('swims away from a macrophage that comes within range', () => {
    const world = worldWith(oneMacrophage)
    const cell = firstOfType(world, 'macrophage')
    // Nothing to eat, so running is the only thing it could be doing.
    stripTissue(world, 0)
    const green = placeBacterium(world, cell.x + 60, cell.y, 'green-bacteria')

    const before = gap(green, cell)
    run(world, 2)

    expect(gap(green, cell)).toBeGreaterThan(before)
  })

  it('ignores one that is still further off than its flee range', () => {
    const world = worldWith(oneMacrophage)
    const cell = firstOfType(world, 'macrophage')
    const victim = setEating(world, cell, 'green-bacteria')

    // Well outside the 120 it worries about: it has no reason to stop eating.
    cell.x = victim.x + greenBacteria.fleeRange! + 80
    cell.y = victim.y

    const health = victim.health
    run(world, 2)

    expect(victim.health).toBeLessThan(health)
  })

  it('drops a body cell it was eating to run', () => {
    const world = worldWith(oneMacrophage)
    const cell = firstOfType(world, 'macrophage')
    const victim = setEating(world, cell, 'green-bacteria')
    const green = world.pathogens[0]

    // The macrophage turns up inside its flee range. Fear beats hunger.
    cell.x = green.x + 60
    cell.y = green.y

    const health = victim.health
    const before = gap(green, cell)
    run(world, 2)

    expect(victim.health).toBe(health)
    expect(gap(green, cell)).toBeGreaterThan(before)
  })

  it('stays put for a dead one, because a corpse is not a hunter', () => {
    const world = worldWith(oneMacrophage)
    const cell = firstOfType(world, 'macrophage')
    const victim = setEating(world, cell, 'green-bacteria')
    const green = world.pathogens[0]

    cell.x = green.x + 60
    cell.y = green.y
    cell.alive = false

    const health = victim.health
    run(world, 2)

    expect(victim.health).toBeLessThan(health)
  })

  it('cannot be caught by one macrophage, where a red can', () => {
    const chase = (defId: string) => {
      const world = worldWith(oneMacrophage)
      const cell = firstOfType(world, 'macrophage')
      const bacterium = placeBacterium(world, cell.x + 60, cell.y, defId)

      return runUntil(world, 60, () => !bacterium.alive)
    }

    // A red stops to eat, and standing still is what gets you eaten.
    expect(chase('red-bacteria')).not.toBeNull()
    expect(chase('green-bacteria')).toBeNull()
  })

  it('can be caught by a neutrophil, which is faster than it is', () => {
    const world = worldWith(oneNeutrophil)
    const cell = firstOfType(world, 'neutrophil')
    const green = placeBacterium(world, cell.x + 60, cell.y, 'green-bacteria')

    expect(runUntil(world, 60, () => !green.alive)).not.toBeNull()
  })
})

describe('a green cocci, which runs but will not be driven off its meal', () => {
  it('turns and swims straight away while it is wandering', () => {
    const world = worldWith(oneMacrophage)
    const cell = firstOfType(world, 'macrophage')
    stripTissue(world, 0)
    const clump = placeBacterium(world, cell.x + 60, cell.y, 'green-cocci')

    const startY = clump.y
    const startX = clump.x
    run(world, 1)

    // Directly along the line away from the macrophage, with no sideways drift
    // at all — which is exactly what going for a body cell would have given it,
    // since no body cell sits on that line.
    expect(clump.y).toBeCloseTo(startY, 6)
    expect(clump.x - startX).toBeCloseTo(greenCocci.speed, 6)
  })

  it('still loses ground doing it, because a clump is slower than a macrophage', () => {
    const world = worldWith(oneMacrophage)
    const cell = firstOfType(world, 'macrophage')
    stripTissue(world, 0)
    const clump = placeBacterium(world, cell.x + 60, cell.y, 'green-cocci')

    const before = gap(clump, cell)
    run(world, 2)

    // 15 against a macrophage's 16. Running is worth something to a green rod
    // and almost nothing to a green clump, which is why the clump would rather
    // stay and eat — see below.
    expect(greenCocci.speed).toBeLessThan(macrophage.speed)
    expect(gap(clump, cell)).toBeLessThan(before)
  })

  it('keeps eating once its teeth are in, macrophage or no macrophage', () => {
    const world = worldWith(oneMacrophage)
    const cell = firstOfType(world, 'macrophage')
    const victim = setEating(world, cell, 'green-cocci')
    const clump = world.pathogens[0]

    cell.x = clump.x + 60
    cell.y = clump.y

    const health = victim.health
    run(world, 1)

    expect(victim.health).toBeLessThan(health)
  })
})
