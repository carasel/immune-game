import { describe, expect, it } from 'vitest'
import { macrophage } from '../src/content/cells'
import { bounds, firstOfType, gap, placeBacterium, run, runUntil, worldWith } from './helpers'

/**
 * One macrophage, always in the same spot: half way down the open channel on
 * the left, with the width of the tissue ahead of it.
 *
 * The `at` is what makes these tests repeatable. A scattered cell lands
 * wherever the tissue has room, so `cell.x + 420` can be off the side of the
 * map or hard against a wall, and any change to the tissue moves it.
 */
const oneMacrophage = [{ cell: 'macrophage', count: 1, at: { x: 0.1, y: 0.5 } }]

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

  it('walks past a bacterium that is nowhere near where it was sent', () => {
    const world = worldWith(oneMacrophage)
    const cell = firstOfType(world, 'macrophage')
    world.selectImmuneCellAt(cell.x, cell.y)

    const target = { x: Math.min(cell.x + 420, bounds.width - 30), y: cell.y }
    world.orderSelectedTo(target.x, target.y)

    // Right on the route and impossible to miss, but a long way from the
    // destination, so the order still wins.
    const bacterium = placeBacterium(world, cell.x + 60, cell.y)
    expect(gap(bacterium, target)).toBeGreaterThan(macrophage.visionRange)

    let ateOnTheWay = false
    const arrived = runUntil(world, 240, () => {
      if (cell.meal) ateOnTheWay = true
      return cell.order === null
    })

    expect(arrived).not.toBeNull()
    expect(ateOnTheWay).toBe(false)
    expect(bacterium.alive).toBe(true)
  })

  it('breaks off for a bacterium once it is nearly where it was sent', () => {
    const world = worldWith(oneMacrophage)
    const cell = firstOfType(world, 'macrophage')
    world.selectImmuneCellAt(cell.x, cell.y)

    const target = { x: Math.min(cell.x + 420, bounds.width - 30), y: cell.y }
    world.orderSelectedTo(target.x, target.y)

    // Sitting just short of the destination: it is what the player was sending
    // the cell to deal with, so arriving on the exact spot first is silly.
    const bacterium = placeBacterium(world, target.x - 70, cell.y)
    expect(gap(bacterium, target)).toBeLessThan(macrophage.visionRange)

    const ate = runUntil(world, 240, () => cell.meal !== null)

    expect(ate).not.toBeNull()
    expect(bacterium.alive).toBe(false)
    // It gave up on the order to do it, rather than arriving first.
    expect(cell.order).toBeNull()
    expect(gap(cell, target)).toBeGreaterThan(3)
  })

  it('still finishes an order when there is nothing to fight at the far end', () => {
    const world = worldWith(oneMacrophage)
    const cell = firstOfType(world, 'macrophage')
    world.selectImmuneCellAt(cell.x, cell.y)

    const target = { x: 480, y: 300 }
    world.orderSelectedTo(target.x, target.y)

    const arrived = runUntil(world, 240, () => cell.order === null)

    expect(arrived).not.toBeNull()
    expect(gap(cell, target)).toBeLessThan(3)
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
      kind: 'move',
      x: macrophage.radius,
      y: bounds.height - macrophage.radius,
    })
  })

  it('refuses a nonsense destination rather than losing the cell to it', () => {
    const world = worldWith(oneMacrophage)
    const cell = firstOfType(world, 'macrophage')
    world.selectImmuneCellAt(cell.x, cell.y)

    expect(world.orderSelectedTo(Number.NaN, Number.NaN)).toBe(false)
    expect(cell.order).toBeNull()

    run(world, 5)

    expect(Number.isFinite(cell.x)).toBe(true)
    expect(Number.isFinite(cell.y)).toBe(true)
  })
})

