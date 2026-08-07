import { balance } from '../content/balance'
import type { TissueBlobDef } from '../content/levels'
import { clamp, distance, rectContains, type Rect, type Size } from './geometry'
import { randomRange, type Rng } from './rng'

export interface BodyCell {
  id: number
  x: number
  y: number
  radius: number
  /** 1 is healthy, 0 is dead. */
  health: number
  alive: boolean
  /**
   * A dead body cell fades away but leaves its outline behind: an empty husk
   * that a macrophage has to come and clear up. True from the moment it dies
   * until a macrophage eats it, and then it is gone for good.
   */
  debris: boolean
  /** A fixed number per cell, used to give it its own organic outline. */
  wobbleSeed: number
}

interface Cluster {
  x: number
  y: number
  /** How far this blob reaches from its centre. */
  spread: number
  /** Makes this blob's edge lumpy in its own way, rather than a circle. */
  phase: number
}

interface Candidate {
  x: number
  y: number
  /** 0 at a blob's centre, 1 at its edge. */
  reach: number
  /** reach, shuffled a little. Decides which spots get used. */
  key: number
}

/** How many random positions to consider per cell we want. */
const DARTS_PER_CELL = 300

/** Separation passes per settling step, and again at the end to finish the job. */
const PASSES_PER_STEP = 4
const FINAL_PASSES = 60

/**
 * Grows the tissue: blobs of body cells packed up against each other, with open
 * channels between the blobs for immune cells to move through.
 *
 * How it works:
 *  1. blobs are placed (by hand from the level, or scattered)
 *  2. cells are dropped at random spots inside them, overlaps allowed
 *  3. the cells then settle — pulled gently towards their blob's centre while
 *     shoving each other apart — until they are packed tight and none overlap
 *
 * The settling is what makes this look like tissue. Purely random positions
 * waste too much room and look like spots; a grid always shows through as a
 * grid however much it is jittered. Settling gives dense, irregular packing.
 *
 * `clearRects` are the vessel corridors and wounds — nothing grows there.
 */
