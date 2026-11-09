import { balance } from '../content/balance'
import { distance, type Vec2 } from './geometry'

/** Anything that can be picked as a target: it has a place and a name tag. */
export interface Targetable extends Vec2 {
  id: number
}

/**
 * The nearest thing in `candidates` within `range` of `from` that `usable`
 * says yes to, or undefined if there's nothing.
 */
export function nearestInRange<T extends Targetable>(
  from: Vec2,
  range: number,
  candidates: readonly T[],
  usable: (candidate: T) => boolean,
): T | undefined {
  let best: T | undefined
  let bestDistance = range

  for (const candidate of candidates) {
    if (!usable(candidate)) continue

    const away = distance(from.x, from.y, candidate.x, candidate.y)
    if (away < bestDistance) {
      bestDistance = away
      best = candidate
    }
  }

  return best
}

/**
 * Like `nearestInRange`, but it remembers what it was going for.
 *
 * Without this, a cell halfway between two equally close targets flickers: it
 * steps towards one, which makes the other one nearest, so it turns round, and
 * so on forever. Instead it sticks with `currentId` while that target is still
 * there and still in sight, and only swaps when something else is CLEARLY
 * closer — see `balance.retargetMargin`.
 */
export function stickyTarget<T extends Targetable>(
  from: Vec2,
  range: number,
  candidates: readonly T[],
  usable: (candidate: T) => boolean,
  currentId: number | null,
): T | undefined {
  const nearest = nearestInRange(from, range, candidates, usable)
  if (currentId === null || nearest === undefined || nearest.id === currentId) return nearest

  const current = candidates.find((candidate) => candidate.id === currentId)
  if (!current || !usable(current)) return nearest

  const toCurrent = distance(from.x, from.y, current.x, current.y)
  if (toCurrent >= range) return nearest

  const toNearest = distance(from.x, from.y, nearest.x, nearest.y)
  return toNearest < toCurrent * (1 - balance.retargetMargin) ? nearest : current
}
