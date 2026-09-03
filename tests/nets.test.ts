import { describe, expect, it } from 'vitest'
import { macrophage, neutrophil } from '../src/content/cells'
import { blueBacteria } from '../src/content/pathogens'
import { firstOfType, gap, placeBacterium, run, runUntil, worldWith } from './helpers'

/**
 * One neutrophil, always in the same spot: half way down the open channel on
 * the left, with room to its right for the bacteria these tests place around
 * it. Scattered, it could start hard against a wall, with the spots these
 * tests reach for off the side of the map — and it would move again with any
 * change to the tissue.
 */
const oneNeutrophil = [{ cell: 'neutrophil', count: 1, at: { x: 0.1, y: 0.5 } }]
const net = neutrophil.net!

/** A world with a single body cell left standing, well away from everything. */
function clearTissueExceptOne(world: ReturnType<typeof worldWith>) {
  const kept = world.bodyCells[0]
  for (const cell of world.bodyCells.slice(1)) {
    cell.alive = false
    cell.health = 0
    cell.debris = false
  }
  return kept
}

describe('making a NET', () => {
  it('kills the neutrophil that makes it — that is how one is made', () => {
    const world = worldWith(oneNeutrophil)
    const cell = firstOfType(world, 'neutrophil')

    expect(world.formNetFrom(cell.id)).toBe(true)

    expect(cell.alive).toBe(false)
    expect(cell.diedAtSeconds).not.toBeNull()
    expect(world.nets).toHaveLength(1)
    expect(world.livingImmuneCellCount).toBe(0)
  })

  it('leaves the web where the cell was standing', () => {
    const world = worldWith(oneNeutrophil)
    const cell = firstOfType(world, 'neutrophil')
    const where = { x: cell.x, y: cell.y }

    world.formNetFrom(cell.id)

    expect(gap(world.nets[0], where)).toBeLessThan(0.001)
    expect(world.nets[0].radius).toBe(net.radius)
  })

  it('deselects the cell, since it no longer exists', () => {
    const world = worldWith(oneNeutrophil)
    const cell = firstOfType(world, 'neutrophil')
    world.selectImmuneCellAt(cell.x, cell.y)

    world.formNetFrom(cell.id)

    expect(world.selectedImmuneCell).toBeNull()
  })

  it('is not something a macrophage can do', () => {
    const world = worldWith([{ cell: 'macrophage', count: 1 }])
    const cell = firstOfType(world, 'macrophage')

    expect(macrophage.net).toBeUndefined()
    expect(world.formNetFrom(cell.id)).toBe(false)
    expect(cell.alive).toBe(true)
    expect(world.nets).toHaveLength(0)
  })

  it('cannot be done twice, or to a cell that is already dead', () => {
    const world = worldWith(oneNeutrophil)
    const cell = firstOfType(world, 'neutrophil')

    expect(world.formNetFrom(cell.id)).toBe(true)
    expect(world.formNetFrom(cell.id)).toBe(false)
    expect(world.formNetFrom(9999)).toBe(false)
    expect(world.nets).toHaveLength(1)
  })
})

describe('what a NET does to bacteria', () => {
  it('holds them still — they cannot swim off', () => {
    const world = worldWith(oneNeutrophil)
    const cell = firstOfType(world, 'neutrophil')
    const bacterium = placeBacterium(world, cell.x + 20, cell.y)
    // Let it try to wander: it still shouldn't move.
    bacterium.wanderIn = 0

    world.formNetFrom(cell.id)
    const caught = { x: bacterium.x, y: bacterium.y }

    run(world, 1)

    expect(gap(bacterium, caught)).toBe(0)
  })

  it('stops them eating the body cell they were on', () => {
    const world = worldWith(oneNeutrophil)
    const cell = firstOfType(world, 'neutrophil')
    const victim = clearTissueExceptOne(world)

    // Move the neutrophil next to that body cell, with a bacterium on it.
    cell.x = victim.x
    cell.y = victim.y
    const bacterium = placeBacterium(world, victim.x - victim.radius - 10, victim.y)

    world.formNetFrom(cell.id)
    const healthWhenCaught = victim.health

    run(world, 1)

    // The body cell takes nothing more, while the bacterium stuck to the web
    // above it is being poisoned the whole time.
    expect(victim.health).toBe(healthWhenCaught)
    expect(bacterium.health).toBeLessThan(blueBacteria.health)
  })

  it('poisons them until they die', () => {
    const world = worldWith(oneNeutrophil)
    const cell = firstOfType(world, 'neutrophil')
    const bacterium = placeBacterium(world, cell.x + 30, cell.y)

    world.formNetFrom(cell.id)

    const died = runUntil(world, net.durationSeconds, () => !bacterium.alive)

    expect(died).not.toBeNull()
    // Three health at 1.5 a second: about two seconds.
    expect(died!).toBeLessThan(blueBacteria.health / net.damagePerSecondToPathogens + 0.5)
  })

  it('leaves bacteria outside it alone', () => {
    const world = worldWith(oneNeutrophil)
    const cell = firstOfType(world, 'neutrophil')
    const outside = placeBacterium(world, cell.x + net.radius + 40, cell.y)

    world.formNetFrom(cell.id)
    run(world, net.durationSeconds)

    expect(outside.alive).toBe(true)
    expect(outside.health).toBe(blueBacteria.health)
  })
})

