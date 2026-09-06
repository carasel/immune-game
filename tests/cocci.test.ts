import { describe, expect, it } from 'vitest'
import { neutrophil } from '../src/content/cells'
import {
  ballOffsets,
  ballsForColour,
  blueBacteria,
  blueCocci,
  cocciRadius,
  mutationsOf,
  redBacteria,
  redCocci,
  yellowBacteria,
  yellowCocci,
} from '../src/content/pathogens'
import { damagePathogen, loseBall, pathogenRadius } from '../src/sim/pathogens'
import { firstOfType, placeBacterium, run, runUntil, worldWith } from './helpers'

/**
 * COCCI — the clumps of balls.
 *
 * The one rule everything here is checking: only ever ONE ball comes off at a
 * time. A cocci is not a bacterium with more health, it is several bacteria
 * that have to be dealt with one after another, and that is what makes it a
 * tank rather than a bullet sponge.
 */

const oneMacrophage = [{ cell: 'macrophage', count: 1 }]
const oneNeutrophil = [{ cell: 'neutrophil', count: 1 }]
const granules = neutrophil.granules!

describe('how a clump is built', () => {
  it('starts at two balls and adds one for every colour up the ladder', () => {
    expect(ballsForColour('blue')).toBe(2)
    expect(ballsForColour('yellow')).toBe(3)
    expect(ballsForColour('red')).toBe(4)
    expect(ballsForColour('purple')).toBe(7)
  })

  it('gives each cocci the balls its colour calls for', () => {
    expect(blueCocci.balls).toBe(2)
    expect(yellowCocci.balls).toBe(3)
    expect(redCocci.balls).toBe(4)
  })

  it('leaves a rod as one single body', () => {
    expect(blueBacteria.balls).toBe(1)
    expect(blueBacteria.shape).toBe('rod')
  })

  it('sticks the balls together so each one touches its neighbour', () => {
    const balls = ballOffsets(3, 10)

    // Touching means centres exactly two radii apart. Any further and the clump
    // would have gaps in it; any closer and it would be a blob, not balls.
    expect(Math.hypot(balls[1].x - balls[0].x, balls[1].y - balls[0].y)).toBeCloseTo(20)
    expect(Math.hypot(balls[2].x - balls[0].x, balls[2].y - balls[0].y)).toBeCloseTo(20)
  })

  it('balances the clump on its own middle', () => {
    for (const count of [2, 3, 4, 7]) {
      const balls = ballOffsets(count, 8)
      const middleX = balls.reduce((sum, ball) => sum + ball.x, 0) / balls.length
      const middleY = balls.reduce((sum, ball) => sum + ball.y, 0) / balls.length

      expect(middleX, `${count} balls`).toBeCloseTo(0)
      expect(middleY, `${count} balls`).toBeCloseTo(0)
    }
  })

  it('makes a bigger clump take up more room', () => {
    expect(cocciRadius(3, 8)).toBeGreaterThan(cocciRadius(2, 8))
    expect(cocciRadius(7, 8)).toBeGreaterThan(cocciRadius(3, 8))
  })
})

describe('what a cocci is like to fight', () => {
  it('hits a body cell exactly as hard as the rod of the same colour', () => {
    expect(blueCocci.damagePerSecond).toBe(blueBacteria.damagePerSecond)
    expect(yellowCocci.damagePerSecond).toBe(yellowBacteria.damagePerSecond)
    expect(redCocci.damagePerSecond).toBe(redBacteria.damagePerSecond)
  })

  it('is slower than the rod of the same colour', () => {
    expect(blueCocci.speed).toBeLessThan(blueBacteria.speed)
    expect(yellowCocci.speed).toBeLessThan(yellowBacteria.speed)
  })

  it('is slow enough that everything hunting it can catch it', () => {
    // If a cocci could outrun a macrophage there would be no way to fight one.
    for (const cocci of [blueCocci, yellowCocci, redCocci]) {
      expect(cocci.speed, cocci.id).toBeLessThan(16)
    }
  })

  it('is worth more work than a rod, counting every ball', () => {
    expect(blueCocci.balls * blueCocci.health).toBeGreaterThan(blueBacteria.health)
  })
})

