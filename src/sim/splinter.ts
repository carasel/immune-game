import type { SplinterDef } from '../content/levels'
import {
  distanceToPolygon,
  keepOutContains,
  nearestPointOnPolygon,
  polygonCentre,
  polygonContains,
  pushOutOfPolygon,
  type KeepOut,
  type Size,
  type Vec2,
} from './geometry'
import { randomRange, type Rng } from './rng'

/**
 * A splinter, worked out into real coordinates, and how it is getting on.
 *
 * While it is in, it is solid: nothing walks through it, and anything that
 * bumps into it slides along it towards its tip, which is the way round. Once
 * pus has pushed it out it is just a hole, and nothing is stopped by it.
 */
export interface Splinter {
  id: string
  label: string
  /** The corners in pixels, in the order the level gave them. */
  outline: Vec2[]
  /** What the tissue was kept out of when it grew. */
  keepOut: KeepOut
  /**
   * The sides bacteria come off: every side but the one along the skin, which
   * is outside the tissue.
   */
  sides: [Vec2, Vec2][]
  /** The middle of the end that is stuck in. The way round is past here. */
  tip: Vec2
  /** The middle of the end at the skin, where it went in, and comes back out. */
  skin: Vec2
  /** How much pus has built up round it. */
  pus: number
  pushedOut: boolean
  /** When it came out, in level seconds, so the render can slide it away. */
  pushedOutAtSeconds: number | null
}

/** How near the edge of the screen a corner has to be to count as on it. */
const ON_EDGE = 1

/**
 * Sliding along a side and hitting it nearly head-on are told apart by how
 * much of the step points along the side. Below this, it is head-on.
 */
const HEAD_ON = 0.2

/**
 * How directly a slide has to point back at the skin before it is turned
 * round. Up a long side counts; along the slanted tip does not, so a cell
 * underneath the tip can still slide either way along it.
 */
const SKINWARDS = 0.5

export function resolveSplinter(def: SplinterDef, bounds: Size): Splinter {
  const outline = def.corners.map((corner) => ({
    x: corner.x * bounds.width,
    y: corner.y * bounds.height,
  }))

  const xs = outline.map((point) => point.x)
  const ys = outline.map((point) => point.y)
  const left = Math.min(...xs)
  const top = Math.min(...ys)

  const sides: [Vec2, Vec2][] = []
  for (let i = 0; i < outline.length; i++) {
    const from = outline[i]
    const to = outline[(i + 1) % outline.length]
    if (onScreenEdge(from, bounds) && onScreenEdge(to, bounds)) continue
    sides.push([from, to])
  }

  // The tip is the middle of the corners that are not out at the skin. A
  // splinter with every corner inside the tissue just uses its middle.
  const stuckIn = outline.filter((point) => !onScreenEdge(point, bounds))
  const tip = polygonCentre(stuckIn.length > 0 ? stuckIn : outline)

  // And the skin end is the middle of the corners that are. A splinter lying
  // wholly inside the tissue has no skin end, so it comes out "upwards".
  const atSkin = outline.filter((point) => onScreenEdge(point, bounds))
  const skin = atSkin.length > 0 ? polygonCentre(atSkin) : { x: tip.x, y: 0 }

  return {
    id: def.id,
    label: def.label,
    outline,
    keepOut: {
      bounds: { x: left, y: top, width: Math.max(...xs) - left, height: Math.max(...ys) - top },
      outline,
    },
    sides,
    tip,
    skin,
    pus: 0,
    pushedOut: false,
    pushedOutAtSeconds: null,
  }
}

function onScreenEdge(point: Vec2, bounds: Size): boolean {
  return (
    point.x <= ON_EDGE ||
    point.y <= ON_EDGE ||
    point.x >= bounds.width - ON_EDGE ||
    point.y >= bounds.height - ON_EDGE
  )
}

/** Is something of this radius at (x, y) up against a splinter that is still in? */
export function blockedBySplinter(splinter: Splinter, x: number, y: number, radius: number): boolean {
  return !splinter.pushedOut && keepOutContains(splinter.keepOut, x, y, radius)
}

/** How far (x, y) is from the splinter's outline. */
export function distanceToSplinter(splinter: Splinter, x: number, y: number): number {
  return distanceToPolygon(splinter.outline, x, y)
}

/** Which way round the splinter something is sliding: one way, the other, or not at all. */
export type SlideSense = 1 | -1

/**
 * Where something trying to move from `from` to `to` actually ends up, with a
 * solid splinter in the way, and which way round it is now sliding.
 *
 * It slides along the splinter rather than stopping dead: along a side, and
 * round a corner when it gets to one. Once it has started going round one way
 * it keeps going that way (`sliding` is what it was doing last tick) until its
 * path is clear, so it can't dither at a corner. That is wall-following, and
 * it is the whole of the pathfinding: one shape, one way round it, and a cell
 * sent across never needs to know the splinter is there.
 *
 * The way it starts sliding is the way it was already heading, EXCEPT that it
 * never goes up a side towards the skin. That end is a dead end, stuck in the
 * corner between the splinter and the edge of the tissue; the only way round
 * is past the tip.
 */
