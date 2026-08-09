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