describe('knocking balls off', () => {
  it('takes one ball at a time, and only kills it on the last one', () => {
    const world = worldWith([])
    const clump = placeBacterium(world, 300, 300, 'blue-cocci')

    loseBall(clump, blueCocci)
    expect(clump.balls).toBe(1)
    expect(clump.alive).toBe(true)

    loseBall(clump, blueCocci)
    expect(clump.balls).toBe(0)
    expect(clump.alive).toBe(false)
  })

  it('gives the next ball its full health, however hurt the last one was', () => {
    const world = worldWith([])
    const clump = placeBacterium(world, 300, 300, 'blue-cocci')

    // Wear the first ball almost through, then take it off outright.
    damagePathogen(clump, blueCocci, blueCocci.health - 0.5)
    expect(clump.health).toBeCloseTo(0.5)

    loseBall(clump, blueCocci)

    expect(clump.balls).toBe(1)
    expect(clump.health).toBe(blueCocci.health)
  })

  it('never lets damage carry over from one ball to the next', () => {
    const world = worldWith([])
    const clump = placeBacterium(world, 300, 300, 'red-cocci')

    // One enormous hit. It should still only cost it the one ball.
    damagePathogen(clump, redCocci, redCocci.health * 10)

    expect(clump.balls).toBe(redCocci.balls - 1)
    expect(clump.alive).toBe(true)
  })

  it('makes the clump a smaller target as it comes apart', () => {
    const world = worldWith([])
    const clump = placeBacterium(world, 300, 300, 'red-cocci')

    const whole = pathogenRadius(clump, redCocci)
    loseBall(clump, redCocci)

    expect(pathogenRadius(clump, redCocci)).toBeLessThan(whole)
  })

  it('finishes a rod off with one, since a rod is a single body', () => {
    const world = worldWith([])
    const rod = placeBacterium(world, 300, 300)

    loseBall(rod, blueBacteria)

    expect(rod.alive).toBe(false)
  })
})

describe('a macrophage against a clump', () => {
  it('bites one ball off and leaves the rest of it swimming', () => {
    const world = worldWith(oneMacrophage)
    const cell = firstOfType(world, 'macrophage')
    const clump = placeBacterium(world, cell.x + 40, cell.y, 'blue-cocci')

    const bitten = runUntil(world, 20, () => cell.meal !== null)

    expect(bitten).not.toBeNull()
    expect(clump.alive).toBe(true)
    expect(clump.balls).toBe(1)
    expect(cell.meal?.pathogenDefId).toBe('blue-cocci')
  })

  it('has to digest that mouthful before it can come back for the next', () => {
    const world = worldWith(oneMacrophage)
    const cell = firstOfType(world, 'macrophage')
    const clump = placeBacterium(world, cell.x + 40, cell.y, 'blue-cocci')

    runUntil(world, 20, () => cell.meal !== null)

    // Pinned right against it: still safe, because the cell is busy.
    clump.x = cell.x
    clump.y = cell.y
    run(world, 1)

    expect(clump.balls).toBe(1)
    expect(clump.alive).toBe(true)
  })

  it('finishes the whole clump off in the end', () => {
    const world = worldWith(oneMacrophage)
    const cell = firstOfType(world, 'macrophage')
    const clump = placeBacterium(world, cell.x + 40, cell.y, 'blue-cocci')

    const cleared = runUntil(world, 60, () => !clump.alive)

    expect(cleared).not.toBeNull()
  })
})

describe('a neutrophil against a clump', () => {
  it('knocks a whole ball off with every granule that lands', () => {
    const world = worldWith(oneNeutrophil)
    const cell = firstOfType(world, 'neutrophil')
    const clump = placeBacterium(world, cell.x + granules.range * 0.6, cell.y, 'red-cocci')

    const hit = runUntil(world, 20, () => clump.balls < redCocci.balls)

    expect(hit).not.toBeNull()
    // One granule, one ball — not the whole clump, and not a slice of one.
    expect(clump.balls).toBe(redCocci.balls - 1)
    expect(clump.health).toBe(redCocci.health)
  })
})

describe('a clump that is told to be chased', () => {
  it('keeps the order until every ball is gone', () => {
    const world = worldWith(oneMacrophage)
    const cell = firstOfType(world, 'macrophage')
    const clump = placeBacterium(world, cell.x + 60, cell.y, 'blue-cocci')

    world.selectImmuneCellAt(cell.x, cell.y)
    expect(world.orderSelectedToChase(clump.id)).toBe(true)

    // It has taken a ball and is digesting, but the job is not finished, so it
    // is still under orders.
    runUntil(world, 20, () => cell.meal !== null)
    expect(clump.balls).toBe(1)
    expect(cell.order).not.toBeNull()

    // Once the clump is gone, so is the order.
    runUntil(world, 60, () => !clump.alive)
    run(world, 0.1)
    expect(cell.order).toBeNull()
  })
})

describe('a clump dividing', () => {
  it('makes a whole new clump, even from a half-eaten parent', () => {
    const world = worldWith([])
    const clump = placeBacterium(world, 300, 300, 'red-cocci')

    loseBall(clump, redCocci)
    loseBall(clump, redCocci)
    expect(clump.balls).toBe(2)

    clump.divideIn = 0.1
    runUntil(world, 5, () => world.pathogens.length > 1)

    const child = world.pathogens.find((pathogen) => pathogen.id !== clump.id)
    expect(child?.balls).toBe(redCocci.balls)
  })
})

describe('drifting colour', () => {
  it('keeps its shape: a clump can only ever become another clump', () => {
    expect(mutationsOf(blueCocci)).toEqual([yellowCocci])
    expect(mutationsOf(yellowCocci)).toEqual([blueCocci, redCocci])
  })

  it('never turns a rod into a clump, or a clump into a rod', () => {
    for (const def of [blueBacteria, yellowBacteria, redBacteria, blueCocci, yellowCocci, redCocci]) {
      for (const option of mutationsOf(def)) {
        expect(option.shape, `${def.id} -> ${option.id}`).toBe(def.shape)
      }
    }
  })
})