describe('sending a cell after one particular bacterium', () => {
  it('needs a cell selected, and a bacterium that is actually alive', () => {
    const world = worldWith(oneMacrophage)
    const bacterium = placeBacterium(world, 480, 300)

    // Nothing selected yet.
    expect(world.orderSelectedToChase(bacterium.id)).toBe(false)

    const cell = firstOfType(world, 'macrophage')
    world.selectImmuneCellAt(cell.x, cell.y)

    expect(world.orderSelectedToChase(9999)).toBe(false)
    expect(world.orderSelectedToChase(bacterium.id)).toBe(true)
    expect(cell.order).toEqual({ kind: 'chase', pathogenId: bacterium.id })

    bacterium.alive = false
    expect(world.orderSelectedToChase(bacterium.id)).toBe(false)
  })

  it('walks past a much closer bacterium to get the one it was sent after', () => {
    const world = worldWith(oneMacrophage)
    const cell = firstOfType(world, 'macrophage')

    // The easy one is right next to it; the ordered one is far across the map.
    const easy = placeBacterium(world, cell.x + 45, cell.y)
    const wanted = placeBacterium(world, Math.min(cell.x + 400, bounds.width - 30), cell.y)

    world.selectImmuneCellAt(cell.x, cell.y)
    world.orderSelectedToChase(wanted.id)

    const caught = runUntil(world, 240, () => !wanted.alive)

    expect(caught).not.toBeNull()
    expect(easy.alive).toBe(true)
  })

  it('eats it, and the order is done', () => {
    const world = worldWith(oneMacrophage)
    const cell = firstOfType(world, 'macrophage')
    const wanted = placeBacterium(world, cell.x + 120, cell.y)

    world.selectImmuneCellAt(cell.x, cell.y)
    world.orderSelectedToChase(wanted.id)

    runUntil(world, 240, () => !wanted.alive)

    expect(cell.order).toBeNull()
    expect(cell.meal?.kind).toBe('pathogen')
  })

  it('gives up and goes back to normal if something else kills its target', () => {
    const world = worldWith(oneMacrophage)
    const cell = firstOfType(world, 'macrophage')
    const wanted = placeBacterium(world, Math.min(cell.x + 400, bounds.width - 30), cell.y)

    world.selectImmuneCellAt(cell.x, cell.y)
    world.orderSelectedToChase(wanted.id)
    run(world, 3)

    // Someone else gets there first.
    wanted.alive = false
    world.step()

    expect(cell.order).toBeNull()

    // And it is hunting on its own again: a new bacterium beside it gets eaten.
    const nearby = placeBacterium(world, cell.x + 40, cell.y)
    const ate = runUntil(world, 60, () => !nearby.alive)
    expect(ate).not.toBeNull()
  })

  it('chases a bacterium that is running away', () => {
    const world = worldWith([{ cell: 'neutrophil', count: 1 }])
    const cell = firstOfType(world, 'neutrophil')
    const runner = placeBacterium(world, cell.x + 150, cell.y)

    world.selectImmuneCellAt(cell.x, cell.y)
    world.orderSelectedToChase(runner.id)

    // It keeps moving, and the neutrophil is faster, so it should still catch it.
    const caught = runUntil(world, 240, () => {
      runner.x = Math.min(runner.x + 0.15, bounds.width - 20)
      return !runner.alive
    })

    expect(caught).not.toBeNull()
  })
})

describe('clicking about the place', () => {
  it('finds a bacterium under the click, with a bit of slack for small ones', () => {
    const world = worldWith([])
    const bacterium = placeBacterium(world, 480, 300)

    expect(world.pathogenAt(480, 300)).toBe(bacterium)
    expect(world.pathogenAt(492, 300)).toBe(bacterium) // near miss still counts
    expect(world.pathogenAt(560, 300)).toBeNull()
  })

  it('ignores bacteria that are already dead', () => {
    const world = worldWith([])
    const bacterium = placeBacterium(world, 480, 300)
    bacterium.alive = false

    expect(world.pathogenAt(480, 300)).toBeNull()
  })

  it('picks the nearest when two are close together', () => {
    const world = worldWith([])
    placeBacterium(world, 480, 300)
    const nearer = placeBacterium(world, 500, 300)

    expect(world.pathogenAt(498, 300)).toBe(nearer)
  })
})

