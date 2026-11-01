export interface Vec2 {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Size {
  width: number
  height: number
}

/** Is (x, y) inside the rectangle? `pad` grows the rectangle outwards first. */
export function rectContains(rect: Rect, x: number, y: number, pad = 0): boolean {
  return (
    x >= rect.x - pad &&
    x <= rect.x + rect.width + pad &&
    y >= rect.y - pad &&
    y <= rect.y + rect.height + pad
  )
}

export function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay)
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

/**
 * An area body cells are kept out of — a vessel corridor, or a wound.
 *
 * `outline` is the real shape, and it never leaves `bounds`. Tissue generation
 * asks "is this spot clear?" tens of thousands of times and almost every spot
 * is nowhere near an opening, so the cheap box answer wants to come first.
 */
export interface KeepOut {
  bounds: Rect
  outline: Vec2[]
}

/** Is (x, y) inside the area, or within `pad` of its edge? */
export function keepOutContains(area: KeepOut, x: number, y: number, pad = 0): boolean {
  if (!rectContains(area.bounds, x, y, pad)) return false
  return polygonContains(area.outline, x, y, pad)
}

/** Is (x, y) inside the polygon, or within `pad` of one of its edges? */
export function polygonContains(points: Vec2[], x: number, y: number, pad = 0): boolean {
  if (pointInPolygon(points, x, y)) return true
  if (pad <= 0) return false

  for (let i = 0; i < points.length; i++) {
    const from = points[i]
    const to = points[(i + 1) % points.length]
    if (distanceToSegment(x, y, from, to) <= pad) return true
  }

  return false
}

/**
 * Ray casting: count the edges that cross a line running left from the point.
 * An odd number means the point is inside.
 */
function pointInPolygon(points: Vec2[], x: number, y: number): boolean {
  let inside = false

  for (let i = 0, previous = points.length - 1; i < points.length; previous = i++) {
    const a = points[i]
    const b = points[previous]

    // Only edges that straddle this y can cross the line at all.
    if (a.y > y === b.y > y) continue

    if (x < a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x)) inside = !inside
  }

  return inside
}

/** Shortest distance from (x, y) to the line segment from `from` to `to`. */
export function distanceToSegment(x: number, y: number, from: Vec2, to: Vec2): number {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const lengthSquared = dx * dx + dy * dy

  // A zero-length segment is just a point.
  if (lengthSquared === 0) return Math.hypot(x - from.x, y - from.y)

  const along = clamp(((x - from.x) * dx + (y - from.y) * dy) / lengthSquared, 0, 1)

  return Math.hypot(x - (from.x + along * dx), y - (from.y + along * dy))
}

/** The closest point on a polygon's outline to (x, y), whether (x, y) is inside or out. */
export function nearestPointOnPolygon(points: Vec2[], x: number, y: number): Vec2 {
  let best: Vec2 = points[0]
  let bestDistance = Number.POSITIVE_INFINITY

  for (let i = 0; i < points.length; i++) {
    const from = points[i]
    const to = points[(i + 1) % points.length]
    const point = nearestPointOnSegment(x, y, from, to)
    const away = Math.hypot(x - point.x, y - point.y)

    if (away < bestDistance) {
      best = point
      bestDistance = away
    }
  }

  return best
}

/** How far (x, y) is from a polygon's outline. Zero on the line, positive both in and out. */
export function distanceToPolygon(points: Vec2[], x: number, y: number): number {
  const nearest = nearestPointOnPolygon(points, x, y)
  return Math.hypot(x - nearest.x, y - nearest.y)
}

export function nearestPointOnSegment(x: number, y: number, from: Vec2, to: Vec2): Vec2 {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return { x: from.x, y: from.y }

  const along = clamp(((x - from.x) * dx + (y - from.y) * dy) / lengthSquared, 0, 1)
  return { x: from.x + along * dx, y: from.y + along * dy }
}

/** The average of the corners. Good enough for "which way is outwards" on a simple shape. */
export function polygonCentre(points: Vec2[]): Vec2 {
  let x = 0
  let y = 0
  for (const point of points) {
    x += point.x
    y += point.y
  }
  return { x: x / points.length, y: y / points.length }
}

/**
 * Where something of radius `pad` at (x, y) has to be to sit just outside a
 * polygon, touching it. Returns null if it is already clear.
 */
export function pushOutOfPolygon(points: Vec2[], x: number, y: number, pad: number): Vec2 | null {
  if (!polygonContains(points, x, y, pad)) return null

  const nearest = nearestPointOnPolygon(points, x, y)

  // Outside, "out" is the way it already is from the line. Inside, the way out
  // is through the nearest edge, which is the other way.
  const inside = pointInPolygon(points, x, y)
  let dx = inside ? nearest.x - x : x - nearest.x
  let dy = inside ? nearest.y - y : y - nearest.y
  let away = Math.hypot(dx, dy)

  // Right on the line there is no "away from it", so go away from the middle.
  if (away < 1e-6) {
    const centre = polygonCentre(points)
    dx = nearest.x - centre.x
    dy = nearest.y - centre.y
    away = Math.hypot(dx, dy) || 1
  }

  return {
    x: nearest.x + (dx / away) * pad,
    y: nearest.y + (dy / away) * pad,
  }
}
