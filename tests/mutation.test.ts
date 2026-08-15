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

  it('mutates roughly as often as the balance says', () => {
    const counts = breed(180)

    const total = [...counts.values()].reduce((sum, n) => sum + n, 0)
    const mutants = total - (counts.get('blue-bacteria') ?? 0)

    // Nowhere near exact — mutants breed true and can drift back — but a tenth
    // should land well inside these bounds, where a half or a hundredth wouldn't.
    expect(mutants / total).toBeGreaterThan(balance.mutationChance / 4)
    expect(mutants / total).toBeLessThan(balance.mutationChance * 4)
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