export function generateBodyCells(
  area: Size,
  clearRects: Rect[],
  options: { count: number; clusterCount: number; blobs?: TissueBlobDef[] },
  rng: Rng,
): BodyCell[] {
  const radius = balance.bodyCellRadius
  const clearance = radius + balance.openingClearance

  // A body cell is drawn with a lumpy outline that bulges past its radius, so
  // the space it really occupies is bigger than `radius`.
  const drawnRadius = radius * (1 + balance.bodyCellWobble)

  // Clamped at 1: body cells must never overlap, whatever this gets set to.
  const spacingMultiplier = Math.max(1, balance.bodyCellSpacingMultiplier)
  const minCentreDistance = drawnRadius * 2 * spacingMultiplier

  // Blob sizes and separations are measured in "one body cell across", so
  // changing bodyCellRadius keeps the whole layout in proportion.
  const cellWidth = minCentreDistance
  const spreadMin = cellWidth * balance.clusterSpreadMin
  const spreadMax = cellWidth * balance.clusterSpreadMax
  const clusterSeparation = cellWidth * balance.clusterSeparation

  // Cell positions are centres, so keep a whole cell back from the edge.
  const margin = balance.edgeMargin + drawnRadius
  const minX = margin
  const maxX = area.width - margin
  const minY = margin
  const maxY = area.height - margin

  const isClear = (x: number, y: number) =>
    !clearRects.some((rect) => rectContains(rect, x, y, clearance))

  // 1. Work out where the blobs go. A level can place them by hand, which is
  //    how you actually design a level; otherwise they get scattered.
  const clusters: Cluster[] = []

  if (options.blobs && options.blobs.length > 0) {
    for (const blob of options.blobs) {
      clusters.push({
        x: blob.x * area.width,
        y: blob.y * area.height,
        spread:
          blob.size === undefined ? randomRange(rng, spreadMin, spreadMax) : blob.size * cellWidth,
        phase: rng() * Math.PI * 2,
      })
    }
  } else {
    const seedInset = cellWidth * 0.7
    for (let attempt = 0; attempt < 800 && clusters.length < options.clusterCount; attempt++) {
      const x = randomRange(rng, minX + seedInset, maxX - seedInset)
      const y = randomRange(rng, minY + seedInset, maxY - seedInset)
      if (!isClear(x, y)) continue
      if (clusters.some((c) => distance(c.x, c.y, x, y) < clusterSeparation)) continue
      clusters.push({
        x,
        y,
        spread: randomRange(rng, spreadMin, spreadMax),
        phase: rng() * Math.PI * 2,
      })
    }
  }

  // If the level is so full of openings that nothing fit, fall back to one
  // blob in the middle rather than producing no tissue at all.
  if (clusters.length === 0) {
    clusters.push({ x: area.width / 2, y: area.height / 2, spread: spreadMax, phase: 0 })
  }

  // 2. Throw darts across the tissue and keep the ones that land inside a blob.
  //    Bigger blobs collect more of them, so they end up with more cells.
  const candidates: Candidate[] = []

  for (let dart = 0; dart < options.count * DARTS_PER_CELL; dart++) {
    const x = randomRange(rng, minX, maxX)
    const y = randomRange(rng, minY, maxY)

    if (!isClear(x, y)) continue

    const reach = reachIntoNearestBlob(clusters, x, y)
    if (reach > 1) continue

    candidates.push({
      x,
      y,
      reach,
      key: reach + randomRange(rng, 0, balance.tissueRaggedness),
    })
  }

  // 3. Take the innermost spots, so blobs are solid rather than a ring of cells
  //    around an empty middle. Overlaps here are fine — settling sorts them out.
  candidates.sort((a, b) => a.key - b.key)

  const cells: BodyCell[] = []
  for (const candidate of candidates) {
    if (cells.length >= options.count) break
    cells.push({
      id: cells.length + 1,
      x: candidate.x,
      y: candidate.y,
      radius,
      health: 1,
      alive: true,
      debris: false,
      wobbleSeed: rng() * Math.PI * 2,
    })
  }

  // 4. Settle.
  const nudge = (cell: BodyCell, dx: number, dy: number) => {
    // Clamping rather than refusing lets a cell slide along the edge of the
    // screen instead of jamming against it.
    const x = clamp(cell.x + dx, minX, maxX)
    const y = clamp(cell.y + dy, minY, maxY)
    if (!isClear(x, y)) return
    cell.x = x
    cell.y = y
  }

  /** Shove every overlapping pair apart until they are just touching. */
  const separate = (passes: number) => {
    for (let pass = 0; pass < passes; pass++) {
      let moved = false

      for (let i = 0; i < cells.length; i++) {
        for (let j = i + 1; j < cells.length; j++) {
          const a = cells[i]
          const b = cells[j]
          let dx = b.x - a.x
          let dy = b.y - a.y
          let gap = Math.hypot(dx, dy)

          // Exactly on top of each other: pick an arbitrary direction.
          if (gap === 0) {
            dx = 1
            dy = 0
            gap = 1
          }

          if (gap >= minCentreDistance) continue

          const push = (minCentreDistance - gap) / 2
          nudge(a, (-dx / gap) * push, (-dy / gap) * push)
          nudge(b, (dx / gap) * push, (dy / gap) * push)
          moved = true
        }
      }

      if (!moved) return
    }
  }

  const steps = balance.tissueSettleSteps
  const pull = drawnRadius * 0.08

  for (let step = 0; step < steps; step++) {
    // Gravity fades out over time, so it isn't still squashing cells together
    // while the separation below is trying to settle them.
    const strength = pull * (1 - step / steps)

    for (const cell of cells) {
      const cluster = nearestCluster(clusters, cell.x, cell.y)
      const dx = cluster.x - cell.x
      const dy = cluster.y - cell.y
      const away = Math.hypot(dx, dy)
      if (away > 1) nudge(cell, (dx / away) * strength, (dy / away) * strength)
    }

    separate(PASSES_PER_STEP)
  }

  // Separation only, with no gravity fighting it, so nothing is left overlapping.
  separate(FINAL_PASSES)

  // 5. Last resort. If a pair is genuinely jammed — wedged between a vessel wall
  //    and the edge of the screen with nowhere to go — drop one. This is what
  //    makes "body cells never overlap" hold absolutely rather than nearly.
  //    The tolerance stops cells resting exactly against each other from being
  //    mistaken for overlapping.
  const settled: BodyCell[] = []
  for (const cell of cells) {
    const overlaps = settled.some(
      (kept) => distance(kept.x, kept.y, cell.x, cell.y) < minCentreDistance - 0.5,
    )
    if (overlaps) continue

    cell.id = settled.length + 1
    settled.push(cell)
  }

  // The HUD counts the cells we actually placed, so falling short of the level's
  // bodyCellCount would otherwise be invisible. Say so out loud.
  if (settled.length < options.count) {
    console.warn(
      `Tissue: only fitted ${settled.length} of ${options.count} body cells. ` +
        'Make the blobs bigger, add more of them, or lower bodyCellRadius.',
    )
  }

  return settled
}

/**
 * How far into its nearest blob a point sits: 0 at the centre, 1 at the edge,
 * above 1 outside every blob.
 *
 * The blob edge is deliberately lumpy rather than a circle, which is what makes
 * the tissue look grown rather than stamped.
 */
function reachIntoNearestBlob(clusters: Cluster[], x: number, y: number): number {
  let best = Number.POSITIVE_INFINITY

  for (const cluster of clusters) {
    const dx = x - cluster.x
    const dy = y - cluster.y
    const angle = Math.atan2(dy, dx)
    const edge =
      cluster.spread *
      (1 + 0.18 * Math.sin(3 * angle + cluster.phase) + 0.1 * Math.sin(5 * angle - cluster.phase * 1.7))

    const reach = Math.hypot(dx, dy) / edge
    if (reach < best) best = reach
  }

  return best
}

function nearestCluster(clusters: Cluster[], x: number, y: number): Cluster {
  let best = clusters[0]
  let bestDistance = Number.POSITIVE_INFINITY

  for (const cluster of clusters) {
    const away = distance(cluster.x, cluster.y, x, y)
    if (away < bestDistance) {
      bestDistance = away
      best = cluster
    }
  }

  return best
}
