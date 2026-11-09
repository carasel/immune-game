import { describe, expect, it } from 'vitest'
import {
  blueBacteria,
  blueSpiral,
  mutationsOf,
  redBacteria,
  redSpiral,
  spiralAverageSpeed,
  yellowBacteria,
  yellowSpiral,
} from '../src/content/pathogens'
import { spiralBody } from '../src/render/shapes'
import type { Pathogen } from '../src/sim/pathogens'
import type { BodyCell } from '../src/sim/tissue'
import { placeBacterium, run, runUntil, worldWith } from './helpers'
import type { World } from '../src/sim/world'

/**
 * SPIRALS — the wanderers that came in on a tick.
 *
 * What makes them a spiral: they never go for anything. They dart, rest, and
 * dart off somewhere new, and only hurt a body cell while they are on top of
 * it. The damage ends up spread all over the tissue instead of finishing cells
 * off one at a time.
 */

const spirals = [blueSpiral, yellowSpiral, redSpiral]
const rodOfSameColour = new Map([
  [blueSpiral, blueBacteria],
  [yellowSpiral, yellowBacteria],
  [redSpiral, redBacteria],
])

/** A spiral sitting still mid-rest, for as long as the test likes. */
function restingSpiral(world: World, x: number, y: number, defId = 'blue-spiral'): Pathogen {
  const spiral = placeBacterium(world, x, y, defId)
  spiral.resting = true
  spiral.wanderIn = Number.MAX_SAFE_INTEGER
  return spiral
}

/** Two living body cells side by side, touching or as near as the tissue has. */
function neighbours(world: World): [BodyCell, BodyCell] {
  const first = world.bodyCells[0]
  let nearest = world.bodyCells[1]

  for (const cell of world.bodyCells.slice(1)) {
    if (gap(first, cell) < gap(first, nearest)) nearest = cell
  }

  return [first, nearest]
}

