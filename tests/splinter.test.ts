import { describe, expect, it } from 'vitest'
import { findImmuneCell } from '../src/content/cells'
import { inflammation } from '../src/content/inflammation'
import { theSplinter, TISSUE_VIEW, type LevelDef } from '../src/content/levels'
import { findPathogen } from '../src/content/pathogens'
import { polygonContains } from '../src/sim/geometry'
import { killImmuneCell } from '../src/sim/immuneCells'
import { blockedBySplinter, distanceToSplinter, type Splinter } from '../src/sim/splinter'
import { World } from '../src/sim/world'
import { firstOfType, gap, placeBacterium, run, stripTissue } from './helpers'

/**
 * Level 3's splinter: solid, dirty, and pushed out by pus. See GAME_DESIGN.md
 * §7 and §8.
 */

/** The splinter level, quiet: no waves and nobody on duty unless you ask. */
function splinterWorld(overrides: Partial<LevelDef> = {}): World {
  return new World({ ...theSplinter, waves: [], startingCells: [], ...overrides }, TISSUE_VIEW)
}

function splinterOf(world: World): Splinter {
  if (!world.splinter) throw new Error('this level has no splinter')
  return world.splinter
}

/** Is anything alive sitting even partly inside the splinter? */
function anythingInside(world: World): boolean {
  const splinter = splinterOf(world)

  for (const cell of world.immuneCells) {
    if (!cell.alive) continue
    // A hair under its real size, so touching the side doesn't count as in it.
    const radius = findImmuneCell(cell.defId)!.radius - 1
    if (blockedBySplinter(splinter, cell.x, cell.y, radius)) return true
  }

  for (const pathogen of world.pathogens) {
    if (pathogen.alive && blockedBySplinter(splinter, pathogen.x, pathogen.y, 0)) return true
  }

  return false
}

describe('the splinter in the tissue', () => {
  it('has no tissue growing inside it', () => {
    const world = splinterWorld()
    const { outline } = splinterOf(world)

    for (const cell of world.bodyCells) {
      expect(polygonContains(outline, cell.x, cell.y)).toBe(false)
    }
  })

  it('sheds its waves just outside its sides, never inside it and never off the skin end', () => {
    const world = splinterWorld({
      waves: [{ at: 0, pathogen: 'blue-bacteria', count: 30, entry: theSplinter.splinter!.id }],
    })
    const splinter = splinterOf(world)

    world.step()

    expect(world.pathogens).toHaveLength(30)
    for (const pathogen of world.pathogens) {
      expect(polygonContains(splinter.outline, pathogen.x, pathogen.y)).toBe(false)
      expect(distanceToSplinter(splinter, pathogen.x, pathogen.y)).toBeLessThan(20)
      // The skin end is the top edge of the screen, outside the tissue.
      expect(pathogen.y).toBeGreaterThan(5)
    }
  })

  it('is solid: a cell sent straight across goes round the tip and gets there', () => {
    const world = splinterWorld({
      startingCells: [{ cell: 'neutrophil', count: 1, at: { x: 0.2, y: 0.2 } }],
    })
    stripTissue(world, 0)

    const cell = firstOfType(world, 'neutrophil')
    const destination = { x: 0.7 * TISSUE_VIEW.width, y: 0.2 * TISSUE_VIEW.height }
    world.selectImmuneCellAt(cell.x, cell.y)
    world.orderSelectedTo(destination.x, destination.y)

    let wentInside = false
    for (let second = 0; second < 40 && cell.order; second += 1 / 60) {
      world.step()
      if (anythingInside(world)) wentInside = true
    }

    expect(wentInside).toBe(false)
    expect(cell.order).toBeNull()
    expect(Math.hypot(cell.x - destination.x, cell.y - destination.y)).toBeLessThan(5)
  })

  it('stops bacteria swimming through it', () => {
    const world = splinterWorld()
    stripTissue(world, 0)

    // Swimming straight at it, from the left, with nothing else to go for.
    placeBacterium(world, 250, 120).angle = 0
    placeBacterium(world, 250, 200).angle = 0.2

    let wentInside = false
    for (let tick = 0; tick < 60 * 8; tick++) {
      world.step()
      if (anythingInside(world)) wentInside = true
    }

    expect(wentInside).toBe(false)
  })

  it("won't let you send a cell into the middle of it", () => {
    const world = splinterWorld({
      startingCells: [{ cell: 'macrophage', count: 1, at: { x: 0.2, y: 0.3 } }],
    })
    const cell = firstOfType(world, 'macrophage')
    const middle = splinterOf(world).tip

    world.selectImmuneCellAt(cell.x, cell.y)
    world.orderSelectedTo(middle.x, middle.y - 60)

    const order = cell.order
    if (order?.kind !== 'move') throw new Error('no move order')
    expect(blockedBySplinter(splinterOf(world), order.x, order.y, 21)).toBe(false)
  })

  it('stops granules: a neutrophil on one side cannot hit a bacterium on the other', () => {
    // Either side of the splinter, low down where it is narrowest, and close
    // enough together that a granule would reach if nothing were in the way.
    const world = splinterWorld({
      startingCells: [{ cell: 'neutrophil', count: 1, at: { x: 296 / 960, y: 250 / 552 } }],
    })
    stripTissue(world, 0)

    const shooter = firstOfType(world, 'neutrophil')
    const target = placeBacterium(world, 482, 250)
    const def = findPathogen(target.defId)!
    const reach = findImmuneCell('neutrophil')!.granules!.range
    expect(Math.hypot(shooter.x - target.x, shooter.y - target.y)).toBeLessThan(reach)

    // Long enough for a granule to fly the gap, nowhere near long enough for
    // the neutrophil to walk round the tip and bite it.
    run(world, 2)

    expect(target.alive).toBe(true)
    expect(target.health).toBe(def.health)
  })
})

