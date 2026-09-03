import { describe, expect, it } from 'vitest'
import { findImmuneCell } from '../src/content/cells'
import {
  findLevel,
  HUD_HEIGHT,
  levels,
  theCut,
  theGraze,
  TISSUE_VIEW,
  WORLD,
} from '../src/content/levels'
import { findPathogen } from '../src/content/pathogens'
import { World } from '../src/sim/world'

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