function gap(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function totalHealth(world: World): number {
  return world.bodyCells.reduce((sum, cell) => sum + (cell.alive ? cell.health : 0), 0)
}

describe('what a spiral is', () => {
  it('is faster than the rod of its colour, on average', () => {
    for (const spiral of spirals) {
      const rod = rodOfSameColour.get(spiral)!
      expect(spiralAverageSpeed(spiral), spiral.id).toBeGreaterThan(rod.speed)
    }
  })

  it('gets "faster" at yellow from shorter rests, not quicker darts', () => {
    expect(yellowSpiral.speed).toBe(blueSpiral.speed)
    expect(yellowSpiral.dartSeconds).toBe(blueSpiral.dartSeconds)
    expect(yellowSpiral.restSeconds).toBeLessThan(blueSpiral.restSeconds)
  })

  it('hurts a body cell exactly as hard as the rod of its colour, and divides as often', () => {
    for (const spiral of spirals) {
      const rod = rodOfSameColour.get(spiral)!
      expect(spiral.damagePerSecond, spiral.id).toBe(rod.damagePerSecond)
      expect(spiral.divideEverySeconds, spiral.id).toBe(rod.divideEverySeconds)
    }
  })

  it('dies whole, like a rod', () => {
    for (const spiral of spirals) {
      expect(spiral.balls).toBe(1)
      expect(spiral.health).toBe(rodOfSameColour.get(spiral)!.health)
    }
  })

  it('never looks for anything to eat', () => {
    for (const spiral of spirals) expect(spiral.visionRange).toBe(0)
  })

  it('drifts to another spiral, and only to one that exists', () => {
    expect(mutationsOf(blueSpiral)).toEqual([yellowSpiral])
    expect(mutationsOf(yellowSpiral)).toEqual([blueSpiral, redSpiral])
    // Green spirals aren't decided yet, so a red one can only drift back down.
    expect(mutationsOf(redSpiral)).toEqual([yellowSpiral])
  })
})

describe('how a spiral moves', () => {
  it('sits dead still while it rests', () => {
    const world = worldWith([])
    const spiral = restingSpiral(world, 400, 300)

    run(world, 2)

    expect(spiral.x).toBe(400)
    expect(spiral.y).toBe(300)
  })

  it('darts off in a new direction after every rest', () => {
    const world = worldWith([])
    const spiral = placeBacterium(world, 500, 350, 'blue-spiral')
    spiral.wanderIn = 0

    const headings = new Set<number>()
    let wasResting = spiral.resting

    runUntil(world, 20, () => {
      if (wasResting && !spiral.resting) headings.add(Math.round(spiral.angle * 100))
      wasResting = spiral.resting
      return false
    })

    // About 20 darts in 20 seconds. All of them in different directions, give
    // or take a bounce off the edge landing on the same one by chance.
    expect(headings.size).toBeGreaterThan(15)
  })

  it('gets about at its average speed, darts and rests together', () => {
    const world = worldWith([])
    const spiral = placeBacterium(world, 500, 350, 'blue-spiral')
    spiral.wanderIn = 0

    let travelled = 0
    let last = { x: spiral.x, y: spiral.y }

    runUntil(world, 30, () => {
      travelled += gap(last, spiral)
      last = { x: spiral.x, y: spiral.y }
      return false
    })

    expect(travelled / 30).toBeCloseTo(spiralAverageSpeed(blueSpiral), -1)
  })
})

describe('how a spiral hurts the tissue', () => {
  it('hurts a body cell it is on top of, at its colour rate', () => {
    const world = worldWith([])
    const cell = world.bodyCells[0]
    restingSpiral(world, cell.x, cell.y)

    run(world, 2)

    expect(cell.health).toBeCloseTo(1 - blueSpiral.damagePerSecond * 2, 2)
  })

  it('leaves the tissue alone when it is not touching any of it', () => {
    const world = worldWith([])
    const before = totalHealth(world)

    // The top corner, well out of the tissue.
    restingSpiral(world, 5, 5)
    run(world, 3)

    expect(totalHealth(world)).toBe(before)
  })

  it('hurts only one cell at a time, even when it straddles two', () => {
    const world = worldWith([])
    const [a, b] = neighbours(world)
    restingSpiral(world, (a.x + b.x) / 2, (a.y + b.y) / 2)

    const before = totalHealth(world)
    run(world, 2)

    // Twice as hard as a rod would be a spiral that hits harder, not one that
    // spreads its damage about.
    expect(before - totalHealth(world)).toBeCloseTo(blueSpiral.damagePerSecond * 2, 2)
  })

  it('spreads its damage over many cells instead of killing one', () => {
    const world = worldWith([])
    const middle = world.bodyCells[Math.floor(world.bodyCells.length / 2)]
    const spiral = placeBacterium(world, middle.x, middle.y, 'blue-spiral')
    spiral.wanderIn = 0

    run(world, 20)

    // A blue rod sat on one cell would have killed it in about 11 seconds. In
    // 20 the spiral has hurt several and finished none of them, because it
    // never stays long enough on any one.
    const hurt = world.bodyCells.filter((cell) => cell.health < 1)
    expect(hurt.length).toBeGreaterThanOrEqual(3)
    expect(world.bodyCells.every((cell) => cell.alive)).toBe(true)
  })
})

describe('fighting a spiral', () => {
  it('is cleared by a macrophage that reaches it', () => {
    const world = worldWith([{ cell: 'macrophage', count: 1 }])
    const macrophage = world.immuneCells[0]
    const spiral = restingSpiral(world, macrophage.x + 30, macrophage.y)

    expect(runUntil(world, 10, () => !spiral.alive)).not.toBeNull()
  })
})

describe('how a spiral is drawn', () => {
  const shape = { length: 30, waveHeight: 4, waves: 2.5 }

  it('runs its full length, centred on its own middle', () => {
    const body = spiralBody(shape, 0)

    expect(body[0].x).toBeCloseTo(-15)
    expect(body[body.length - 1].x).toBeCloseTo(15)
  })

  it('never swings further than its wave height', () => {
    for (const phase of [0, 1, 2, 3]) {
      for (const point of spiralBody(shape, phase)) {
        expect(Math.abs(point.y)).toBeLessThanOrEqual(shape.waveHeight + 1e-9)
      }
    }
  })

  it('wriggles as the phase winds on, and comes back round after a whole turn', () => {
    const start = spiralBody(shape, 0)
    const later = spiralBody(shape, 1)
    const round = spiralBody(shape, Math.PI * 2)

    expect(later[5].y).not.toBeCloseTo(start[5].y, 3)
    for (let i = 0; i < start.length; i++) expect(round[i].y).toBeCloseTo(start[i].y, 6)
  })
})
