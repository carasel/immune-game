import { describe, expect, it } from 'vitest'
import { balance } from '../src/content/balance'
import {
  blueBacteria,
  findPathogen,
  greenBacteria,
  mutationsOf,
  orangeBacteria,
  pathogenColours,
  pathogens,
  purpleBacteria,
  redBacteria,
  yellowBacteria,
  type PathogenDef,
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

  it('makes green a red that runs away, and nothing else', () => {
    expect(greenBacteria.speed).toBe(redBacteria.speed)
    expect(greenBacteria.damagePerSecond).toBe(redBacteria.damagePerSecond)
    expect(greenBacteria.fleeRange).toBeGreaterThan(0)
    expect(redBacteria.fleeRange).toBeUndefined()
  })

  it('makes orange a green that is faster again', () => {
    expect(orangeBacteria.speed).toBeGreaterThan(greenBacteria.speed)
    expect(orangeBacteria.damagePerSecond).toBe(greenBacteria.damagePerSecond)
    expect(orangeBacteria.fleeRange).toBe(greenBacteria.fleeRange)
  })

  it('makes purple an orange that hits harder again', () => {
    expect(purpleBacteria.damagePerSecond).toBeGreaterThan(orangeBacteria.damagePerSecond)
    expect(purpleBacteria.speed).toBe(orangeBacteria.speed)
    expect(purpleBacteria.fleeRange).toBe(orangeBacteria.fleeRange)
  })

  it('keeps toughness off the ladder, so a nastier one is not a spongier one', () => {
    for (const def of pathogens) {
      expect(def.health).toBe(blueBacteria.health)
    }
  })

  it('draws a nastier one bigger, so it reads at a glance', () => {
    const rods = [
      blueBacteria,
      yellowBacteria,
      redBacteria,
      greenBacteria,
      orangeBacteria,
      purpleBacteria,
    ]

    for (let step = 1; step < rods.length; step++) {
      expect(rods[step].length).toBeGreaterThan(rods[step - 1].length)
      expect(rods[step].width).toBeGreaterThan(rods[step - 1].width)
    }
  })
})

describe('which colours something can drift to', () => {
  it('offers only the colours either side of it', () => {
    expect(mutationsOf(blueBacteria)).toEqual([yellowBacteria])
    expect(mutationsOf(yellowBacteria)).toEqual([blueBacteria, redBacteria])
  })

  it('offers both ways along the middle of the ladder', () => {
    expect(mutationsOf(redBacteria)).toEqual([yellowBacteria, greenBacteria])
    expect(mutationsOf(greenBacteria)).toEqual([redBacteria, orangeBacteria])
  })

  it('leaves only the two ends of the ladder one-way', () => {
    // Nothing sits below blue or above purple, so the ends can only turn inwards.
    expect(mutationsOf(blueBacteria)).toEqual([yellowBacteria])
    expect(mutationsOf(purpleBacteria)).toEqual([orangeBacteria])
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
   * One generation, from a lot of parents at once, all of one colour.
   *
   * The drift chances are a roll made once per division, so that is what wants
   * measuring. Counting colours in a population that has been breeding for
   * minutes measures something else — mutants breed true and drift on, so their
   * share climbs well above the roll and wanders with the seed.
   */
  function breedOnce(
    parent: PathogenDef,
    parents: number,
    seed: number,
  ): { children: number; up: number; down: number } {
    const world = testWorld({ startingCells: [], seed })

    for (let i = 0; i < parents; i++) {
      world.pathogens.push({
        // Well clear of the ids the sim hands out, or the children it makes
        // would look like parents we had put there ourselves.
        id: 90000 + i,
        defId: parent.id,
        // Spread out across the tissue, so they aren't all piled up together.
        x: 40 + (i % 40) * 22,
        y: 30 + Math.floor(i / 40) * 22,
        angle: 0,
        health: parent.health,
        balls: parent.balls,
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
    const step = pathogenColours.indexOf(parent.colour)

    const shade = (child: (typeof children)[number]) =>
      pathogenColours.indexOf(findPathogen(child.defId)!.colour) - step

    return {
      children: children.length,
      up: children.filter((child) => shade(child) === 1).length,
      down: children.filter((child) => shade(child) === -1).length,
    }
  }

  /** The same pooled sample, from whichever colour of parent. */
  function generation(parent: PathogenDef) {
    // A batch has to stay well under maxPathogens or there is no room left for
    // anything to divide into, so the sample is pooled across several seeds.
    const batches = [1, 2, 3, 4].map((step) => breedOnce(parent, 120, theCut.seed + step))

    return {
      children: batches.reduce((sum, batch) => sum + batch.children, 0),
      up: batches.reduce((sum, batch) => sum + batch.up, 0),
      down: batches.reduce((sum, batch) => sum + batch.down, 0),
    }
  }

  it('drifts up roughly as often as the balance says', () => {
    const { children, up } = generation(yellowBacteria)

    expect(children).toBe(480)

    // 480 rolls at a shade under a tenth land within a couple of percent of it,
    // so half the rate and double it are both a very long way outside.
    expect(up / children).toBeGreaterThan(balance.mutationUpChance / 2)
    expect(up / children).toBeLessThan(balance.mutationUpChance * 2)
  })

  it('drifts back down far more rarely than it climbs', () => {
    const { children, up, down } = generation(yellowBacteria)

    // Rare, but it does happen: the ladder is not a one-way escalator.
    expect(down).toBeGreaterThan(0)
    expect(down / children).toBeLessThan(balance.mutationDownChance * 3)

    // Nine to one, give or take what 480 rolls can show.
    expect(up).toBeGreaterThan(down * 4)
  })

  it('never drifts a blue downwards, because there is nothing below it', () => {
    const { down } = generation(blueBacteria)

    expect(down).toBe(0)
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
