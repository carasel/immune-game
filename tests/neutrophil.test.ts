import { describe, expect, it } from 'vitest'
import { macrophage, neutrophil } from '../src/content/cells'
import { blueBacteria } from '../src/content/pathogens'
import { theCut } from '../src/content/levels'
import { firstOfType, leaveDebris, placeBacterium, run, runUntil, worldWith } from './helpers'

const oneNeutrophil = [{ cell: 'neutrophil', count: 1 }]

describe('what makes a neutrophil different', () => {
  it('is fast enough to catch a bacterium, where a macrophage is not', () => {
    expect(neutrophil.speed).toBeGreaterThan(blueBacteria.speed)
    expect(macrophage.speed).toBeLessThan(blueBacteria.speed)
  })

  it('dies of old age at its lifespan, wherever it happens to be', () => {
    const world = worldWith(oneNeutrophil)
    const cell = firstOfType(world, 'neutrophil')

    const diedAt = runUntil(world, neutrophil.lifespanSeconds! + 10, () => !cell.alive)

    expect(diedAt).toBeCloseTo(neutrophil.lifespanSeconds!, 1)
    // Recorded, so the renderer can show it withering rather than vanishing.
    expect(cell.diedAtSeconds).toBeCloseTo(neutrophil.lifespanSeconds!, 1)
  })

  it('leaves a macrophage still going long after that', () => {
    const world = worldWith([{ cell: 'macrophage', count: 1 }])
    const cell = firstOfType(world, 'macrophage')

    run(world, neutrophil.lifespanSeconds! * 2)

    expect(macrophage.lifespanSeconds).toBeUndefined()
    expect(cell.alive).toBe(true)
  })

  it('eats bacteria, but earns less than a macrophage for it', () => {
    const world = worldWith(oneNeutrophil)
    const cell = firstOfType(world, 'neutrophil')
    const bacterium = placeBacterium(world, cell.x + 40, cell.y)

    runUntil(world, 20, () => cell.meal !== null)

    expect(bacterium.alive).toBe(false)
    expect(cell.meal?.reward).toBe(neutrophil.energyPerPathogen)
    expect(neutrophil.energyPerPathogen).toBeLessThan(macrophage.energyPerPathogen)
  })

  it('walks straight past the mess — clearing up is not its job', () => {
    const world = worldWith(oneNeutrophil)
    leaveDebris(world, 8)

    run(world, neutrophil.lifespanSeconds! - 5)

    expect(neutrophil.engulfDebrisSeconds).toBeUndefined()
    expect(world.debrisCount).toBe(8)
  })

  it('costs less than a macrophage to recruit, and less to keep', () => {
    expect(neutrophil.cost).toBeLessThan(macrophage.cost)
    expect(neutrophil.upkeepPerSecond).toBeLessThan(macrophage.upkeepPerSecond)
  })
})

describe('level 1', () => {
  it('starts with two macrophages and one neutrophil', () => {
    const world = worldWith(theCut.startingCells)

    expect(world.immuneCellCounts.get('macrophage')).toBe(2)
    expect(world.immuneCellCounts.get('neutrophil')).toBe(1)
  })

  it('puts its starting cells in open space, not inside the tissue', () => {
    const world = worldWith(theCut.startingCells)

    for (const cell of world.immuneCells) {
      const inside = world.bodyCells.some(
        (body) => body.alive && Math.hypot(body.x - cell.x, body.y - cell.y) < body.radius,
      )
      expect(inside).toBe(false)
    }
  })
})