export function moveAroundSplinter(
  splinter: Splinter,
  from: Vec2,
  to: Vec2,
  radius: number,
  sliding: SlideSense | null,
): { at: Vec2; sliding: SlideSense | null } {
  if (splinter.pushedOut) return { at: to, sliding: null }
  if (!polygonContains(splinter.outline, to.x, to.y, radius)) return { at: to, sliding: null }

  const stepX = to.x - from.x
  const stepY = to.y - from.y
  const stepLength = Math.hypot(stepX, stepY)

  // Not trying to go anywhere but in the way anyway (shoved there by another
  // cell, or born there), or somehow already inside: just put it outside.
  if (stepLength < 1e-9 || polygonContains(splinter.outline, from.x, from.y)) {
    return { at: pushOutOfPolygon(splinter.outline, to.x, to.y, radius) ?? to, sliding }
  }

  // Which way is "along the splinter" right here: square to the line from the
  // nearest bit of it. Beside a side that is the side; next to a corner it
  // swings round the corner, which is what gets things past one. It always
  // turns the same way round the shape, so +1 means the same thing everywhere.
  const touching = nearestPointOnPolygon(splinter.outline, from.x, from.y)
  let outX = from.x - touching.x
  let outY = from.y - touching.y
  const out = Math.hypot(outX, outY) || 1
  outX /= out
  outY /= out
  const alongX = -outY
  const alongY = outX

  // Which way along is "towards the tip, away from the skin".
  const axisX = splinter.tip.x - splinter.skin.x
  const axisY = splinter.tip.y - splinter.skin.y
  const axis = Math.hypot(axisX, axisY) || 1
  const tipwards = (alongX * axisX + alongY * axisY) / axis

  let direction = sliding ?? startSliding(stepX, stepY, stepLength, alongX, alongY, tipwards)

  // Never up a side into the dead end at the skin, however it got going that
  // way. Swinging round a corner is different: that is getting past the
  // splinter, not going up it, even when the corner leads round onto a side.
  const atCorner = splinter.outline.some(
    (corner) => Math.hypot(corner.x - touching.x, corner.y - touching.y) < 0.5,
  )
  if (!atCorner && direction * tipwards < -SKINWARDS) direction = direction === 1 ? -1 : 1

  const slid = {
    x: from.x + alongX * direction * stepLength,
    y: from.y + alongY * direction * stepLength,
  }

  return {
    at: pushOutOfPolygon(splinter.outline, slid.x, slid.y, radius) ?? slid,
    sliding: direction,
  }
}

/**
 * Which way to start going round, the moment something first bumps into it:
 * the way it was already heading, or past the tip if it walked straight in.
 */
function startSliding(
  stepX: number,
  stepY: number,
  stepLength: number,
  alongX: number,
  alongY: number,
  tipwards: number,
): SlideSense {
  const forwards = stepX * alongX + stepY * alongY

  if (Math.abs(forwards) < stepLength * HEAD_ON) return tipwards >= 0 ? 1 : -1
  return forwards >= 0 ? 1 : -1
}

/**
 * Somewhere just outside one of the splinter's sides, and the direction that
 * points away from it. Longer sides get picked more often, so bacteria come
 * off evenly along the whole thing rather than bunching on the short tip.
 */
export function pointOffSide(splinter: Splinter, rng: Rng, gap: number): { at: Vec2; angle: number } {
  const lengths = splinter.sides.map(([a, b]) => Math.hypot(b.x - a.x, b.y - a.y))
  const total = lengths.reduce((sum, length) => sum + length, 0)

  let pick = rng() * total
  let index = 0
  while (index < lengths.length - 1 && pick > lengths[index]) {
    pick -= lengths[index]
    index++
  }

  const [a, b] = splinter.sides[index]
  // Keep clear of the very corners, where "off this side" is ambiguous.
  const along = randomRange(rng, 0.08, 0.92)
  const on = { x: a.x + (b.x - a.x) * along, y: a.y + (b.y - a.y) * along }

  // Square to the side, whichever way is away from the middle.
  const length = lengths[index] || 1
  let normalX = -(b.y - a.y) / length
  let normalY = (b.x - a.x) / length
  const centre = polygonCentre(splinter.outline)
  if ((on.x - centre.x) * normalX + (on.y - centre.y) * normalY < 0) {
    normalX = -normalX
    normalY = -normalY
  }

  return {
    at: { x: on.x + normalX * gap, y: on.y + normalY * gap },
    angle: Math.atan2(normalY, normalX),
  }
}

/**
 * Somewhere inside the hole a pushed-out splinter left, heading in towards the
 * tip end. Where the waves come in once it has gone.
 */
export function pointInHole(splinter: Splinter, rng: Rng): { at: Vec2; angle: number } {
  const { bounds } = splinter.keepOut
  let at = polygonCentre(splinter.outline)

  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = {
      x: bounds.x + rng() * bounds.width,
      y: bounds.y + rng() * bounds.height,
    }
    if (polygonContains(splinter.outline, candidate.x, candidate.y)) {
      at = candidate
      break
    }
  }

  return { at, angle: Math.atan2(splinter.tip.y - at.y, splinter.tip.x - at.x) }
}