describe('what a NET does to your own tissue', () => {
  it('takes most of a healthy body cell but leaves it standing', () => {
    const world = worldWith(oneNeutrophil)
    const cell = firstOfType(world, 'neutrophil')
    const victim = clearTissueExceptOne(world)

    cell.x = victim.x
    cell.y = victim.y
    expect(victim.health).toBe(1)

    world.formNetFrom(cell.id)

    expect(victim.alive).toBe(true)
    expect(victim.health).toBeCloseTo(1 - net.damageToBodyCells, 5)
  })

  it('finishes off a body cell that was already hurt', () => {
    const world = worldWith(oneNeutrophil)
    const cell = firstOfType(world, 'neutrophil')
    const victim = clearTissueExceptOne(world)

    cell.x = victim.x
    cell.y = victim.y
    victim.health = 0.5

    const chargedBefore = world.economy.totalLostToDeaths
    world.formNetFrom(cell.id)

    expect(victim.alive).toBe(false)
    expect(victim.debris).toBe(true)
    expect(world.economy.totalLostToDeaths).toBeGreaterThan(chargedBefore)
  })

  it('hits the tissue once as it lands, not every second it sits there', () => {
    const world = worldWith(oneNeutrophil)
    const cell = firstOfType(world, 'neutrophil')
    const victim = clearTissueExceptOne(world)

    cell.x = victim.x
    cell.y = victim.y

    world.formNetFrom(cell.id)
    const afterLanding = victim.health

    run(world, net.durationSeconds)

    expect(victim.health).toBe(afterLanding)
    expect(victim.alive).toBe(true)
  })

  it('spares tissue outside its reach', () => {
    const world = worldWith(oneNeutrophil)
    const cell = firstOfType(world, 'neutrophil')

    const faraway = world.bodyCells.filter(
      (body) => Math.hypot(body.x - cell.x, body.y - cell.y) > net.radius,
    )

    world.formNetFrom(cell.id)

    for (const body of faraway) expect(body.health).toBe(1)
  })
})

describe('a NET breaking down', () => {
  it('lasts as long as it should, then goes', () => {
    const world = worldWith(oneNeutrophil)
    const cell = firstOfType(world, 'neutrophil')

    world.formNetFrom(cell.id)
    expect(world.nets).toHaveLength(1)

    run(world, net.durationSeconds - 0.5)
    expect(world.nets).toHaveLength(1)

    run(world, 1)
    expect(world.nets).toHaveLength(0)
  })

  it('lets the bacteria it was holding go when it does', () => {
    const world = worldWith(oneNeutrophil)
    const cell = firstOfType(world, 'neutrophil')
    const bacterium = placeBacterium(world, cell.x + 30, cell.y)
    // Tough enough to outlast the web.
    bacterium.health = Number.MAX_SAFE_INTEGER

    world.formNetFrom(cell.id)
    run(world, net.durationSeconds + 0.5)

    const freed = { x: bacterium.x, y: bacterium.y }
    run(world, 2)

    expect(world.nets).toHaveLength(0)
    expect(gap(bacterium, freed)).toBeGreaterThan(0)
  })
})
