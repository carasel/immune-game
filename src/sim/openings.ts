import type { Edge, EdgeRegionDef } from '../content/levels'
import type { Rect, Size, Vec2 } from './geometry'

/**
 * An opening or entry, worked out into actual coordinates.
 *
 * A definition says "a vessel on the left, 30% of the way down, 165 wide".
 * This is that turned into a mouth position, a direction pointing into the
 * tissue, and a corridor rectangle that body cells are kept out of.
 */
export interface EdgeRegion {
  id: string
  label: string
  edge: Edge
  width: number
  depth: number
  /** Midpoint of the mouth, sitting on the edge of the tissue. */
  mouth: Vec2
  /** Unit vector pointing from the mouth into the tissue. */
  inward: Vec2
  /** The rectangle kept clear of body cells. */
  corridor: Rect
  /** A point just inside the tissue — where arriving cells will appear. */
  innerPoint: Vec2
}

export function resolveEdgeRegion(def: EdgeRegionDef, bounds: Size): EdgeRegion {
  const half = def.width / 2

  switch (def.edge) {
    case 'left': {
      const y = def.along * bounds.height
      return build(def, { x: 0, y }, { x: 1, y: 0 }, {
        x: 0,
        y: y - half,
        width: def.depth,
        height: def.width,
      })
    }
    case 'right': {
      const y = def.along * bounds.height
      return build(def, { x: bounds.width, y }, { x: -1, y: 0 }, {
        x: bounds.width - def.depth,
        y: y - half,
        width: def.depth,
        height: def.width,
      })
    }
    case 'top': {
      const x = def.along * bounds.width
      return build(def, { x, y: 0 }, { x: 0, y: 1 }, {
        x: x - half,
        y: 0,
        width: def.width,
        height: def.depth,
      })
    }
    case 'bottom': {
      const x = def.along * bounds.width
      return build(def, { x, y: bounds.height }, { x: 0, y: -1 }, {
        x: x - half,
        y: bounds.height - def.depth,
        width: def.width,
        height: def.depth,
      })
    }
  }
}

function build(def: EdgeRegionDef, mouth: Vec2, inward: Vec2, corridor: Rect): EdgeRegion {
  return {
    id: def.id,
    label: def.label,
    edge: def.edge,
    width: def.width,
    depth: def.depth,
    mouth,
    inward,
    corridor,
    innerPoint: {
      x: mouth.x + inward.x * def.depth * 0.6,
      y: mouth.y + inward.y * def.depth * 0.6,
    },
  }
}

export function resolveEdgeRegions(defs: EdgeRegionDef[], bounds: Size): EdgeRegion[] {
  return defs.map((def) => resolveEdgeRegion(def, bounds))
}
