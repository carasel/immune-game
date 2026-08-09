import { describe, expect, it } from 'vitest'
import { macrophage, neutrophil } from '../src/content/cells'
import { cellOutline, insideCell } from '../src/render/shapes'

/**
 * The cell outlines are drawn by the same code on the map and in the HUD, so
 * they are worth checking. Nothing here needs Phaser — it is all arithmetic.
 */

const shapeOf = (def: typeof macrophage) => ({
  radius: def.radius,
  nose: def.nose,
  belly: def.belly,
  spikes: def.spikes,
  spikiness: def.spikiness,
})

const reachFrom = (points: { x: number; y: number }[], x = 0, y = 0) =>
  points.map((point) => Math.hypot(point.x - x, point.y - y))

describe('the macrophage outline', () => {
  it('is smooth, with no spikes', () => {
    const points = cellOutline(0, 0, 0, shapeOf(macrophage))

    expect(points).toHaveLength(22)

    // No point is wildly different from its neighbour.
    const reach = reachFrom(points)
    for (let i = 0; i < reach.length; i++) {
      const next = reach[(i + 1) % reach.length]
      expect(Math.abs(next - reach[i])).toBeLessThan(macrophage.radius * 0.25)
    }
  })

  it('points its narrow end where the cell is going', () => {
    const points = cellOutline(0, 0, 0, shapeOf(macrophage))

    // Facing along +x, so the front is the rightmost point and the back the leftmost.
    const front = Math.max(...points.map((point) => point.x))
    const back = -Math.min(...points.map((point) => point.x))

    expect(front).toBeLessThan(back)
  })

  it('turns with the cell', () => {
    const facingRight = cellOutline(0, 0, 0, shapeOf(macrophage))
    const facingDown = cellOutline(0, 0, Math.PI / 2, shapeOf(macrophage))

    // The same shape, rotated: its longest reach just points elsewhere.
    expect(Math.max(...reachFrom(facingDown))).toBeCloseTo(Math.max(...reachFrom(facingRight)), 6)
    expect(Math.max(...facingDown.map((p) => p.y))).toBeCloseTo(
      Math.max(...facingRight.map((p) => p.x)),
      6,
    )
  })

  it('swells up when the cell has swallowed something', () => {
    const normal = Math.max(...reachFrom(cellOutline(0, 0, 0, shapeOf(macrophage))))
    const full = Math.max(...reachFrom(cellOutline(0, 0, 0, shapeOf(macrophage), 1.14)))

    expect(full).toBeCloseTo(normal * 1.14, 5)
  })
})

describe('the neutrophil outline', () => {
  it('is spiky: two points per spike, and every tip beyond every notch', () => {
    const points = cellOutline(0, 0, 0, shapeOf(neutrophil))

    expect(points).toHaveLength(neutrophil.spikes * 2)

    const reach = reachFrom(points)
    const tips = reach.filter((_, i) => i % 2 === 0)
    const notches = reach.filter((_, i) => i % 2 === 1)

    expect(Math.min(...tips)).toBeGreaterThan(Math.max(...notches))
  })

  it('is smaller than a macrophage', () => {
    expect(neutrophil.radius).toBeLessThan(macrophage.radius)
  })
})

describe('a plain circle', () => {
  it('is what you get with no nose, belly or spikes', () => {
    const points = cellOutline(0, 0, 0, { radius: 10, nose: 0, belly: 0, spikes: 0, spikiness: 0 })

    for (const reach of reachFrom(points)) {
      expect(reach).toBeCloseTo(10, 6)
    }
  })
})

describe('points inside a cell', () => {
  it('sit behind the middle for a positive offset, and forward for a negative one', () => {
    const shape = shapeOf(macrophage)

    const behind = insideCell(100, 100, 0, shape, 0.36)
    const forward = insideCell(100, 100, 0, shape, -0.22)

    expect(behind.x).toBeLessThan(100)
    expect(forward.x).toBeGreaterThan(100)
    expect(behind.y).toBeCloseTo(100, 6)
  })

  it('turn with the cell too', () => {
    const shape = shapeOf(macrophage)
    const facingDown = insideCell(100, 100, Math.PI / 2, shape, 0.36)

    expect(facingDown.x).toBeCloseTo(100, 6)
    expect(facingDown.y).toBeLessThan(100)
  })
})
