import { describe, expect, it } from 'vitest'
import { macrophage, neutrophil } from '../src/content/cells'
import { rectContains } from '../src/sim/geometry'
import { run, testWorld, worldWith } from './helpers'

describe('recruiting', () => {
  it('charges nothing until you have picked a vessel', () => {
    const world = worldWith([])
    const before = world.economy.energy

    expect(world.beginRecruit('macrophage')).toBe(true)
    expect(world.recruitingDefId).toBe('macrophage')
    expect(world.economy.energy).toBe(before)
  })

  it('charges when the vessel is picked, and delivers the cell there', () => {
    const world = worldWith([])
    const before = world.economy.energy
    const vessel = world.openings[0]

    world.beginRecruit('macrophage')
    const cell = world.recruitAt(vessel.id)

    expect(cell).not.toBeNull()
    expect(cell!.defId).toBe('macrophage')
    expect(world.economy.energy).toBe(before - macrophage.cost)
    expect(world.recruitingDefId).toBeNull()

    // It arrives inside the vessel, facing into the tissue.
    expect(rectContains(vessel.corridor, cell!.x, cell!.y)).toBe(true)
    expect(Math.cos(cell!.angle)).toBeCloseTo(vessel.inward.x, 5)
    expect(Math.sin(cell!.angle)).toBeCloseTo(vessel.inward.y, 5)
  })

  it('works at every vessel the level has, including the narrow one', () => {
    const world = worldWith([])
    world.economy.energy = 1000

    for (const vessel of world.openings) {
      world.beginRecruit('macrophage')
      const cell = world.recruitAt(vessel.id)

      expect(cell).not.toBeNull()
      expect(rectContains(vessel.corridor, cell!.x, cell!.y)).toBe(true)
    }

    expect(world.livingImmuneCellCount).toBe(world.openings.length)
  })

  it('spreads several recruits across the mouth instead of stacking them', () => {
    const world = worldWith([])
    world.economy.energy = 1000
    const vessel = world.openings[0]

    const places: number[] = []
    for (let i = 0; i < 3; i++) {
      world.beginRecruit('macrophage')
      const cell = world.recruitAt(vessel.id)!
      places.push(vessel.edge === 'left' || vessel.edge === 'right' ? cell.y : cell.x)
    }

    expect(new Set(places).size).toBe(3)
  })

  it('refuses what you cannot afford, and never half-charges', () => {
    const world = worldWith([])
    world.economy.energy = macrophage.cost - 1

    expect(world.beginRecruit('macrophage')).toBe(false)
    expect(world.recruitingDefId).toBeNull()
    expect(world.economy.energy).toBe(macrophage.cost - 1)
  })

  it('drops the recruit if the energy goes while you are choosing a vessel', () => {
    const world = worldWith([])
    world.economy.energy = macrophage.cost
    world.beginRecruit('macrophage')

    world.economy.energy = 3
    const cell = world.recruitAt(world.openings[0].id)

    expect(cell).toBeNull()
    expect(world.economy.energy).toBe(3)
    expect(world.recruitingDefId).toBeNull()
  })

  it('can be called off for free', () => {
    const world = worldWith([])
    const before = world.economy.energy

    world.beginRecruit('macrophage')
    world.cancelRecruit()

    expect(world.recruitingDefId).toBeNull()
    expect(world.economy.energy).toBe(before)
  })

  it('shrugs off a vessel click with nothing pending, and unknown ids', () => {
    const world = worldWith([])
    const before = world.economy.energy

    expect(world.recruitAt(world.openings[0].id)).toBeNull()
    expect(world.beginRecruit('killer-t-cell')).toBe(false)

    world.beginRecruit('macrophage')
    expect(world.recruitAt('no-such-vessel')).toBeNull()

    expect(world.economy.energy).toBe(before)
  })

  it('recruits a neutrophil for its own price', () => {
    const world = worldWith([])
    const before = world.economy.energy

    world.beginRecruit('neutrophil')
    const cell = world.recruitAt(world.openings[0].id)

    expect(cell!.defId).toBe('neutrophil')
    expect(world.economy.energy).toBe(before - neutrophil.cost)
  })

  it('hands you a cell that behaves like any other', () => {
    const world = worldWith([])
    world.beginRecruit('macrophage')
    const cell = world.recruitAt(world.openings[0].id)!

    const from = { x: cell.x, y: cell.y }
    run(world, 20)
    expect(Math.hypot(cell.x - from.x, cell.y - from.y)).toBeGreaterThan(0)

    expect(world.selectImmuneCellAt(cell.x, cell.y)).toBe(cell)
    expect(world.orderSelectedTo(480, 260)).toBe(true)
  })

  it('finds the vessel under a point, and nothing under open tissue', () => {
    const world = testWorld()
    const vessel = world.openings[0]

    const inside = world.openingAt(
      vessel.corridor.x + vessel.corridor.width / 2,
      vessel.corridor.y + vessel.corridor.height / 2,
    )

    expect(inside?.id).toBe(vessel.id)
    expect(world.openingAt(480, 300)).toBeNull()
  })
})
