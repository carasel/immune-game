/**
 * A seeded random number generator.
 *
 * We never use Math.random() in the simulation. Everything random comes from
 * here, seeded from the level. That means the same level always builds the same
 * tissue, and a bug can be reproduced instead of guessed at.
 */
export type Rng = () => number

/** mulberry32 — small, fast, good enough for a game. */
export function makeRng(seed: number): Rng {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function randomRange(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min)
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]
}
