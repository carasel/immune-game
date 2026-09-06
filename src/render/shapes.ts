import type { Vec2 } from '../sim/geometry'

/** How a cell is shaped: its size, its two ends, and any spikes. */
export interface CellShape {
  radius: number
  nose: number
  belly: number
  spikes: number
  spikiness: number
}

/**
 * The outline of an immune cell: a circle with its bulk pushed to the back and
 * its front pinched in, built around the direction it is facing so the narrow
 * end always leads. Spikes go round the outside of that.
 *
 * `nose` pinches the front in, `belly` fattens the back out, and `spikiness`
 * is how far the spikes stick out — all fractions of the radius. All three at 0
 * draws a plain circle. `swell` puffs the whole thing up while the cell has
 * something inside it.
 *
 * Lives here rather than in LevelScene so the little pictures in the HUD are
 * drawn by the same code as the cells themselves, and can't drift apart.
 */
export function cellOutline(
  x: number,
  y: number,
  angle: number,
  shape: CellShape,
  swell = 1,
): Vec2[] {
  // Two points per spike, landing exactly on each tip and each notch, which is
  // what makes them read as points rather than as a wobble.
  const segments = shape.spikes > 0 ? shape.spikes * 2 : 22
  const points: Vec2[] = []

  for (let i = 0; i < segments; i++) {
    const around = (i / segments) * Math.PI * 2

    const body = 1 - shape.nose * Math.cos(around) + shape.belly * Math.cos(around * 2)
    const spike = shape.spikes > 0 ? 1 + shape.spikiness * Math.cos(shape.spikes * around) : 1

    const reach = shape.radius * swell * body * spike
    const facing = angle + around

    points.push({
      x: x + Math.cos(facing) * reach,
      y: y + Math.sin(facing) * reach,
    })
  }

  return points
}

/**
 * A point inside a cell, `back` fractions of its radius behind the centre.
 * Negative for a point towards the nose.
 */
export function insideCell(
  x: number,
  y: number,
  angle: number,
  shape: CellShape,
  back: number,
): Vec2 {
  return {
    x: x - Math.cos(angle) * shape.radius * back,
    y: y - Math.sin(angle) * shape.radius * back,
  }
}

/** How a rod's tail is shaped: how far it trails, and how hard it wiggles. */
export interface TailShape {
  /** How far behind the body the tip reaches. */
  length: number
  /** How far the tip swings either side of straight. */
  waveHeight: number
  /** How many full waves fit along the tail at once. */
  waves: number
}

/** How many waves are on a tail at once. Under 1 keeps it a wiggle, not a coil. */
const TAIL_WAVES = 0.85

/** How far the tip swings either side of straight, as a fraction of tail length. */
const TAIL_SWING = 0.3

/**
 * How far inside the body a tail is rooted, as a fraction of the body's length.
 * Just past the middle, so the root is well buried whichever way the wave is
 * leaning.
 */
export const ROD_TAIL_ROOT = 0.35

/** The tail a rod with a tail this long wears. */
export function rodTailShape(tailLength: number): TailShape {
  return {
    length: tailLength,
    waveHeight: tailLength * TAIL_SWING,
    waves: TAIL_WAVES,
  }
}

/**
 * A rod's tail: a wiggly whip trailing off its back end.
 *
 * The points come back in the rod's own space, with the rod facing along +x, so
 * the tail runs off to the left and whatever draws it can turn the whole
 * bacterium as one piece. `root` is how far back the tail starts — tuck it
 * inside the body and the join disappears under the fill, which is what makes
 * the tail look like it grows out of the bacterium rather than being stuck on
 * the end of it.
 *
 * The wave gets taller towards the tip, because the root is anchored in the
 * body and the tip is not. `phase` slides the wave along the tail: wind it up
 * over time and the wave travels tip-wards, which is the direction a real
 * flagellum pushes its bacterium along.
 *
 * Lives here with the cell outlines so the tail on the HUD's little bacterium
 * is drawn by the same code as the tails out in the tissue.
 */
export function rodTail(root: number, shape: TailShape, phase: number, segments = 14): Vec2[] {
  const points: Vec2[] = []

  for (let i = 0; i <= segments; i++) {
    // 0 at the root, 1 at the tip.
    const along = i / segments

    points.push({
      x: -root - shape.length * along,
      y: shape.waveHeight * along * Math.sin(along * shape.waves * Math.PI * 2 - phase),
    })
  }

  return points
}
