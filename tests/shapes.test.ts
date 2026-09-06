import { describe, expect, it } from 'vitest'
import { macrophage, neutrophil } from '../src/content/cells'
import {
  blueBacteria,
  pathogenColours,
  pathogens,
  type RodDef,
} from '../src/content/pathogens'
import { cellOutline, insideCell, ROD_TAIL_ROOT, rodTail, rodTailShape } from '../src/render/shapes'

/**
 * The cell outlines and the rod tails are drawn by the same code on the map and
 * in the HUD, so they are worth checking. Nothing here needs Phaser — it is all
 * arithmetic.
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

describe('a rod bacterium tail', () => {
  const shape = rodTailShape(blueBacteria.tailLength)
  const root = blueBacteria.length * ROD_TAIL_ROOT

  it('starts inside the body and trails off the back', () => {
    const points = rodTail(root, shape, 0)

    // The rod faces along +x, so its tail runs off towards -x.
    expect(points[0].x).toBeCloseTo(-root, 6)
    expect(points[0].y).toBeCloseTo(0, 6)
    expect(points[points.length - 1].x).toBeCloseTo(-root - blueBacteria.tailLength, 6)

    // The root is buried: behind the middle of the rod, but still inside it, so
    // the join never pokes out from under the body.
    expect(root).toBeGreaterThan(0)
    expect(root).toBeLessThan(blueBacteria.length / 2)
  })

  it('is pinned at the root and freer the nearer the tip, at any phase', () => {
    for (const phase of [0, 1, 2, 3, 4, 5, 6]) {
      const points = rodTail(root, shape, phase)

      // Every point stays inside an envelope that is shut at the root and opens
      // out to the full wave height at the tip. That is what makes the tail
      // hinge on the body rather than slide about as a whole.
      points.forEach((point, i) => {
        const along = i / (points.length - 1)
        expect(Math.abs(point.y)).toBeLessThanOrEqual(shape.waveHeight * along + 1e-9)
      })
    }
  })

  it('swings the tip right out to the wave height when the crest reaches it', () => {
    // The phase that puts a crest exactly at the tip.
    const points = rodTail(root, shape, shape.waves * Math.PI * 2 - Math.PI / 2)

    expect(Math.abs(points[points.length - 1].y)).toBeCloseTo(shape.waveHeight, 6)
  })

  it('wiggles: winding the phase on moves the tail, but not its root', () => {
    const still = rodTail(root, shape, 0)
    const later = rodTail(root, shape, 0.7)

    // Same skeleton: every point stays exactly as far back as it was.
    for (let i = 0; i < still.length; i++) {
      expect(later[i].x).toBeCloseTo(still[i].x, 6)
    }

    expect(later[0].y).toBeCloseTo(0, 6)
    expect(later[later.length - 1].y).not.toBeCloseTo(still[still.length - 1].y, 3)
  })

  it('comes back to where it started after a whole turn of phase', () => {
    const start = rodTail(root, shape, 0)
    const round = rodTail(root, shape, Math.PI * 2)

    for (let i = 0; i < start.length; i++) {
      expect(round[i].y).toBeCloseTo(start[i].y, 6)
    }
  })

  it('gives a nastier bacterium a longer tail, the way it gives it a longer body', () => {
    // Taken off the pathogen list rather than named one by one, so a new colour
    // is checked the moment it is added.
    const rods = pathogens
      .filter((def): def is RodDef => def.shape === 'rod')
      .sort((a, b) => pathogenColours.indexOf(a.colour) - pathogenColours.indexOf(b.colour))

    expect(rods.map((rod) => rod.colour)).toEqual([...pathogenColours])

    for (let i = 1; i < rods.length; i++) {
      expect(rods[i].tailLength).toBeGreaterThan(rods[i - 1].tailLength)
    }

    // Still a tail and not a second body: shorter than the rod it hangs off.
    for (const rod of rods) {
      expect(rod.tailLength).toBeLessThan(rod.length)
    }
  })
})
