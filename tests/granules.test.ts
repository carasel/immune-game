import { describe, expect, it } from 'vitest'
import { macrophage, neutrophil } from '../src/content/cells'
import { blueBacteria } from '../src/content/pathogens'
import { firstOfType, gap, placeBacterium, run, runUntil, worldWith } from './helpers'

/**
 * One neutrophil, always in the same spot: half way down the open channel on
 * the left, with the width of the tissue to throw across.
 *
 * The `at` is doing real work here. Scattered, the cell can start near the
 * right-hand wall, and then a granule thrown to the right leaves the world on
 * the tick it is thrown and is cleared away before the cadence test can count
 * it — and a cell chasing its target rightwards ends up pinned in the corner
 * with the target clamped on top of it, eating instead of throwing.
 */
const oneNeutrophil = [{ cell: 'neutrophil', count: 1, at: { x: 0.1, y: 0.5 } }]
const granules = neutrophil.granules!

describe('throwing granules', () => {
  it('throws one as soon as a bacterium is in range', () => {
    const world = worldWith(oneNeutrophil)
    const cell = firstOfType(world, 'neutrophil')
    placeBacterium(world, cell.x + granules.range * 0.7, cell.y)

    world.step()

    expect(world.granules).toHaveLength(1)
    expect(world.granules[0].alive).toBe(true)
  })

  it('throws nothing when there is nothing to throw it at', () => {
    const world = worldWith(oneNeutrophil)

    run(world, 30)

    expect(world.granules).toHaveLength(0)
  })

  it('waits out of range, and fires the moment one comes into it', () => {
    const world = worldWith(oneNeutrophil)
    const cell = firstOfType(world, 'neutrophil')

    // Tissue out of the way, for the same reason as the cadence test below: this
    // is about range and reloading, and a cell that wanders into the tissue
    // while it waits throws granules that hit a body cell and are cleared away
    // on the tick they are thrown.
    for (const body of world.bodyCells) {
      body.alive = false
      body.health = 0
      body.debris = false
    }

    // Twice its reach, and only briefly, so it can't wander over and eat it.
    const bacterium = placeBacterium(world, cell.x + granules.range * 2, cell.y)
    run(world, 2)
    expect(world.granules).toHaveLength(0)

    // Now within it: no waiting around, it has been loaded the whole time.
    bacterium.x = cell.x + granules.range * 0.5
    bacterium.y = cell.y
    world.step()

    expect(world.granules).toHaveLength(1)
  })

  it('throws one every few seconds, not every tick', () => {
    const world = worldWith(oneNeutrophil)
    const cell = firstOfType(world, 'neutrophil')

    // Clear the tissue out of the way. Standing in it, most granules hit a body
    // cell on the tick they are thrown and are gone before they can be counted,
    // which is a real thing that happens but not what this test is about.
    for (const body of world.bodyCells) {
      body.alive = false
      body.health = 0
      body.debris = false
    }

    const target = placeBacterium(world, cell.x + granules.range * 0.8, cell.y)

    let thrown = 0
    let seen = 0

    for (let i = 0; i < 60 * 21; i++) {
      // Keep a target in range whatever the cell does to it — swallowed, shot,
      // chased down. This test is about the cadence, not about the target.
      target.alive = true
      target.health = Number.MAX_SAFE_INTEGER
      target.x = cell.x + granules.range * 0.8
      target.y = cell.y

      world.step()

      // Count them as they appear, since spent ones are cleared away.
      const ids = world.granules.map((granule) => granule.id)
      const highest = ids.length > 0 ? Math.max(...ids) : seen
      if (highest > seen) {
        thrown += highest - seen
        seen = highest
      }
    }

    // 21 seconds: one straight away, then one every 5.
    expect(thrown).toBe(5)
  })

  it('aims at the nearest bacterium', () => {
    const world = worldWith(oneNeutrophil)
    const cell = firstOfType(world, 'neutrophil')

    placeBacterium(world, cell.x, cell.y - granules.range * 0.8) // far, above
    placeBacterium(world, cell.x + granules.range * 0.3, cell.y) // near, to the right

    world.step()

    const granule = world.granules[0]
    expect(Math.abs(granule.angle)).toBeLessThan(0.2) // pointing right
  })

  it('comes out of the edge of the cell, not its middle', () => {
    const world = worldWith(oneNeutrophil)
    const cell = firstOfType(world, 'neutrophil')
    placeBacterium(world, cell.x + granules.range * 0.6, cell.y)

    world.step()

    expect(gap(world.granules[0], cell)).toBeGreaterThan(neutrophil.radius * 0.5)
  })

  it('is thrown even while the cell is busy digesting', () => {
    const world = worldWith(oneNeutrophil)
    const cell = firstOfType(world, 'neutrophil')

    cell.meal = { kind: 'debris', secondsLeft: 5, totalSeconds: 5, reward: 0 }
    placeBacterium(world, cell.x + granules.range * 0.6, cell.y)

    world.step()

    expect(cell.meal).not.toBeNull()
    expect(world.granules).toHaveLength(1)
  })

  it('is not something a macrophage can do', () => {
    const world = worldWith([{ cell: 'macrophage', count: 1 }])
    const cell = firstOfType(world, 'macrophage')
    placeBacterium(world, cell.x + 60, cell.y)

    run(world, 20)

    expect(macrophage.granules).toBeUndefined()
    expect(world.granules).toHaveLength(0)
  })
})

