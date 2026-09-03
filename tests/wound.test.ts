import { describe, expect, it } from 'vitest'
import { balance } from '../src/content/balance'
import { theCut, TISSUE_VIEW } from '../src/content/levels'
import { keepOutContains, polygonContains, rectContains } from '../src/sim/geometry'
import { resolveEdgeRegion } from '../src/sim/openings'
import { testWorld } from './helpers'

const cutDef = theCut.entries[0]

/** How far body cells are kept from anything they aren't allowed inside. */
const clearance = balance.bodyCellRadius + balance.openingClearance

function resolveCut() {
  return resolveEdgeRegion(cutDef, TISSUE_VIEW, 'wound')
}

/** How wide the gash is at one of its steps. */
function widthAtStep(walls: [{ x: number; y: number }[], { x: number; y: number }[]], step: number) {
  const [a, b] = walls
  return Math.hypot(a[step].x - b[step].x, a[step].y - b[step].y)
}

describe('the shape of a cut', () => {
  it('is a gash by default, and a plain mouth if a level asks for one', () => {
    expect(resolveCut().walls).not.toBeNull()

    // For a lung surface or a gut wall, which are openings rather than tears.
    const surface = resolveEdgeRegion({ ...cutDef, shape: 'mouth' }, TISSUE_VIEW, 'wound')
    expect(surface.walls).toBeNull()
    expect(surface.keepOut.outline).toHaveLength(4)
  })

  it('leaves vessels as plain mouths', () => {
    const world = testWorld()

    for (const vessel of world.openings) {
      expect(vessel.shape).toBe('mouth')
      expect(vessel.walls).toBeNull()
    }
  })

  it('narrows all the way in, and comes to a blunt tip', () => {
    const walls = resolveCut().walls!
    const steps = walls[0].length - 1

    let previous = Number.POSITIVE_INFINITY
    for (let step = 0; step <= steps; step++) {
      const width = widthAtStep(walls, step)
      expect(width, `step ${step} is not narrower than the one before`).toBeLessThan(previous)
      previous = width
    }

    // Blunt, not a needle — and nothing like the mouth it started as.
    expect(widthAtStep(walls, steps)).toBeGreaterThan(2)
    expect(widthAtStep(walls, steps)).toBeLessThan(widthAtStep(walls, 0) / 5)
  })

  it('never grows wider than the level asked for', () => {
    const cut = resolveCut()

    for (const point of cut.keepOut.outline) {
      expect(rectContains(cut.corridor, point.x, point.y, 0.001)).toBe(true)
    }
  })

  it('tears exactly the same way every time', () => {
    expect(resolveCut().keepOut.outline).toEqual(resolveCut().keepOut.outline)
  })

  it('tears differently from a cut somewhere else', () => {
    const other = resolveEdgeRegion({ ...cutDef, id: 'another-cut' }, TISSUE_VIEW, 'wound')

    expect(other.keepOut.outline).not.toEqual(resolveCut().keepOut.outline)
  })
})

describe('tissue round a cut', () => {
  it('is held back by the gash itself, not by a box around it', () => {
    const cut = resolveCut()

    // A spot down beside the tip, where the gash has narrowed to nothing but
    // the old rectangle still reached. This is the whole point of the shape:
    // tissue packs into the shoulders instead of a rectangle standing empty.
    const shoulder = {
      x: cut.corridor.x + 4,
      y: cut.corridor.y + cut.corridor.height - 10,
    }

    expect(rectContains(cut.corridor, shoulder.x, shoulder.y, clearance)).toBe(true)
    expect(keepOutContains(cut.keepOut, shoulder.x, shoulder.y, clearance)).toBe(false)
  })

  it('never grows inside the gash', () => {
    const world = testWorld()
    const cut = world.entries[0]

    for (const cell of world.bodyCells) {
      expect(
        keepOutContains(cut.keepOut, cell.x, cell.y, clearance),
        `body cell ${cell.id} is in the cut`,
      ).toBe(false)
    }
  })
})

describe('bacteria coming in through a cut', () => {
  it('start in the gap the gash really has, not the width of its mouth', () => {
    const cut = resolveCut()

    // Deep enough in that the walls have closed right up.
    expect(cut.innerHalfWidth).toBeLessThan(cut.width / 4)
  })

  it('arrive inside the gash rather than in the flesh either side of it', () => {
    const world = testWorld({ waves: [{ at: 1, pathogen: 'blue-bacteria', count: 12 }] })
    const cut = world.entries[0]

    // Straight after the wave lands, before any of them has wandered off.
    for (let tick = 0; tick < 70; tick++) world.step()
    expect(world.pathogens.length).toBe(12)

    for (const bacterium of world.pathogens) {
      const across =
        (bacterium.x - cut.innerPoint.x) * cut.tangent.x +
        (bacterium.y - cut.innerPoint.y) * cut.tangent.y

      expect(Math.abs(across), `bacterium ${bacterium.id} landed outside the cut`).toBeLessThanOrEqual(
        cut.innerHalfWidth,
      )
    }
  })
})

describe('a keep-out shape', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ]

  it('holds the points inside it', () => {
    expect(polygonContains(square, 5, 5)).toBe(true)
    expect(polygonContains(square, 0.5, 9.5)).toBe(true)
  })

  it('lets go of the points outside it', () => {
    expect(polygonContains(square, -1, 5)).toBe(false)
    expect(polygonContains(square, 5, 40)).toBe(false)
  })

  it('reaches out by the padding, and no further', () => {
    expect(polygonContains(square, -3, 5, 4)).toBe(true)
    expect(polygonContains(square, -5, 5, 4)).toBe(false)

    // Round a corner too, where the nearest edge is at an angle.
    expect(polygonContains(square, -2, -2, 4)).toBe(true)
    expect(polygonContains(square, -4, -4, 4)).toBe(false)
  })

  it('ignores the corners a triangle does not have', () => {
    const triangle = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 0, y: 20 },
    ]

    expect(polygonContains(triangle, 2, 2)).toBe(true)
    // Well inside the box round it, but the other side of the sloping edge.
    expect(polygonContains(triangle, 18, 18)).toBe(false)
  })
})
