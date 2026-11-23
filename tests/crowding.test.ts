import { describe, expect, it } from 'vitest'
import { balance } from '../src/content/balance'
import { crowdPathogens, settleTissue, tissueSpeedFactor } from '../src/sim/crowding'
import { bodyCellWidth, type BodyCell } from '../src/sim/tissue'
import { bounds, firstOfType, gap, run, runUntil, worldWith } from './helpers'

const dt = 1 / 60
const radius = balance.bodyCellRadius

function bodyCell(id: number, x: number, y: number, state: 'alive' | 'debris' = 'alive'): BodyCell {
  return {
    id,
    x,
    y,
    homeX: x,
    homeY: y,
    radius,
    health: state === 'alive' ? 1 : 0,
    alive: state === 'alive',
    debris: state === 'debris',
    wobbleSeed: 0,
  }
}

const fromHome = (cell: BodyCell) => Math.hypot(cell.x - cell.homeX, cell.y - cell.homeY)

describe('how fast things move through tissue', () => {
  const cell = bodyCell(1, 300, 300)
  const mover = 10

  it('is full speed in the open', () => {
    expect(tissueSpeedFactor([cell], { x: 100, y: 100 }, { x: 101, y: 100 }, mover)).toBe(1)
  })

  it('slows down to push a living body cell aside', () => {
    const edge = 300 - radius - mover
    const factor = tissueSpeedFactor([cell], { x: edge, y: 300 }, { x: edge + 1, y: 300 }, mover)
    expect(factor).toBe(balance.pushSpeedMultiplier)
  })

  it('pushes debris aside more easily than a living cell', () => {
    const husk = bodyCell(2, 300, 300, 'debris')
    const edge = 300 - radius - mover
    const factor = tissueSpeedFactor([husk], { x: edge, y: 300 }, { x: edge + 1, y: 300 }, mover)

    expect(factor).toBe(balance.pushDebrisSpeedMultiplier)
    expect(factor).toBeGreaterThan(balance.pushSpeedMultiplier)
  })

  it('squeezes once the tissue has stopped giving way', () => {
    // Already well inside it: the cell was pushed as far as it goes, and stayed.
    const factor = tissueSpeedFactor([cell], { x: 290, y: 300 }, { x: 291, y: 300 }, mover)
    expect(factor).toBe(balance.squeezeSpeedMultiplier)
  })

  it('ignores a body cell that has been eaten and is gone for good', () => {
    const gone = { ...bodyCell(3, 300, 300), alive: false, debris: false }
    expect(tissueSpeedFactor([gone], { x: 290, y: 300 }, { x: 291, y: 300 }, mover)).toBe(1)
  })
})

describe('springy body cells', () => {
  it('get pushed out of the way of anything overlapping them', () => {
    // Only a small overlap, so it is well inside however far a cell can be pushed.
    const mover = { x: 300 - radius - 15, y: 300, radius: 20 }
    const cell = bodyCell(1, 300, 300)
    settleTissue([cell], [mover], dt, bounds)

    expect(gap(cell, mover)).toBeCloseTo(radius + 20, 3)
    expect(cell.x).toBeGreaterThan(300)
  })

  it('spring back home once nothing is pushing', () => {
    const cell = bodyCell(1, 300, 300)
    cell.x = 330

    // Well over two thirds of the way home inside one spring time...
    for (let tick = 0; tick < 60 * balance.bodyCellSpringBackSeconds; tick++) {
      settleTissue([cell], [], dt, bounds)
    }
    expect(fromHome(cell)).toBeLessThan(30 * 0.4)

    // ...and all the way there given long enough.
    for (let tick = 0; tick < 60 * 10; tick++) settleTissue([cell], [], dt, bounds)
    expect(fromHome(cell)).toBe(0)
  })

  it('only go so far, however hard they are pushed', () => {
    const cell = bodyCell(1, 300, 300)
    const limit = balance.bodyCellMaxPush * bodyCellWidth()

    // Something big sat right on top of it and walking on through.
    for (let x = 250; x < 400; x += 2) {
      settleTissue([cell], [{ x, y: 300, radius: 40 }], dt, bounds)
      expect(fromHome(cell)).toBeLessThanOrEqual(limit + 1e-6)
    }
  })

  it('shove their neighbours along rather than overlapping them', () => {
    const width = bodyCellWidth()
    const a = bodyCell(1, 300, 300)
    const b = bodyCell(2, 300 + width, 300)

    settleTissue([a, b], [{ x: 300 - radius, y: 300, radius: 20 }], dt, bounds)

    expect(b.x).toBeGreaterThan(b.homeX)
    expect(gap(a, b)).toBeGreaterThan(width - 0.5)
  })

  it('leaves the debris to do the moving when a husk meets a living cell', () => {
    const width = bodyCellWidth()
    const living = bodyCell(1, 300, 300)
    const husk = bodyCell(2, 300 + width - 10, 300, 'debris')
    husk.homeX = 400

    settleTissue([living, husk], [], dt, bounds)

    expect(living.x).toBe(300)
    expect(gap(living, husk)).toBeGreaterThan(width - 0.5)
  })
})

