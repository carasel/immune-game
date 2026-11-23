import { describe, expect, it } from 'vitest'
import { balance } from '../src/content/balance'
import { greenBacteria } from '../src/content/pathogens'
import { stickyTarget } from '../src/sim/targeting'
import {
  cellsOfType,
  firstOfType,
  placeBacterium,
  run,
  runUntil,
  stripTissue,
  worldWith,
} from './helpers'

/**
 * Sticking with a target.
 *
 * Halfway between two things the same distance away, "go for the nearest" is a
 * trap: one step towards either makes the other one nearest. So anything that
 * hunts remembers what it was going for, and only swaps when something else is
 * clearly closer — balance.retargetMargin closer.
 */

const everything = () => true
const at = (id: number, x: number, y: number) => ({ id, x, y })

describe('picking a target and sticking with it', () => {
  const me = { x: 0, y: 0 }

  it('goes for the nearest one when it was not going for anything', () => {
    const picked = stickyTarget(me, 100, [at(1, 50, 0), at(2, 40, 0)], everything, null)
    expect(picked?.id).toBe(2)
  })

  it('keeps going for the one it picked when another is only a hair closer', () => {
    const picked = stickyTarget(me, 100, [at(1, 50, 0), at(2, 49, 0)], everything, 1)
    expect(picked?.id).toBe(1)
  })

  it('swaps when another one is clearly closer', () => {
    const clearlyCloser = 50 * (1 - balance.retargetMargin) - 1
    const picked = stickyTarget(
      me,
      100,
      [at(1, 50, 0), at(2, clearlyCloser, 0)],
      everything,
      1,
    )
    expect(picked?.id).toBe(2)
  })

  it('swaps when the one it picked is gone', () => {
    const targets = [at(1, 30, 0), at(2, 50, 0)]
    const picked = stickyTarget(me, 100, targets, (target) => target.id !== 1, 1)
    expect(picked?.id).toBe(2)
  })

  it('swaps when the one it picked has gone out of sight', () => {
    const picked = stickyTarget(me, 100, [at(1, 120, 0), at(2, 90, 0)], everything, 1)
    expect(picked?.id).toBe(2)
  })

  it('gives up when there is nothing left to go for', () => {
    const picked = stickyTarget(me, 100, [at(1, 120, 0)], everything, 1)
    expect(picked).toBeUndefined()
  })
})

const oneMacrophage = [{ cell: 'macrophage', count: 1, at: { x: 0.1, y: 0.24 } }]
const twoMacrophages = [{ cell: 'macrophage', count: 2, at: { x: 0.1, y: 0.24 } }]

describe('a macrophage between two bacteria the same distance away', () => {
  it('commits to one and eats it, rather than turning back and forth', () => {
    const world = worldWith(oneMacrophage)
    stripTissue(world, 0)
    const cell = firstOfType(world, 'macrophage')
    // Swimming towards it, side by side, so neither gets away or ahead.
    for (const side of [-1, 1]) {
      placeBacterium(world, cell.x + 60, cell.y + side * 30).angle = Math.PI
    }

    run(world, 1 / 60)
    const picked = cell.preyId
    expect(picked).not.toBeNull()

    const swallowed = runUntil(world, 20, () => {
      // Every tick until it eats, it is still going for the same one.
      if (cell.meal === null) expect(cell.preyId).toBe(picked)
      return cell.meal !== null
    })

    expect(swallowed).not.toBeNull()
    expect(world.pathogens.find((pathogen) => pathogen.id === picked)?.alive).toBe(false)
  })
})

describe('a green rod between two hunters the same distance away', () => {
  it('runs straight away from the middle of them, not from one then the other', () => {
    const world = worldWith(twoMacrophages)
    stripTissue(world, 0)
    const [above, below] = cellsOfType(world, 'macrophage')
    if (!above || !below) throw new Error('expected two macrophages')

    const green = placeBacterium(world, above.x + 100, above.y + 60, 'green-bacteria')
    above.x = green.x - 50
    above.y = green.y - 50
    below.x = green.x - 50
    below.y = green.y + 50

    const startX = green.x
    const startY = green.y
    run(world, 0.5)

    // Away from both, which is straight along the line between them.
    expect(green.x).toBeGreaterThan(startX)
    expect(Math.abs(green.y - startY)).toBeLessThan(1)
  })
})

describe('a green rod with a second hunter hovering on the edge of its range', () => {
  it('keeps running the same way, rather than jerking round each time it crosses', () => {
    const world = worldWith(twoMacrophages)
    stripTissue(world, 0)
    const [near, edge] = cellsOfType(world, 'macrophage')
    if (!near || !edge) throw new Error('expected two macrophages')

    // Both busy digesting, so neither moves itself: the test moves them.
    for (const cell of [near, edge]) {
      cell.meal = { kind: 'pus', secondsLeft: 999, totalSeconds: 999, reward: 0 }
    }

    const green = placeBacterium(world, 480, 275, 'green-bacteria')
    const outer = greenBacteria.fleeRange! * (1 + balance.stopFleeingMargin)

    let worstTurn = 0
    let lastAngle: number | null = null
    for (let tick = 0; tick < 120; tick++) {
      // One hunter close behind it, the other bobbing just inside then just
      // outside the edge of what it is watching, every single tick.
      near.x = green.x - 60
      near.y = green.y
      edge.x = green.x
      edge.y = green.y + outer + (tick % 2 === 0 ? -1 : 1)

      world.step()

      if (lastAngle !== null) {
        const turned = Math.abs(Math.atan2(Math.sin(green.angle - lastAngle), Math.cos(green.angle - lastAngle)))
        worstTurn = Math.max(worstTurn, turned)
      }
      lastAngle = green.angle
    }

    expect(green.fleeing).toBe(true)
    expect(worstTurn).toBeLessThan(0.05)
  })
})

describe('a green rod on the edge of its flee range', () => {
  it('does not shudder between running and going for its food', () => {
    const world = worldWith(oneMacrophage)
    stripTissue(world, 1)
    const food = world.bodyCells[0]!
    const cell = firstOfType(world, 'macrophage')

    // Pointing from the food towards the middle of the screen, where there's room.
    const towardsMiddle = Math.atan2(275 - food.y, 480 - food.x)
    const along = (d: number) => ({
      x: food.x + Math.cos(towardsMiddle) * d,
      y: food.y + Math.sin(towardsMiddle) * d,
    })

    // The macrophage sits between the rod and its only food, busy digesting so
    // it stays put. The rod is just outside its 120 flee range of it, and can
    // see the food beyond.
    Object.assign(cell, along(30))
    cell.meal = { kind: 'pus', secondsLeft: 999, totalSeconds: 999, reward: 0 }
    const green = placeBacterium(world, along(152).x, along(152).y, 'green-bacteria')

    let changes = 0
    let was = green.fleeing
    for (let tick = 0; tick < 180; tick++) {
      world.step()
      if (green.fleeing !== was) changes++
      was = green.fleeing
    }

    // It panics, runs until it is well clear, comes back, panics... a few times
    // in three seconds at most — not every other tick.
    expect(changes).toBeGreaterThan(0)
    expect(changes).toBeLessThan(10)
  })
})
