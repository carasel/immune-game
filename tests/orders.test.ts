import { describe, expect, it } from 'vitest'
import { macrophage } from '../src/content/cells'
import { bounds, firstOfType, gap, placeBacterium, run, runUntil, worldWith } from './helpers'

const oneMacrophage = [{ cell: 'macrophage', count: 1 }]

describe('picking a cell up', () => {
  it('selects the cell you clicked on', () => {
    const world = worldWith(oneMacrophage)
    const cell = firstOfType(world, 'macrophage')

    expect(world.selectImmuneCellAt(cell.x, cell.y)).toBe(cell)
    expect(world.selectedImmuneCell).toBe(cell)
  })

  it('ignores a click that misses, and keeps whatever was selected', () => {
    const world = worldWith(oneMacrophage)
    const cell = firstOfType(world, 'macrophage')
    world.selectImmuneCellAt(cell.x, cell.y)

    expect(world.selectImmuneCellAt(cell.x + macrophage.radius + 5, cell.y)).toBeNull()
    expect(world.selectedImmuneCell).toBe(cell)
  })

  it('takes the nearest cell when two overlap', () => {
    const world = worldWith([{ cell: 'macrophage', count: 2 }])
    const [a, b] = world.immuneCells
    a.x = 400
    a.y = 300
    b.x = 430
    b.y = 300

    expect(world.selectImmuneCellAt(425, 300)).toBe(b)
  })

  it('drops the selection when the cell dies', () => {
    const world = worldWith(oneMacrophage)
    const cell = firstOfType(world, 'macrophage')
    world.selectImmuneCellAt(cell.x, cell.y)

    cell.alive = false

    expect(world.selectedImmuneCell).toBeNull()
  })

  it('lets go on request', () => {
    const world = worldWith(oneMacrophage)
    const cell = firstOfType(world, 'macrophage')
    world.selectImmuneCellAt(cell.x, cell.y)

    world.clearSelection()

    expect(world.selectedImmuneCell).toBeNull()
  })
})

describe('sending a cell somewhere', () => {
  it('does nothing at all when no cell is selected', () => {
    const world = worldWith(oneMacrophage)

    expect(world.orderSelectedTo(400, 300)).toBe(false)
    expect(firstOfType(world, 'macrophage').order).toBeNull()
  })

  it('walks there and arrives', () => {
    const world = worldWith(oneMacrophage)
    const cell = firstOfType(world, 'macrophage')
    world.selectImmuneCellAt(cell.x, cell.y)

    const target = { x: 480, y: 300 }
    world.orderSelectedTo(target.x, target.y)

    const arrived = runUntil(world, 180, () => cell.order === null)

    expect(arrived).not.toBeNull()
    expect(gap(cell, target)).toBeLessThan(3)
  })

  it('ignores a bacterium on the way, then goes back for it once it arrives', () => {
    const world = worldWith(oneMacrophage)
    const cell = firstOfType(world, 'macrophage')
    world.selectImmuneCellAt(cell.x, cell.y)

    const target = { x: Math.min(cell.x + 300, bounds.width - 40), y: cell.y }
    world.orderSelectedTo(target.x, target.y)

    // Right on the route, well inside vision range.
    const bacterium = placeBacterium(world, (cell.x + target.x) / 2, cell.y)

    let ateOnTheWay = false
    runUntil(world, 180, () => {
      if (cell.meal) ateOnTheWay = true
      return cell.order === null
    })

    expect(ateOnTheWay).toBe(false)
    expect(bacterium.alive).toBe(true)

    // Order done, hunting resumes.
    const hunted = runUntil(world, 60, () => !bacterium.alive)
    expect(hunted).not.toBeNull()
  })

  it('finishes its meal first, then sets off', () => {
    const world = worldWith(oneMacrophage)
    const cell = firstOfType(world, 'macrophage')
    placeBacterium(world, cell.x + 40, cell.y)
    runUntil(world, 20, () => cell.meal !== null)

    const where = { x: cell.x, y: cell.y }
    world.selectImmuneCellAt(cell.x, cell.y)
    world.orderSelectedTo(cell.x + 120, cell.y)

    run(world, macrophage.engulfPathogenSeconds * 0.5)
    expect(gap(cell, where)).toBe(0)

    const arrived = runUntil(world, 180, () => cell.order === null)
    expect(arrived).not.toBeNull()
  })

  it('keeps the destination inside the world', () => {
    const world = worldWith(oneMacrophage)
    const cell = firstOfType(world, 'macrophage')
    world.selectImmuneCellAt(cell.x, cell.y)

    world.orderSelectedTo(-500, 99999)

    expect(cell.order).toEqual({
      x: macrophage.radius,
      y: bounds.height - macrophage.radius,
    })
  })

  it('survives a nonsense destination rather than losing the cell', () => {
    const world = worldWith(oneMacrophage)
    const cell = firstOfType(world, 'macrophage')
    world.selectImmuneCellAt(cell.x, cell.y)

    world.orderSelectedTo(Number.NaN, Number.NaN)
    run(world, 5)

    expect(Number.isFinite(cell.x)).toBe(true)
    expect(Number.isFinite(cell.y)).toBe(true)
  })
})