describe('an immune cell walking through tissue', () => {
  it('pushes the body cells aside and they spring back after it has gone', () => {
    const world = worldWith([{ cell: 'macrophage', count: 1, at: { x: 0.05, y: 0.05 } }])
    const target = world.bodyCells[Math.floor(world.bodyCells.length / 2)]
    const macrophage = firstOfType(world, 'macrophage')

    // Start just to one side of a body cell and walk straight through it.
    macrophage.x = target.x - 60
    macrophage.y = target.y
    world.selectImmuneCellAt(macrophage.x, macrophage.y)
    world.orderSelectedTo(target.x + 80, target.y)

    let furthest = 0
    runUntil(world, 20, () => {
      furthest = Math.max(furthest, fromHome(target))
      return macrophage.order === null
    })

    expect(furthest, 'the body cell never gave way').toBeGreaterThan(5)

    // Off somewhere else entirely, and give the tissue time to settle.
    macrophage.x = 20
    macrophage.y = 20
    world.selectImmuneCellAt(20, 20)
    world.orderSelectedTo(20, 20)
    run(world, 8 * balance.bodyCellSpringBackSeconds)

    expect(fromHome(target)).toBeLessThan(0.5)
  })
})

describe('bacteria crowding each other', () => {
  const r = 5
  const minGap = 2 * r * (1 - balance.bacteriaOverlap)

  function pile(count: number) {
    return Array.from({ length: count }, (_, i) => ({ id: i + 1, x: 400, y: 300, alive: true }))
  }

  it('spreads a pile out until no two overlap by more than allowed', () => {
    const bugs = pile(20)
    for (let tick = 0; tick < 300; tick++) crowdPathogens(bugs, () => r, () => false, bounds)

    for (let i = 0; i < bugs.length; i++) {
      for (let j = i + 1; j < bugs.length; j++) {
        expect(gap(bugs[i], bugs[j])).toBeGreaterThan(minGap - 0.05)
      }
    }
  })

  it('still lets them overlap a good deal, so a big infection fits on the screen', () => {
    const bugs = pile(20)
    for (let tick = 0; tick < 300; tick++) crowdPathogens(bugs, () => r, () => false, bounds)

    const closest = Math.min(
      ...bugs.flatMap((a, i) => bugs.slice(i + 1).map((b) => gap(a, b))),
    )
    expect(closest).toBeLessThan(2 * r)
  })

  it('never moves one stuck in a NET', () => {
    const bugs = pile(2)
    crowdPathogens(bugs, () => r, (bug) => bug.id === 1, bounds)

    expect(bugs[0]).toMatchObject({ x: 400, y: 300 })
    expect(gap(bugs[0], bugs[1])).toBeCloseTo(minGap, 6)
  })

  it('leaves dead ones alone', () => {
    const bugs = pile(2)
    bugs[1].alive = false
    crowdPathogens(bugs, () => r, () => false, bounds)

    expect(bugs[0]).toMatchObject({ x: 400, y: 300 })
    expect(bugs[1]).toMatchObject({ x: 400, y: 300 })
  })
})
