import { describe, expect, it } from 'vitest'
import { inflammation } from '../src/content/inflammation'
import { radiusOf, strengthOf } from '../src/sim/inflammation'
import type { World } from '../src/sim/world'
import {
  firstOfType,
  gap,
  placeBacterium,
  run,
  stripTissue,
  testWorld,
} from './helpers'

/**
 * Inflammation: a circle you put down that hurries your cells, slows the
 * bacteria, hurts your tissue, costs energy every second, and calms down by
 * itself once the fight in it is over. See GAME_DESIGN.md §7.
 */

/** Level 1 with inflammation switched on, which it never has for real. */
function inflamingWorld(): World {
  return testWorld({ inflammation: true, startingCells: [] })
}

function inflame(world: World, x: number, y: number) {
  expect(world.beginInflammation()).toBe(true)
  const patch = world.inflameAt(x, y)
  if (!patch) throw new Error('the circle did not go down')
  return patch
}

/** A body cell that can't be eaten, so a bacterium on it stays put for the whole test. */
function anchoredBacterium(world: World) {
  const cell = world.bodyCells[0]
  cell.health = 1e9
  return { cell, bacterium: placeBacterium(world, cell.x, cell.y) }
}

describe('switching it on', () => {
  it("can't be done on a level that doesn't have it", () => {
    const world = testWorld()

    expect(world.canInflame).toBe(false)
    expect(world.beginInflammation()).toBe(false)
    expect(world.inflameAt(100, 100)).toBeNull()
    expect(world.inflammations).toHaveLength(0)
  })

  it('takes two steps, the button then the tissue, and costs nothing until the second', () => {
    const world = inflamingWorld()
    const before = world.economy.energy

    expect(world.beginInflammation()).toBe(true)
    expect(world.isPlacingInflammation).toBe(true)
    expect(world.economy.energy).toBe(before)

    world.inflameAt(300, 300)
    expect(world.isPlacingInflammation).toBe(false)
    expect(world.inflammations).toHaveLength(1)
  })

  it('can be called off, and then a click on the tissue does nothing', () => {
    const world = inflamingWorld()

    world.beginInflammation()
    world.cancelInflammation()

    expect(world.inflameAt(300, 300)).toBeNull()
    expect(world.inflammations).toHaveLength(0)
  })

  it('is one thing waiting for a click at a time: recruiting and inflaming cancel each other', () => {
    const world = inflamingWorld()

    world.beginInflammation()
    world.beginRecruit('neutrophil')
    expect(world.isPlacingInflammation).toBe(false)
    expect(world.recruitingDefId).toBe('neutrophil')

    world.beginInflammation()
    expect(world.recruitingDefId).toBeNull()
    expect(world.isPlacingInflammation).toBe(true)
  })

  it("is refused when there isn't even a second's worth of energy", () => {
    const world = inflamingWorld()
    world.economy.energy = inflammation.costPerSecond / 2

    expect(world.beginInflammation()).toBe(false)
  })
})

describe('what it costs', () => {
  it('charges energy every second it is alive', () => {
    const world = inflamingWorld()
    inflame(world, 300, 300)

    // Inside the grace time, so it is at full strength the whole way.
    run(world, 5)

    expect(world.economy.totalLostToInflammation).toBeCloseTo(5 * inflammation.costPerSecond, 1)
  })

  it('charges for every circle, even ones on top of each other', () => {
    const world = inflamingWorld()
    inflame(world, 300, 300)
    inflame(world, 300, 300)

    run(world, 5)

    expect(world.economy.totalLostToInflammation).toBeCloseTo(10 * inflammation.costPerSecond, 1)
  })
})

