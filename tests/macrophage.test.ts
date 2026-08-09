import { describe, expect, it } from 'vitest'
import { macrophage } from '../src/content/cells'
import {
  firstOfType,
  gap,
  leaveDebris,
  placeBacterium,
  run,
  runUntil,
  worldWith,
} from './helpers'

const oneMacrophage = [{ cell: 'macrophage', count: 1 }]

describe('a macrophage hunting', () => {
  it('swallows a bacterium it can reach, and the bacterium stops being a threat at once', () => {
    const world = worldWith(oneMacrophage)
    const cell = firstOfType(world, 'macrophage')
    const bacterium = placeBacterium(world, cell.x + 40, cell.y)

    const swallowed = runUntil(world, 20, () => cell.meal !== null)

    expect(swallowed).not.toBeNull()
    expect(bacterium.alive).toBe(false)
    expect(cell.meal?.kind).toBe('pathogen')
    expect(cell.meal?.pathogenDefId).toBe('blue-bacteria')
  })

  it('pays out when the meal is finished, not when it starts', () => {
    const world = worldWith(oneMacrophage)
    const cell = firstOfType(world, 'macrophage')
    placeBacterium(world, cell.x + 40, cell.y)

    runUntil(world, 20, () => cell.meal !== null)
    const whenSwallowed = world.economy.energy

    // Halfway through digesting: nothing paid yet.
    run(world, macrophage.engulfPathogenSeconds / 2)
    const halfway = world.economy.energy - whenSwallowed

    runUntil(world, macrophage.engulfPathogenSeconds, () => cell.meal === null)
    const afterwards = world.economy.energy - whenSwallowed

    // Body cell income ticks along throughout, so compare the jump, not the total.
    expect(halfway).toBeLessThan(macrophage.energyPerPathogen / 2)
    expect(afterwards).toBeGreaterThan(macrophage.energyPerPathogen)
  })

  it('cannot move or hunt while it is digesting', () => {
    const world = worldWith(oneMacrophage)
    const cell = firstOfType(world, 'macrophage')
    placeBacterium(world, cell.x + 40, cell.y)

    runUntil(world, 20, () => cell.meal !== null)
    const where = { x: cell.x, y: cell.y }

    // A second bacterium right on top of it must be ignored until it's done.
    const second = placeBacterium(world, cell.x + 25, cell.y)
    run(world, macrophage.engulfPathogenSeconds * 0.6)

    expect(gap(cell, where)).toBe(0)
    expect(second.alive).toBe(true)
  })

  it('clears away the husks dead body cells leave behind', () => {
    const world = worldWith(oneMacrophage)
    leaveDebris(world, 6)

    expect(world.debrisCount).toBe(6)

    run(world, 120)

    expect(world.debrisCount).toBeLessThan(6)
  })

  it('goes for a bacterium before a husk, however close the husk is', () => {
    const world = worldWith(oneMacrophage)
    const cell = firstOfType(world, 'macrophage')

    // A husk right beside it, and a bacterium further off.
    const nearest = world.bodyCells
      .slice()
      .sort((a, b) => gap(a, cell) - gap(b, cell))[0]
    nearest.alive = false
    nearest.health = 0
    nearest.debris = true

    placeBacterium(world, cell.x + 90, cell.y)

    runUntil(world, 30, () => cell.meal !== null)

    expect(cell.meal?.kind).toBe('pathogen')
  })
})

describe('moving through tissue', () => {
  it('is slower squeezing between body cells than crossing open ground', () => {
    // Same cell, same order, run twice: once with the tissue there and once
    // without. The only difference is what is in the way.
    const distanceIn = (tissue: boolean) => {
      const world = worldWith(oneMacrophage)
      const cell = firstOfType(world, 'macrophage')

      if (!tissue) {
        for (const body of world.bodyCells) {
          body.alive = false
          body.health = 0
          body.debris = false
        }
      }

      const from = { x: cell.x, y: cell.y }
      world.selectImmuneCellAt(cell.x, cell.y)
      world.orderSelectedTo(cell.x + 300, cell.y)
      run(world, 10)

      return gap(cell, from)
    }

    const throughTissue = distanceIn(true)
    const throughNothing = distanceIn(false)

    expect(throughTissue).toBeLessThan(throughNothing)
  })
})

describe('immune cells bumping into each other', () => {
  it('shoves two macrophages apart instead of letting them stack up', () => {
    const world = worldWith([{ cell: 'macrophage', count: 2 }])
    const [a, b] = world.immuneCells

    a.x = 400
    a.y = 300
    b.x = 405
    b.y = 300

    world.step()

    expect(gap(a, b)).toBeGreaterThanOrEqual(macrophage.radius * 2 - 0.5)
  })
})
