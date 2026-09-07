import { describe, expect, it } from 'vitest'
import { findImmuneCell } from '../src/content/cells'
import {
  findLevel,
  HUD_HEIGHT,
  levels,
  theCut,
  theGraze,
  thePetriDish,
  TISSUE_VIEW,
  WORLD,
} from '../src/content/levels'
import { findPathogen, pathogens } from '../src/content/pathogens'
import { TICKS_PER_SECOND, World } from '../src/sim/world'

/**
 * The level select lists whatever is in here, so a level with a typo in it now
 * shows up as a card you can click. These check the list is sound rather than
 * checking any particular level is fun.
 */

describe('the level list', () => {
  it('finds a level by id, and shrugs at an unknown one', () => {
    expect(findLevel(levels[0].id)).toBe(levels[0])
    expect(findLevel('the-elbow')).toBeUndefined()
  })

  it('has no duplicate ids, since the menu keys off them', () => {
    const ids = levels.map((level) => level.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every level a name and a blurb to put on its card', () => {
    for (const level of levels) {
      expect(level.name.length).toBeGreaterThan(0)
      expect(level.blurb.length).toBeGreaterThan(0)
      // Long enough to say something, short enough for one card.
      expect(level.blurb.length).toBeLessThan(120)
    }
  })

  it('only asks for pathogens and cells that exist', () => {
    for (const level of levels) {
      for (const wave of level.waves) {
        expect(findPathogen(wave.pathogen), `${level.id} wave of ${wave.pathogen}`).toBeDefined()
      }

      for (const garrison of level.startingCells) {
        expect(findImmuneCell(garrison.cell), `${level.id} starts with ${garrison.cell}`).toBeDefined()
      }
    }
  })

  it('only sends waves through entries it actually has', () => {
    for (const level of levels) {
      const entries = level.entries.map((entry) => entry.id)

      for (const wave of level.waves) {
        if (wave.entry === undefined) continue
        expect(entries, `${level.id} wave via ${wave.entry}`).toContain(wave.entry)
      }
    }
  })

  it('gives every level somewhere for cells to come in and something to come in through', () => {
    for (const level of levels) {
      expect(level.openings.length, `${level.id} has no vessels`).toBeGreaterThan(0)
      expect(level.entries.length, `${level.id} has no way in`).toBeGreaterThan(0)
    }
  })

  it('builds a playable world for every level, with the tissue it asked for', () => {
    for (const level of levels) {
      const world = new World(level, TISSUE_VIEW)

      expect(world.bodyCells.length, `${level.id} tissue`).toBe(level.bodyCellCount)
      expect(world.livingImmuneCellCount, `${level.id} cells`).toBeGreaterThan(0)
      expect(world.isOver, `${level.id} is over before it starts`).toBe(false)
    }
  })

  it('opens every level with a wave, so there is always something to fight', () => {
    for (const level of levels) {
      expect(level.waves.length, `${level.id} has no waves`).toBeGreaterThan(0)
    }
  })

  /**
   * `releaseDueWaves` stops at the first wave that isn't due yet, so a wave
   * written out of order doesn't arrive early — it arrives whenever the wave
   * before it does, or never. Nothing complains, which is why this is a test.
   */
  it('keeps every level\'s waves in the order they will actually fire', () => {
    for (const level of levels) {
      const times = level.waves.map((wave) => wave.at)
      const sorted = [...times].sort((a, b) => a - b)

      expect(times, `${level.id} has waves out of order`).toEqual(sorted)
    }
  })

  it('leaves the tissue area as the screen minus the HUD', () => {
    expect(TISSUE_VIEW.width).toBe(WORLD.width)
    expect(TISSUE_VIEW.height).toBe(WORLD.height - HUD_HEIGHT)
  })
})

/**
 * Level 2 is the graze, and what makes it a graze rather than a second cut is
 * the shape of the way in: two of them, both scraped across the surface rather
 * than cut down into the flesh.
 */
describe('the graze', () => {
  it('is scraped open in two places, one smaller than the other', () => {
    expect(theGraze.entries).toHaveLength(2)

    const [small, big] = theGraze.entries
    expect(small.width).toBeLessThan(big.width)
    expect(small.depth).toBeLessThan(big.depth)
  })

  it('keeps both of them shallow — wider than they are deep', () => {
    for (const entry of theGraze.entries) {
      expect(entry.depth, `${entry.id} is a gouge, not a graze`).toBeLessThan(entry.width)
    }
  })

  it('is a scrape, not a stab: shallower than the cut in level 1', () => {
    const deepest = Math.max(...theGraze.entries.map((entry) => entry.depth))
    const theCutDepth = Math.max(...theCut.entries.map((entry) => entry.depth))

    expect(deepest).toBeLessThan(theCutDepth)
  })

  it('opens with cocci, which is what the level is for', () => {
    const first = theGraze.waves[0]
    const def = findPathogen(first.pathogen)

    expect(def?.shape).toBe('cocci')
  })

  it('uses both scratches, so neither one can be ignored', () => {
    const used = new Set(theGraze.waves.map((wave) => wave.entry))

    for (const entry of theGraze.entries) {
      expect(used, `nothing comes in through ${entry.id}`).toContain(entry.id)
    }
  })
})

/**
 * The Petri Dish is the playtest level, and the whole point of it is that you
 * can see anything in the game without waiting for a mutation to hand it to
 * you. So the one thing worth not breaking is COMPLETENESS: add a pathogen to
 * content/pathogens.ts and forget to drip it in here, and the bench quietly
 * stops being a bench.
 */
describe('the petri dish', () => {
  it('sends every pathogen in the game, so there is nothing you cannot look at', () => {
    const sent = new Set(thePetriDish.waves.map((wave) => wave.pathogen))

    for (const def of pathogens) {
      expect(sent, `the dish never drips in ${def.id}`).toContain(def.id)
    }
  })

  it('uses all three droppers, and defaults a scribbled-in wave to the middle', () => {
    const used = new Set(thePetriDish.waves.map((wave) => wave.entry))

    for (const entry of thePetriDish.entries) {
      expect(used, `nothing comes in through ${entry.id}`).toContain(entry.id)
    }

    // A wave with no `entry` uses the level's first, which is meant to be the
    // one in the middle of the dish with room around it.
    expect(thePetriDish.entries[0].id).toBe('middle-dropper')
  })

  it('drips rather than wounds, so the dish is a dish', () => {
    for (const entry of thePetriDish.entries) {
      expect(entry.shape, `${entry.id} is torn open, not dripped into`).toBe('mouth')
    }
  })

  it('shows each specimen on its own, one at a time', () => {
    // Two waves at a time at most — a rod and its clump — right up until the
    // finale. A testbed wants a specimen, not a swarm.
    const byTime = new Map<number, number>()
    for (const wave of thePetriDish.waves) {
      byTime.set(wave.at, (byTime.get(wave.at) ?? 0) + wave.count)
    }

    const ladder = [...byTime.entries()].slice(0, -1)
    for (const [at, arriving] of ladder) {
      expect(arriving, `${arriving} things arrive at once at ${at}s`).toBeLessThanOrEqual(2)
    }
  })

  it('has enough of a garrison to keep the bench calm', () => {
    const world = new World(thePetriDish, TISSUE_VIEW)

    // Placed by hand, every one of them, so a run is repeatable.
    for (const garrison of thePetriDish.startingCells) {
      expect(garrison.at, `${garrison.cell} is scattered, not placed`).toBeDefined()
    }

    // Measured: below about this many, the blues nobody is studying breed into
    // the hundreds and the tissue is gone before the ladder finishes.
    expect(world.livingImmuneCellCount).toBeGreaterThanOrEqual(8)
  })

  /**
   * The promise the level's own comment makes: you can leave it alone and watch.
   * This is the canary for that — it plays the dish by doing absolutely nothing
   * and checks there is still a dish at the end of the ladder.
   */
  it('survives being ignored for the whole climb, so you can just watch', () => {
    const world = new World(thePetriDish, TISSUE_VIEW)
    const lastRung = thePetriDish.waves[thePetriDish.waves.length - 1].at

    for (let tick = 0; tick < lastRung * TICKS_PER_SECOND; tick++) world.step()

    expect(world.isLost, 'the dish died while nobody touched it').toBe(false)
    expect(world.livingBodyCellCount).toBeGreaterThan(thePetriDish.bodyCellCount / 2)
    // And enough banked to actually try something with.
    expect(world.economy.energy).toBeGreaterThan(100)
  })

  it('opens onto three sides, so a recruit is never a long walk away', () => {
    const edges = new Set(thePetriDish.openings.map((opening) => opening.edge))

    expect(edges.size).toBe(3)
  })
})