describe('what a granule does when it lands', () => {
  it('kills a blue bacterium outright', () => {
    const world = worldWith(oneNeutrophil)
    const cell = firstOfType(world, 'neutrophil')
    const bacterium = placeBacterium(world, cell.x + granules.range * 0.8, cell.y)

    const killed = runUntil(world, 20, () => !bacterium.alive)

    expect(killed).not.toBeNull()
    expect(granules.damageToPathogens).toBe(blueBacteria.health)
  })

  it('earns nothing — poisoning something is not eating it', () => {
    const world = worldWith(oneNeutrophil)
    const cell = firstOfType(world, 'neutrophil')

    // No living tissue, so there is no income to confuse the sum: anything
    // earned from here could only have come from eating.
    for (const body of world.bodyCells) {
      body.alive = false
      body.health = 0
      body.debris = false
    }

    const bacterium = placeBacterium(world, cell.x + granules.range * 0.9, cell.y)
    const before = world.economy.totalEarned

    runUntil(world, 20, () => !bacterium.alive)

    expect(cell.meal).toBeNull()
    expect(world.economy.totalEarned).toBe(before)
  })

  it('hurts one of your own body cells, and six of them kill it', () => {
    const world = worldWith([])
    const victim = world.bodyCells[0]

    expect(victim.health).toBe(1)

    for (let i = 0; i < 5; i++) {
      throwAt(world, victim)
      run(world, 3)
    }

    expect(victim.alive).toBe(true)
    expect(victim.health).toBeCloseTo(1 - 5 * granules.damageToBodyCells, 5)

    throwAt(world, victim)
    run(world, 3)

    expect(victim.alive).toBe(false)
  })

  it('charges the energy and leaves a husk when it finishes a body cell off', () => {
    const world = worldWith([])
    const victim = world.bodyCells[0]
    victim.health = granules.damageToBodyCells / 2

    const before = world.economy.totalLostToDeaths
    throwAt(world, victim)
    run(world, 3)

    expect(victim.alive).toBe(false)
    expect(victim.debris).toBe(true)
    expect(world.economy.totalLostToDeaths).toBeGreaterThan(before)
  })

  it('hits the bacterium eating a body cell, not the cell behind it', () => {
    const world = onlyOneBodyCell()
    const victim = world.bodyCells.find((cell) => cell.alive)!

    // Where a bacterium actually sits when it is eating: touching, on the near
    // side. The granule comes in from that side and reaches it first.
    const bacterium = placeBacterium(world, victim.x - victim.radius - 10, victim.y)

    throwAt(world, bacterium)
    run(world, 3)

    expect(bacterium.alive).toBe(false)
    // It nibbled the cell while the granule was in the air, but it took nothing
    // like a granule's worth of damage.
    expect(victim.health).toBeGreaterThan(1 - granules.damageToBodyCells)
  })

  it('hits your own tissue when the tissue is in the way', () => {
    const world = onlyOneBodyCell()
    const victim = world.bodyCells.find((cell) => cell.alive)!

    // This time the bacterium is on the far side, so the shot has to go through
    // a body cell to reach it. It doesn't: your own cell takes the poison.
    const bacterium = placeBacterium(world, victim.x + victim.radius + 10, victim.y)

    throwAt(world, victim)
    run(world, 3)

    expect(bacterium.alive).toBe(true)
    expect(victim.health).toBeLessThan(1)
  })

  it('runs out of poison rather than flying on for ever', () => {
    const world = worldWith([])

    // Fired across open space with nothing in the way at all.
    for (const cell of world.bodyCells) {
      cell.alive = false
      cell.health = 0
      cell.debris = false
    }

    world.granules.push({
      id: 1,
      x: 20,
      y: 300,
      angle: 0,
      speed: granules.speed,
      rangeLeft: granules.range,
      damageToPathogens: granules.damageToPathogens,
      damageToBodyCells: granules.damageToBodyCells,
      alive: true,
    })

    run(world, granules.range / granules.speed + 0.5)

    expect(world.granules.filter((granule) => granule.alive)).toHaveLength(0)
  })

  it('is cleared away once spent, rather than piling up all level', () => {
    const world = worldWith(oneNeutrophil)
    const cell = firstOfType(world, 'neutrophil')
    const target = placeBacterium(world, cell.x + granules.range * 0.8, cell.y)
    target.health = Number.MAX_SAFE_INTEGER

    run(world, 60)

    // A dozen thrown over a minute, but only what is in the air is kept.
    expect(world.granules.length).toBeLessThan(4)
  })
})

/** A world with a single body cell left standing, so nothing else is in the way. */
function onlyOneBodyCell(): ReturnType<typeof worldWith> {
  const world = worldWith([])

  for (const cell of world.bodyCells.slice(1)) {
    cell.alive = false
    cell.health = 0
    cell.debris = false
  }

  return world
}

/** Puts a granule right next to something, aimed at it. */
function throwAt(world: ReturnType<typeof worldWith>, target: { x: number; y: number }): void {
  world.granules.push({
    id: 9000 + world.granules.length,
    x: target.x - 40,
    y: target.y,
    angle: 0,
    speed: granules.speed,
    rangeLeft: granules.range,
    damageToPathogens: granules.damageToPathogens,
    damageToBodyCells: granules.damageToBodyCells,
    alive: true,
  })
}
