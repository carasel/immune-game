import { describe, expect, it } from 'vitest'
import { balance } from '../src/content/balance'
import { theCut, TISSUE_VIEW } from '../src/content/levels'
import { World } from '../src/sim/world'
import { rectContains } from '../src/sim/geometry'
import { gap, placeBacterium, run, runUntil, testWorld, worldWith } from './helpers'

describe('growing the tissue', () => {
  it('builds the same tissue every time from the same seed', () => {
    const first = new World(theCut, TISSUE_VIEW)
    const second = new World(theCut, TISSUE_VIEW)

    expect(second.bodyCells).toHaveLength(first.bodyCells.length)
    for (let i = 0; i < first.bodyCells.length; i++) {
      expect(second.bodyCells[i].x).toBeCloseTo(first.bodyCells[i].x, 6)
      expect(second.bodyCells[i].y).toBeCloseTo(first.bodyCells[i].y, 6)
    }
  })

  it('never lets two body cells overlap', () => {
    const world = testWorld()
    const cells = world.bodyCells

    // Half a pixel of slack, the same tolerance the generator settles to.
    const closest = Math.min(
      ...cells.flatMap((a, i) => cells.slice(i + 1).map((b) => gap(a, b))),
    )
    const drawnWidth = balance.bodyCellRadius * (1 + balance.bodyCellWobble) * 2

    expect(closest).toBeGreaterThan(drawnWidth - 0.5)
  })

  it('keeps the vessels and the wound clear of tissue', () => {
    const world = testWorld()

    for (const region of [...world.openings, ...world.entries]) {
      for (const cell of world.bodyCells) {
        expect(rectContains(region.corridor, cell.x, cell.y)).toBe(false)
      }
    }
  })

  it('fits the body cells the level asked for', () => {
    const world = testWorld()

    expect(world.bodyCells.length).toBe(theCut.bodyCellCount)
  })
})

describe('a body cell dying', () => {
  it('charges the energy and leaves its outline behind', () => {
    const world = worldWith([])
    const victim = world.bodyCells[0]
    placeBacterium(world, victim.x, victim.y)

    const died = runUntil(world, 60, () => !victim.alive)

    expect(died).not.toBeNull()
    expect(victim.debris).toBe(true)
    expect(world.debrisCount).toBe(1)
    expect(world.economy.totalLostToDeaths).toBe(balance.energyLostWhenABodyCellDies)
  })

  it('costs more than the whole tissue earns in a second', () => {
    const world = worldWith([])
    const fullIncome = world.bodyCells.length * balance.incomePerBodyCellPerSecond

    // This ratio is the death spiral: one death undoes seconds of income, and
    // the tissue that would have earned it back is the tissue you just lost.
    expect(balance.energyLostWhenABodyCellDies).toBeGreaterThan(fullIncome)
  })

  it('stops earning once it is dead', () => {
    const world = worldWith([])
    const living = world.livingBodyCellCount

    world.bodyCells[0].alive = false
    world.bodyCells[0].health = 0

    expect(world.livingBodyCellCount).toBe(living - 1)
  })
})

describe('bacteria', () => {
  it('eat a body cell they are touching', () => {
    const world = worldWith([])
    const victim = world.bodyCells[0]
    placeBacterium(world, victim.x, victim.y)

    run(world, 5)

    expect(victim.health).toBeLessThan(1)
    expect(victim.alive).toBe(true) // 0.09/sec takes about 11 seconds
  })

  it('arrive on the level schedule, through the wound', () => {
    const world = new World(theCut, TISSUE_VIEW)
    const firstWave = theCut.waves[0]

    run(world, firstWave.at - 1)
    expect(world.livingPathogenCount).toBe(0)

    run(world, 2)
    expect(world.livingPathogenCount).toBe(firstWave.count)

    const wound = world.entries[0]
    for (const pathogen of world.pathogens) {
      expect(gap(pathogen, wound.innerPoint)).toBeLessThan(wound.width)
    }
  })

  it('multiply if they are left alone', () => {
    const world = worldWith([])
    placeBacterium(world, 480, 300)
    // Undo the frozen division the helper sets up.
    world.pathogens[0].divideIn = 1

    run(world, 30)

    expect(world.livingPathogenCount).toBeGreaterThan(1)
  })
})
