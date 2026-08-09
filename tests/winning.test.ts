import { describe, expect, it } from 'vitest'
import { theCut, TISSUE_VIEW } from '../src/content/levels'
import { World } from '../src/sim/world'
import { firstOfType, run, runUntil, stripTissue, testWorld, worldWith } from './helpers'

/** A level whose whole infection is one bacterium, arriving after a second. */
const oneWave = {
  waves: [{ at: 1, pathogen: 'blue-bacteria', count: 1 }],
  startingCells: [{ cell: 'macrophage', count: 2 }],
}

/** Runs until the wave has arrived, then kills it — an immune system in a hurry. */
function clearTheWave(world: World): void {
  runUntil(world, 30, (w) => w.livingPathogenCount > 0)
  for (const pathogen of world.pathogens) pathogen.alive = false
  world.step()
}

describe('clearing the infection', () => {
  it('is won when the last bacterium dies and no more are coming', () => {
    const world = testWorld(oneWave)

    clearTheWave(world)

    expect(world.isWon).toBe(true)
    expect(world.livingPathogenCount).toBe(0)
    expect(world.wonAtSeconds).toBeCloseTo(world.elapsedSeconds, 5)
    expect(world.isLost).toBe(false)
    expect(world.isOver).toBe(true)
  })

  it('is not won before the bacteria have even arrived', () => {
    const world = testWorld(oneWave)

    // Nothing on screen yet, but the wave is still to come.
    run(world, 0.5)

    expect(world.livingPathogenCount).toBe(0)
    expect(world.allWavesReleased).toBe(false)
    expect(world.isWon).toBe(false)
  })

  it('is not won during a lull between waves', () => {
    const world = testWorld({
      waves: [
        { at: 1, pathogen: 'blue-bacteria', count: 1 },
        { at: 120, pathogen: 'blue-bacteria', count: 3 },
      ],
      startingCells: [{ cell: 'macrophage', count: 2 }],
    })

    clearTheWave(world)

    expect(world.livingPathogenCount).toBe(0)
    expect(world.allWavesReleased).toBe(false)
    expect(world.isWon).toBe(false)
    expect(world.isOver).toBe(false)
  })

  it('is won once the last wave is cleared, not the first', () => {
    const world = testWorld({
      waves: [
        { at: 1, pathogen: 'blue-bacteria', count: 1 },
        { at: 4, pathogen: 'blue-bacteria', count: 1 },
      ],
      startingCells: [{ cell: 'macrophage', count: 2 }],
    })

    clearTheWave(world)
    expect(world.isWon).toBe(false)

    clearTheWave(world)
    expect(world.isWon).toBe(true)
  })

  it('cannot be won on a level with no bacteria at all', () => {
    const world = testWorld()

    run(world, 30)

    expect(world.livingPathogenCount).toBe(0)
    expect(world.allWavesReleased).toBe(true)
    expect(world.isWon).toBe(false)
  })

  it('stays won, and the clock on it does not move', () => {
    const world = testWorld(oneWave)
    clearTheWave(world)

    const wonAt = world.wonAtSeconds
    run(world, 30)

    expect(world.isWon).toBe(true)
    expect(world.wonAtSeconds).toBe(wonAt)
    expect(world.elapsedSeconds).toBeGreaterThan(wonAt + 25)
  })

  it('counts the tissue you saved', () => {
    const world = testWorld(oneWave)
    clearTheWave(world)

    // Barely any time has passed, so almost all of it should still be there.
    expect(world.livingBodyCellCount).toBeGreaterThan(0)
    expect(world.livingBodyCellCount).toBeLessThanOrEqual(world.bodyCells.length)
  })
})

