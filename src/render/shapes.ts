import type { Vec2 } from '../sim/geometry'

/** Anything drawn as a pear: the radius and how the two ends are shaped. */
export interface PearShape {
  radius: number
  nose: number
  belly: number
}

/**
 * The outline of an immune cell: a circle with its bulk pushed to the back and
 * its front pinched in, built around the direction it is facing so the narrow
 * end always leads.
 *
 * `nose` pinches the front in and `belly` fattens the back out, both as
 * fractions of the radius, so nose 0 and belly 0 draws a plain circle.
 * `swell` puffs the whole thing up while the cell has something inside it.
 *
 * Lives here rather than in LevelScene so the little pictures in the HUD are
 * drawn by the same code as the cells themselves, and can't drift apart.
 */
export function pearOutline(
  x: number,
  y: number,
  angle: number,
  shape: PearShape,
  swell = 1,
): Vec2[] {
  const segments = 22
  const points: Vec2[] = []

  for (let i = 0; i < segments; i++) {
    const around = (i / segments) * Math.PI * 2
    const reach =
      shape.radius * swell * (1 - shape.nose * Math.cos(around) + shape.belly * Math.cos(around * 2))
    const facing = angle + around

    points.push({
      x: x + Math.cos(facing) * reach,
      y: y + Math.sin(facing) * reach,
    })
  }

  return points
}

/**
 * A point inside a pear, `back` fractions of its radius behind the centre.
 * Negative for a point towards the nose.
 */
export function insidePear(
  x: number,
  y: number,
  angle: number,
  shape: PearShape,
  back: number,
): Vec2 {
  return {
    x: x - Math.cos(angle) * shape.radius * back,
    y: y - Math.sin(angle) * shape.radius * back,
  }
}