describe('pus', () => {
  /**
   * A level with one neutrophil standing just under the tip, and optionally an
   * inflamed circle over it.
   */
  function standingAtTheTip(inflamed: boolean, cell = 'neutrophil') {
    const world = splinterWorld({ startingCells: [{ cell, count: 1 }] })
    const splinter = splinterOf(world)
    const standing = firstOfType(world, cell)

    standing.x = splinter.tip.x
    standing.y = splinter.tip.y + 30

    if (inflamed) {
      world.beginInflammation()
      world.inflameAt(standing.x, standing.y)
    }

    return { world, splinter, standing }
  }

  it('builds up when a neutrophil dies by the splinter somewhere inflamed', () => {
    const { world, splinter, standing } = standingAtTheTip(true)

    world.formNetFrom(standing.id)
    world.step()

    expect(splinter.pus).toBe(inflammation.pusPerNeutrophil)
    expect(world.pusFraction).toBeCloseTo(inflammation.pusPerNeutrophil / inflammation.pusToPushOut)
  })

  it("doesn't build up if the spot wasn't inflamed", () => {
    const { world, splinter, standing } = standingAtTheTip(false)

    world.formNetFrom(standing.id)
    world.step()

    expect(splinter.pus).toBe(0)
  })

  it("doesn't come from macrophages", () => {
    const { world, splinter, standing } = standingAtTheTip(true, 'macrophage')

    killImmuneCell(standing, world.elapsedSeconds)
    world.step()

    expect(splinter.pus).toBe(0)
  })

  it('counts any way of dying, not just a NET, and each death only once', () => {
    const { world, splinter, standing } = standingAtTheTip(true)

    killImmuneCell(standing, world.elapsedSeconds)
    run(world, 2)

    expect(splinter.pus).toBe(inflammation.pusPerNeutrophil)
  })

  it("doesn't count a neutrophil that died too far from the splinter, inflamed or not", () => {
    const { world, splinter, standing } = standingAtTheTip(false)

    standing.y = splinter.tip.y + inflammation.pusReach + 40
    world.beginInflammation()
    world.inflameAt(standing.x, standing.y)

    world.formNetFrom(standing.id)
    world.step()

    expect(splinter.pus).toBe(0)
  })

  it('pushes the splinter out once there is enough, and then it stops being solid', () => {
    const { world, splinter, standing } = standingAtTheTip(true)
    splinter.pus = inflammation.pusToPushOut - inflammation.pusPerNeutrophil

    world.formNetFrom(standing.id)
    world.step()

    expect(splinter.pushedOut).toBe(true)
    expect(splinter.pushedOutAtSeconds).not.toBeNull()
    expect(blockedBySplinter(splinter, splinter.tip.x, splinter.tip.y - 20, 10)).toBe(false)
  })

  it('leaves a hole that later waves still come in through, but fewer of them', () => {
    const world = splinterWorld({
      waves: [{ at: 1, pathogen: 'blue-bacteria', count: 5, entry: theSplinter.splinter!.id }],
    })
    const splinter = splinterOf(world)
    splinter.pushedOut = true

    run(world, 1.1)

    const expected = Math.ceil(5 * inflammation.waveSizeAfterPushedOut)
    expect(world.pathogens).toHaveLength(expected)
    for (const pathogen of world.pathogens) {
      expect(polygonContains(splinter.outline, pathogen.x, pathogen.y)).toBe(true)
    }
  })

  it('is cleaned up by a macrophage with nothing better to do', () => {
    const { world, splinter } = standingAtTheTip(false, 'macrophage')
    splinter.pus = 2

    run(world, inflammation.macrophageSecondsPerPusBite * 2)

    expect(splinter.pus).toBeLessThan(2)
  })

  it('comes last for a macrophage: a bacterium in sight gets eaten first', () => {
    const { world, splinter, standing } = standingAtTheTip(false, 'macrophage')
    splinter.pus = 2

    // On the nearest body cell, made uneatable, so it sits still to be found.
    const meal = world.bodyCells.reduce((near, cell) =>
      gap(cell, standing) < gap(near, standing) ? cell : near,
    )
    meal.health = 1e9
    placeBacterium(world, meal.x, meal.y)

    const meals: string[] = []
    for (let tick = 0; tick < 60 * 10; tick++) {
      world.step()
      const kind = standing.meal?.kind
      if (kind && meals[meals.length - 1] !== kind) meals.push(kind)
    }

    expect(meals[0]).toBe('pathogen')
  })
})