describe('calming down', () => {
  it('waits a while for bacteria when put down somewhere quiet, then fades away', () => {
    const world = inflamingWorld()
    const patch = inflame(world, 300, 300)

    run(world, inflammation.graceSeconds - 0.5)
    expect(patch.alive).toBe(true)
    expect(strengthOf(patch)).toBe(1)

    run(world, 0.5 + inflammation.fadeSeconds + 0.1)
    expect(patch.alive).toBe(false)
    expect(world.inflammations).toHaveLength(0)
  })

  it('stays at full strength for as long as there are bacteria in it', () => {
    const world = inflamingWorld()
    const { cell } = anchoredBacterium(world)
    const patch = inflame(world, cell.x, cell.y)

    run(world, inflammation.graceSeconds + inflammation.fadeSeconds + 5)

    expect(patch.alive).toBe(true)
    expect(strengthOf(patch)).toBe(1)
  })

  it('shrinks and weakens once the fight is over, with no more waiting', () => {
    const world = inflamingWorld()
    const { cell, bacterium } = anchoredBacterium(world)
    const patch = inflame(world, cell.x, cell.y)

    run(world, 2)
    bacterium.alive = false
    run(world, inflammation.fadeSeconds / 2)

    expect(strengthOf(patch)).toBeGreaterThan(0.3)
    expect(strengthOf(patch)).toBeLessThan(0.7)
    expect(radiusOf(patch)).toBeLessThan(inflammation.radius)

    run(world, inflammation.fadeSeconds / 2 + 0.1)
    expect(patch.alive).toBe(false)
  })

  it('swells back up if more bacteria arrive while it is calming down', () => {
    const world = inflamingWorld()
    const { cell, bacterium } = anchoredBacterium(world)
    const patch = inflame(world, cell.x, cell.y)

    run(world, 1)
    bacterium.alive = false
    run(world, inflammation.fadeSeconds / 2)
    const calming = strengthOf(patch)

    bacterium.alive = true
    run(world, inflammation.fadeSeconds)

    expect(calming).toBeLessThan(1)
    expect(strengthOf(patch)).toBe(1)
  })
})

describe('inside the circle', () => {
  /** How far a lone neutrophil walks in one second, inflamed or not. */
  function neutrophilStride(inflamed: boolean, circles = 1): number {
    const world = testWorld({
      inflammation: true,
      startingCells: [{ cell: 'neutrophil', count: 1, at: { x: 0.3, y: 0.5 } }],
    })
    // No tissue to squeeze through, so only the inflammation changes its speed.
    stripTissue(world, 0)

    const cell = firstOfType(world, 'neutrophil')
    for (let i = 0; inflamed && i < circles; i++) inflame(world, cell.x, cell.y)

    world.selectImmuneCellAt(cell.x, cell.y)
    world.orderSelectedTo(cell.x + 300, cell.y)

    const start = { x: cell.x, y: cell.y }
    run(world, 1)
    return gap(start, cell)
  }

  /** How far a lone blue rod swims in one second, inflamed or not. */
  function bacteriumStride(inflamed: boolean): number {
    const world = inflamingWorld()
    stripTissue(world, 0)

    // Nothing to eat and no reason to turn, so it swims straight along.
    const bacterium = placeBacterium(world, 300, 300)
    if (inflamed) inflame(world, 300, 300)

    run(world, 1)
    return gap({ x: 300, y: 300 }, bacterium)
  }

  it('hurries immune cells along', () => {
    const plain = neutrophilStride(false)
    const inflamed = neutrophilStride(true)

    expect(inflamed / plain).toBeCloseTo(inflammation.immuneCellSpeedMultiplier, 1)
  })

  it('slows bacteria down', () => {
    const plain = bacteriumStride(false)
    const inflamed = bacteriumStride(true)

    expect(inflamed / plain).toBeCloseTo(inflammation.pathogenSpeedMultiplier, 1)
  })

  it("doesn't stack: two circles on one spot are no faster than one", () => {
    expect(neutrophilStride(true, 2)).toBeCloseTo(neutrophilStride(true, 1), 5)
  })

  it('slowly hurts your own tissue, inside the circle and nowhere else', () => {
    const world = inflamingWorld()
    const inside = world.bodyCells[0]
    const outside = world.bodyCells.reduce((far, cell) => (gap(cell, inside) > gap(far, inside) ? cell : far))

    inflame(world, inside.x, inside.y)
    run(world, 5)

    expect(inside.health).toBeCloseTo(1 - 5 * inflammation.bodyCellDamagePerSecond, 3)
    expect(outside.health).toBe(1)
  })
})
