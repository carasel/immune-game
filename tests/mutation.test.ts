import { describe, expect, it } from 'vitest'
import { balance } from '../src/content/balance'
import {
  blueBacteria,
  mutationsOf,
  pathogenColours,
  pathogens,
  redBacteria,
  yellowBacteria,
} from '../src/content/pathogens'
import { run, testWorld, worldWith } from './helpers'
import { theCut } from '../src/content/levels'

describe('the colour ladder', () => {
  it('runs from plain to nasty, each colour adding one thing', () => {
    expect(pathogenColours).toEqual(['blue', 'yellow', 'red', 'green', 'orange', 'purple'])
  })

  it('makes yellow the same as blue but faster', () => {
    expect(yellowBacteria.speed).toBeGreaterThan(blueBacteria.speed)
    expect(yellowBacteria.damagePerSecond).toBe(blueBacteria.damagePerSecond)
  })

  it('makes red as fast as yellow, and harder hitting', () => {
    expect(redBacteria.speed).toBe(yellowBacteria.speed)
    expect(redBacteria.damagePerSecond).toBeGreaterThan(yellowBacteria.damagePerSecond)
  })

  it('draws a nastier one bigger, so it reads at a glance', () => {
    expect(yellowBacteria.length).toBeGreaterThan(blueBacteria.length)
    expect(redBacteria.length).toBeGreaterThan(yellowBacteria.length)
  })
})

describe('which colours something can drift to', () => {
  it('offers only the colours either side of it', () => {
    expect(mutationsOf(blueBacteria)).toEqual([yellowBacteria])
    expect(mutationsOf(yellowBacteria)).toEqual([blueBacteria, redBacteria])
  })

  it('offers nothing beyond the colours that exist yet', () => {
    // Red's other neighbour is green, which has no def, so it can only go back.
    expect(mutationsOf(redBacteria)).toEqual([yellowBacteria])
  })

  it('never offers a jump of two colours', () => {
    for (const def of pathogens) {
      const step = pathogenColours.indexOf(def.colour)

      for (const option of mutationsOf(def)) {
        const distance = Math.abs(pathogenColours.indexOf(option.colour) - step)
        expect(distance).toBe(1)
      }
    }
  })

  it('never offers a different family', () => {
    for (const def of pathogens) {
      for (const option of mutationsOf(def)) {
        expect(option.family).toBe(def.family)
      }
    }
  })
})

describe('mutating as they divide', () => {
  /** Runs a level of nothing but dividing bacteria and counts the colours. */
  function breed(seconds: number): Map<string, number> {
    const world = worldWith([])
    world.pathogens.push({
      id: 1,
      defId: 'blue-bacteria',
      x: 480,
      y: 300,
      angle: 0,
      health: blueBacteria.health,
      balls: blueBacteria.balls,
      alive: true,
      divideIn: 1,
      wanderIn: Number.MAX_SAFE_INTEGER,
    })

    run(world, seconds)

    const counts = new Map<string, number>()
    for (const pathogen of world.pathogens) {
      counts.set(pathogen.defId, (counts.get(pathogen.defId) ?? 0) + 1)
    }
    return counts
  }

  it('turns some of the children a shade along', () => {
    const counts = breed(180)

    expect(counts.get('blue-bacteria')).toBeGreaterThan(0)
    expect(counts.get('yellow-bacteria')).toBeGreaterThan(0)
  })

  /**
   * One generation, from a lot of parents at once.
   *
   * `mutationChance` is a roll made once per division, so that is what wants
   * measuring. Counting colours in a population that has been breeding for
   * minutes measures something else — mutants breed true and drift back, so
   * their share climbs well above the roll and wanders with the seed.
   */
  function breedOnce(parents: number, seed: number): { children: number; mutants: number } {
    const world = testWorld({ startingCells: [], seed })

    for (let i = 0; i < parents; i++) {
      world.pathogens.push({
        // Well clear of the ids the sim hands out, or the children it makes
        // would look like parents we had put there ourselves.
        id: 90000 + i,
        defId: 'blue-bacteria',
        // Spread out across the tissue, so they aren't all piled up together.
        x: 40 + (i % 40) * 22,
        y: 30 + Math.floor(i / 40) * 22,
        angle: 0,
        health: blueBacteria.health,
        balls: blueBacteria.balls,
        alive: true,
        divideIn: 1,
        wanderIn: Number.MAX_SAFE_INTEGER,
      })
    }

    const before = new Set(world.pathogens.map((pathogen) => pathogen.id))

    // Long enough for every parent to divide once, and nowhere near long enough
    // for any child to: a new one waits at least 0.6 of its 20 seconds.
    run(world, 3)

    const children = world.pathogens.filter((pathogen) => !before.has(pathogen.id))

    return {
      children: children.length,
      mutants: children.filter((pathogen) => pathogen.defId !== 'blue-bacteria').length,
    }
  }

  it('mutates roughly as often as the balance says', () => {
    // A batch has to stay well under maxPathogens or there is no room left for
    // anything to divide into, so the sample is pooled across several seeds.
    const batches = [1, 2, 3, 4].map((step) => breedOnce(120, theCut.seed + step))

    const children = batches.reduce((sum, batch) => sum + batch.children, 0)
    const mutants = batches.reduce((sum, batch) => sum + batch.mutants, 0)

    expect(children).toBe(480)

    // 480 rolls at a tenth land within a couple of percent of a tenth, so half
    // the rate and double it are both a very long way outside.
    expect(mutants / children).toBeGreaterThan(balance.mutationChance / 2)
    expect(mutants / children).toBeLessThan(balance.mutationChance * 2)
  })

  it('gives the child the health and speed of what it became, not its parent', () => {
    const counts = breed(180)
    expect(counts.get('yellow-bacteria')).toBeGreaterThan(0)

    const world = worldWith([])
    world.pathogens.push({
      id: 1,
      defId: 'blue-bacteria',
      x: 480,
      y: 300,
      angle: 0,
      health: blueBacteria.health,
      balls: blueBacteria.balls,
      alive: true,
      divideIn: 1,
      wanderIn: Number.MAX_SAFE_INTEGER,
    })
    run(world, 180)

    for (const pathogen of world.pathogens) {
      if (pathogen.defId !== 'yellow-bacteria') continue
      // Full health for a yellow, which is what it is now — not a blue's.
      expect(pathogen.health).toBeLessThanOrEqual(yellowBacteria.health)
    }
  })

  it('is the only way a new colour ever turns up', () => {
    // The level's waves are blue and nothing else.
    const world = testWorld({ waves: [{ at: 1, pathogen: 'blue-bacteria', count: 5 }] })

    run(world, 3)

    for (const pathogen of world.pathogens) {
      expect(pathogen.defId).toBe('blue-bacteria')
    }
  })

  it('builds the same infection every time from the same seed', () => {
    const first = breed(120)
    const second = breed(120)

    expect([...second.entries()].sort()).toEqual([...first.entries()].sort())
  })
})
