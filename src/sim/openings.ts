import type { Edge, EdgeRegionDef, EdgeRegionShape } from '../content/levels'
import type { KeepOut, Rect, Size, Vec2 } from './geometry'
import { makeRng, randomRange } from './rng'

/**
 * An opening or entry, worked out into actual coordinates.
 *
 * A definition says "a vessel on the left, 30% of the way down, 165 wide".
 * This is that turned into a mouth position, a direction pointing into the
 * tissue, and the shape body cells are kept out of.
 */
export interface EdgeRegion {
  id: string
  label: string
  edge: Edge
  shape: EdgeRegionShape
  width: number
  depth: number
  /** Midpoint of the mouth, sitting on the edge of the tissue. */
  mouth: Vec2
  /** Unit vector pointing from the mouth into the tissue. */
  inward: Vec2
  /** Unit vector along the mouth, at right angles to `inward`. */
  tangent: Vec2
  /** The rectangle the shape sits in. A wound only fills part of it. */
  corridor: Rect
  /** The real outline, and what tissue is kept out of. */
  keepOut: KeepOut
  /**
   * A wound's two torn walls, each running from the mouth down to the tip, with
   * the same number of points in both so they can be paired up. Null for a
   * mouth, which is just its corridor.
   *
   * Which wall is which side doesn't matter — they are only ever used together.
   */
  walls: [Vec2[], Vec2[]] | null
  /** A point just inside the tissue — where arriving cells will appear. */
  innerPoint: Vec2
  /**
   * How much room there is sideways at `innerPoint`. Half the width for a
   * mouth; much less for a wound, which has narrowed by the time it gets
   * that deep. Arrivals spread across this, so they come out of the gap that
   * is really there rather than a gap the size of the mouth.
   */
  innerHalfWidth: number
}

/** How far in `innerPoint` sits, as a fraction of the region's depth. */
const INNER_POINT_DEPTH = 0.6

/** How many steps each wall of a wound is drawn in. More is smoother. */
const WOUND_STEPS = 12

/** A gash never comes to a mathematical point. This is its half-width at the tip. */
const WOUND_TIP_HALF_WIDTH = 4

/**
 * How sharply the walls draw in. Above 1 they curve inwards rather than running
 * straight, which is what makes it read as sliced open rather than as a notch.
 */
const WOUND_TAPER = 1.35

/**
 * How raggedly the walls wander, as a fraction of the width they would have if
 * they were straight. The wander only ever bites *inwards*, so a wound is never
 * wider than the `width` its level asked for.
 */
const WOUND_RAGGEDNESS = 0.16

export function resolveEdgeRegion(
  def: EdgeRegionDef,
  bounds: Size,
  defaultShape: EdgeRegionShape,
): EdgeRegion {
  const half = def.width / 2

  switch (def.edge) {
    case 'left': {
      const y = def.along * bounds.height
      return build(def, defaultShape, { x: 0, y }, { x: 1, y: 0 }, {
        x: 0,
        y: y - half,
        width: def.depth,
        height: def.width,
      })
    }
    case 'right': {
      const y = def.along * bounds.height
      return build(def, defaultShape, { x: bounds.width, y }, { x: -1, y: 0 }, {
        x: bounds.width - def.depth,
        y: y - half,
        width: def.depth,
        height: def.width,
      })
    }
    case 'top': {
      const x = def.along * bounds.width
      return build(def, defaultShape, { x, y: 0 }, { x: 0, y: 1 }, {
        x: x - half,
        y: 0,
        width: def.width,
        height: def.depth,
      })
    }
    case 'bottom': {
      const x = def.along * bounds.width
      return build(def, defaultShape, { x, y: bounds.height }, { x: 0, y: -1 }, {
        x: x - half,
        y: bounds.height - def.depth,
        width: def.width,
        height: def.depth,
      })
    }
  }
}

