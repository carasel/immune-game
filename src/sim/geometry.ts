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
