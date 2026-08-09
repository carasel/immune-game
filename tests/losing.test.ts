import { describe, expect, it } from 'vitest'
import { balance } from '../src/content/balance'
import { neutrophil } from '../src/content/cells'
import { theCut, TISSUE_VIEW } from '../src/content/levels'
import { World } from '../src/sim/world'
import { run, runUntil, stripTissue, testWorld, worldWith } from './helpers'

describe('losing the tissue', () => {
  it('is not lost before anything has happened', () => {
    const world = testWorld()

    expect(world.isLost).toBe(false)
    expect(world.lossReason).toBeNull()

    run(world, 20)

    expect(world.isLost).toBe(false)
    expect(world.livingBodyCellCount).toBe(world.bodyCells.length)
  })

  it('is lost the moment the last body cell dies', () => {
    const world = testWorld()
    for (const cell of world.bodyCells) {
      cell.alive = false
      cell.health = 0
    }

    world.step()

    expect(world.isLost).toBe(true)
    expect(world.lossReason).toBe('tissue')
  })

  it('is lost with the tissue gone however much energy is banked', () => {
    const world = testWorld()
    world.economy.energy = 5000
    for (const cell of world.bodyCells) {
      cell.alive = false
      cell.health = 0
    }

    world.step()

    expect(world.lossReason).toBe('tissue')
  })

  it('stays lost, and keeps running so you can watch the aftermath', () => {
    const world = testWorld()
    for (const cell of world.bodyCells) {
      cell.alive = false
      cell.health = 0
    }
    world.step()

    const lostAt = world.lostAtSeconds
    world.economy.energy = 900
    run(world, 30)

    expect(world.isLost).toBe(true)
    expect(world.lossReason).toBe('tissue')
    expect(world.lostAtSeconds).toBe(lostAt)
    expect(world.elapsedSeconds).toBeGreaterThan(lostAt + 25)
  })
})

describe('running out of energy', () => {
  it('is survivable while the tissue still earns', () => {
    const world = testWorld()
    world.economy.energy = 0

    run(world, 10)

    expect(world.isLost).toBe(false)
    expect(world.economy.energy).toBeGreaterThan(0)
    expect(world.livingImmuneCellCount).toBeGreaterThan(0)
  })

  it('starves a cell every few seconds once there is nothing coming in', () => {
    const world = worldWith([{ cell: 'macrophage', count: 2 }])
    stripTissue(world)
    world.economy.energy = 0

    const deaths: number[] = []
    runUntil(world, 30, () => {
      for (const cell of world.immuneCells) {
        if (!cell.alive && cell.diedAtSeconds !== null && !deaths.includes(cell.diedAtSeconds)) {
          deaths.push(cell.diedAtSeconds)
        }
      }
      return world.isLost
    })

    expect(deaths).toHaveLength(2)
    expect(deaths[0]).toBeCloseTo(balance.starvationSecondsPerCell, 1)
    expect(deaths[1] - deaths[0]).toBeCloseTo(balance.starvationSecondsPerCell, 1)
  })

  it('is only lost once the energy AND the last cell are gone', () => {
    const world = worldWith([{ cell: 'macrophage', count: 1 }])
    stripTissue(world)
    world.economy.energy = 0

    // Bankrupt from the first tick, but there is still a cell.
    world.step()
    expect(world.isLost).toBe(false)

    const lostAt = runUntil(world, 30, (w) => w.isLost)

    expect(lostAt).not.toBeNull()
    expect(world.lossReason).toBe('starvation')
    expect(world.livingImmuneCellCount).toBe(0)
  })

  it('says so while it is happening, and counts down to the next one', () => {
    const world = worldWith([{ cell: 'macrophage', count: 2 }])
    stripTissue(world)
    world.economy.energy = 0

    world.step()

    expect(world.isStarving).toBe(true)
    expect(world.secondsToNextStarvation).toBeLessThanOrEqual(balance.starvationSecondsPerCell)

    const before = world.secondsToNextStarvation
    run(world, 1)
    expect(world.secondsToNextStarvation).toBeLessThan(before)
  })

  it('is not starving when the energy is fine', () => {
    const world = testWorld()

    run(world, 5)

    expect(world.isStarving).toBe(false)
  })
})

describe('who starves first', () => {
  it('takes the cell with least life left — neutrophils before macrophages', () => {
    const world = worldWith([
      { cell: 'macrophage', count: 2 },
      { cell: 'neutrophil', count: 2 },
    ])
    stripTissue(world)
    world.economy.energy = 0

    const order: string[] = []
    const seen = new Set<number>()

    runUntil(world, 60, () => {
      for (const cell of world.immuneCells) {
        if (cell.alive || seen.has(cell.id)) continue
        seen.add(cell.id)
        order.push(cell.defId)
      }
      return world.isLost
    })

    expect(order).toEqual(['neutrophil', 'neutrophil', 'macrophage', 'macrophage'])
  })

  it('takes the most worn-out neutrophil of the bunch first', () => {
    const world = worldWith([{ cell: 'neutrophil', count: 3 }])
    stripTissue(world)
    world.economy.energy = 0

    const [fresh, worn, middling] = world.immuneCells
    fresh.ageSeconds = 0
    worn.ageSeconds = neutrophil.lifespanSeconds! - 20
    middling.ageSeconds = 30

    const firstToGo = runUntil(world, 10, () => world.livingImmuneCellCount < 3)

    expect(firstToGo).not.toBeNull()
    expect(worn.alive).toBe(false)
    expect(fresh.alive).toBe(true)
    expect(middling.alive).toBe(true)
  })

  it('falls back to the oldest when every cell would have lived for ever', () => {
    const world = worldWith([{ cell: 'macrophage', count: 2 }])
    stripTissue(world)
    world.economy.energy = 0

    const [young, old] = world.immuneCells
    young.ageSeconds = 10
    old.ageSeconds = 300

    runUntil(world, 10, () => world.livingImmuneCellCount < 2)

    expect(old.alive).toBe(false)
    expect(young.alive).toBe(true)
  })

  it('records when each one died so it can be seen to wither', () => {
    const world = worldWith([{ cell: 'macrophage', count: 1 }])
    stripTissue(world)
    world.economy.energy = 0

    runUntil(world, 30, (w) => w.livingImmuneCellCount === 0)

    const dead = world.immuneCells.filter((cell) => !cell.alive)
    expect(dead).toHaveLength(1)
    expect(dead[0].diedAtSeconds).not.toBeNull()
    // And it is not left holding orders or half-eaten meals.
    expect(dead[0].order).toBeNull()
    expect(dead[0].meal).toBeNull()
  })
})

/**
 * A canary for the balance, not a rule. Left alone, level 1 should be lost —
 * that is the whole point of the death spiral — and it should take long enough
 * that the player had a chance.
 *
 * If this fails after a deliberate retune, read the numbers it prints and move
 * the bounds. If it fails after a change that wasn't about balance at all,
 * something has quietly made the game easier or harder: the play area shrinking
 * and an extra starting neutrophil have each done exactly that before.
 */
describe('level 1, played by nobody', () => {
  it('loses the tissue, somewhere between one and five minutes in', () => {
    const world = new World(theCut, TISSUE_VIEW)

    const lostAt = runUntil(world, 600, (w) => w.isLost)

    expect(lostAt, 'level 1 was never lost — has it become unlosable?').not.toBeNull()
    expect(lostAt).toBeGreaterThan(60)
    expect(lostAt).toBeLessThan(300)
  })
})