function build(
  def: EdgeRegionDef,
  defaultShape: EdgeRegionShape,
  mouth: Vec2,
  inward: Vec2,
  corridor: Rect,
): EdgeRegion {
  const shape = def.shape ?? defaultShape
  const tangent = { x: -inward.y, y: inward.x }
  const walls = shape === 'wound' ? buildWoundWalls(def, mouth, inward, tangent) : null

  return {
    id: def.id,
    label: def.label,
    edge: def.edge,
    shape,
    width: def.width,
    depth: def.depth,
    mouth,
    inward,
    tangent,
    corridor,
    keepOut: {
      bounds: corridor,
      // A wound is walked down one wall and back up the other.
      outline: walls ? [...walls[0], ...[...walls[1]].reverse()] : rectCorners(corridor),
    },
    walls,
    innerPoint: {
      x: mouth.x + inward.x * def.depth * INNER_POINT_DEPTH,
      y: mouth.y + inward.y * def.depth * INNER_POINT_DEPTH,
    },
    innerHalfWidth:
      shape === 'wound'
        ? straightHalfWidth(def.width / 2, INNER_POINT_DEPTH)
        : def.width / 2,
  }
}

/**
 * The two walls of a gash.
 *
 * Both taper from the full width at the surface down to a blunt tip, and both
 * wander as they go, out of step with each other, so the wound looks torn open
 * rather than cut with a pair of scissors. The whole thing also leans slightly
 * to one side, which puts the tip off-centre.
 *
 * The wander is seeded from the region's own id, so a wound tears exactly the
 * same way every time the game is reloaded.
 */
function buildWoundWalls(
  def: EdgeRegionDef,
  mouth: Vec2,
  inward: Vec2,
  tangent: Vec2,
): [Vec2[], Vec2[]] {
  const rng = makeRng(hashText(def.id))

  const phaseA = rng() * Math.PI * 2
  const phaseB = rng() * Math.PI * 2
  const ripplesA = randomRange(rng, 3.2, 5.4)
  const ripplesB = randomRange(rng, 3.2, 5.4)
  const lean = randomRange(rng, -0.22, 0.22)

  const half = def.width / 2
  const wallA: Vec2[] = []
  const wallB: Vec2[] = []

  const at = (depth: number, across: number): Vec2 => ({
    x: mouth.x + inward.x * depth + tangent.x * across,
    y: mouth.y + inward.y * depth + tangent.y * across,
  })

  for (let step = 0; step <= WOUND_STEPS; step++) {
    const along = step / WOUND_STEPS
    const straight = straightHalfWidth(half, along)

    // The wander is proportional to the width left, so the tip stays a tip.
    const biteA = 0.5 + 0.5 * Math.sin(along * ripplesA + phaseA)
    const biteB = 0.5 + 0.5 * Math.sin(along * ripplesB + phaseB)

    // Squared, so the lean builds up down at the tip rather than skewing the
    // mouth, which has to stay where the level put it.
    const drift = lean * half * along * along
    const depth = along * def.depth

    wallA.push(at(depth, drift - straight * (1 - WOUND_RAGGEDNESS * biteA)))
    wallB.push(at(depth, drift + straight * (1 - WOUND_RAGGEDNESS * biteB)))
  }

  return [wallA, wallB]
}

/** Half a wound's width `along` of the way in, before the walls wander. */
function straightHalfWidth(half: number, along: number): number {
  return (
    WOUND_TIP_HALF_WIDTH + (half - WOUND_TIP_HALF_WIDTH) * Math.pow(1 - along, WOUND_TAPER)
  )
}

function rectCorners(rect: Rect): Vec2[] {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ]
}

/** A stable number from a string, so a wound tears the same way every reload. */
function hashText(text: string): number {
  let hash = 2166136261

  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}

export function resolveEdgeRegions(
  defs: EdgeRegionDef[],
  bounds: Size,
  defaultShape: EdgeRegionShape,
): EdgeRegion[] {
  return defs.map((def) => resolveEdgeRegion(def, bounds, defaultShape))
}