describe('winning it for real', () => {
  it('is won by the immune cells actually eating the last bacterium', () => {
    const world = testWorld({
      waves: [{ at: 1, pathogen: 'blue-bacteria', count: 1 }],
      startingCells: [{ cell: 'neutrophil', count: 2 }],
    })

    runUntil(world, 30, (w) => w.livingPathogenCount > 0)

    // Put it in front of a neutrophil and stop it dividing, so the test is about
    // the win firing rather than about whether two cells can win a chase.
    const hunter = firstOfType(world, 'neutrophil')
    const bacterium = world.pathogens[0]
    bacterium.x = hunter.x + 60
    bacterium.y = hunter.y
    bacterium.divideIn = Number.MAX_SAFE_INTEGER

    const wonAt = runUntil(world, 60, (w) => w.isWon)

    expect(wonAt).not.toBeNull()
    expect(bacterium.alive).toBe(false)
    expect(world.isLost).toBe(false)
  })
})

describe('winning and losing cannot both happen', () => {
  it('is a loss, not a win, if the tissue dies as the infection ends', () => {
    const world = testWorld(oneWave)

    runUntil(world, 30, (w) => w.livingPathogenCount > 0)

    // Everything dies in the same tick: the tissue and the last bacterium.
    for (const cell of world.bodyCells) {
      cell.alive = false
      cell.health = 0
    }
    for (const pathogen of world.pathogens) pathogen.alive = false

    world.step()

    expect(world.isLost).toBe(true)
    expect(world.lossReason).toBe('tissue')
    expect(world.isWon).toBe(false)
  })

  it('cannot be won after the level is already lost', () => {
    const world = testWorld(oneWave)

    runUntil(world, 30, (w) => w.livingPathogenCount > 0)
    stripTissue(world, 0)
    world.step()
    expect(world.isLost).toBe(true)

    // The bacteria are all killed off afterwards. Still lost.
    for (const pathogen of world.pathogens) pathogen.alive = false
    run(world, 5)

    expect(world.isWon).toBe(false)
    expect(world.lossReason).toBe('tissue')
  })

  it('cannot be lost after the level is already won', () => {
    const world = testWorld(oneWave)
    clearTheWave(world)
    expect(world.isWon).toBe(true)

    // Bankrupt it and strip the tissue right back afterwards.
    world.economy.energy = 0
    stripTissue(world, 0)
    run(world, 30)

    expect(world.isWon).toBe(true)
    expect(world.isLost).toBe(false)
    expect(world.lossReason).toBeNull()
  })
})

describe('level 1 as it is tuned today', () => {
  it('has waves that all arrive, so winning it is possible in principle', () => {
    const world = new World(theCut, TISSUE_VIEW)
    const lastWave = theCut.waves[theCut.waves.length - 1]

    expect(theCut.waves.length).toBeGreaterThan(0)
    expect(world.allWavesReleased).toBe(false)

    run(world, lastWave.at + 1)

    expect(world.allWavesReleased).toBe(true)
  })

  /**
   * Level 1 is winnable with the cells you start with — but only if you play
   * it. Guard the whole level: it should reward the obvious good move, and
   * punish leaving it alone. Both halves are balance canaries, so if either
   * starts failing after a retune, read the numbers and move the bounds.
   */
  it('is won by sending everything to the cut, without recruiting anything', () => {
    const world = new World(theCut, TISSUE_VIEW)
    const cut = world.entries[0]

    // Meet them at the wound: every cell ordered there once, at the start.
    for (const cell of world.immuneCells) {
      world.selectImmuneCellAt(cell.x, cell.y)
      world.orderSelectedTo(cut.innerPoint.x, cut.innerPoint.y)
    }
    world.clearSelection()

    const wonAt = runUntil(world, 400, (w) => w.isOver)

    expect(world.isWon, 'sending everything to the cut no longer wins level 1').toBe(true)
    expect(wonAt).toBeGreaterThan(theCut.waves[theCut.waves.length - 1].at)
    // On the cells it starts with. Nothing was bought.
    expect(world.economy.totalSpent).toBe(0)
    // And most of the tissue survives, which is what makes it a good win.
    expect(world.livingBodyCellCount).toBeGreaterThan(world.bodyCells.length * 0.8)
  })
})
