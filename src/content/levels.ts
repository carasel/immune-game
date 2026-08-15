/**
 * LEVELS
 * ======
 * Each level describes a piece of tissue: how big the blobs of body cells are,
 * where your immune cells come in from (the openings), and where the pathogens
 * get in (the entries).
 *
 * To make a new level, copy an existing one and change the numbers.
 */

/** Which side of the screen something sits on. */
export type Edge = 'left' | 'right' | 'top' | 'bottom'

/**
 * A gap in the edge of the tissue. Used for two different things:
 *  - openings: blood vessels, where YOUR immune cells arrive
 *  - entries:  wounds and surfaces, where the PATHOGENS get in
 */
export interface EdgeRegionDef {
  id: string
  /** Shown on screen so you can see which one is which. */
  label: string
  edge: Edge
  /**
   * Where along that edge it sits, from 0 to 1.
   * For left and right edges, 0 is the top. For top and bottom, 0 is the left.
   */
  along: number
  /** How wide the mouth is, in pixels. Wide = lots of cells at once. */
  width: number
  /** How far it cuts into the tissue. */
  depth: number
}

/**
 * Where one blob of tissue sits. Positions are fractions of the tissue area, so
 * 0.5, 0.5 is the middle and 0.5, 0 is the top middle.
 */
export interface TissueBlobDef {
  x: number
  y: number
  /** How big it is, measured in body cells across. Leave out for a random size. */
  size?: number
}

/**
 * Immune cells that are already in the tissue when the level starts — the
 * garrison. Cells you recruit later arrive at a vessel opening instead and have
 * to walk in.
 */
export interface StartingCellDef {
  /** Which cell, by `id` from content/cells.ts. */
  cell: string
  count: number
  /**
   * Where they start, as fractions of the tissue area, exactly like the blobs.
   * So 0.5, 0.5 is the middle. Leave it out and they are scattered into
   * whatever open space the tissue has left.
   *
   * This is a real level-design tool: a cell that starts far from where the
   * pathogens get in has to be sent for, and a short-lived one may spend a
   * chunk of its life just walking.
   */
  at?: { x: number; y: number }
}

/** One batch of pathogens arriving. */
export interface WaveDef {
  /** Seconds after the level starts. */
  at: number
  /** Which pathogen, by `id` from content/pathogens.ts. */
  pathogen: string
  /** How many arrive at once. */
  count: number
  /** Which entry they come in through, by id. Defaults to the level's first. */
  entry?: string
}

export interface LevelDef {
  id: string
  name: string
  /** One line, shown under the level. Written for a 9-year-old. */
  blurb: string
  /**
   * Any number you like. The same seed always builds the same tissue, so a
   * level you have tuned stays exactly as you tuned it. Change it to reroll.
   */
  seed: number
  /** How many body cells to try to fit in. */
  bodyCellCount: number
  /**
   * Where the blobs of tissue go. This is the main tool for designing a level:
   * put tissue where you want the fight to happen.
   */
  blobs?: TissueBlobDef[]
  /**
   * Only used when `blobs` is left out — then this many blobs are scattered
   * randomly instead. Handy for roughing out a new level quickly.
   */
  clusterCount: number
  openings: EdgeRegionDef[]
  entries: EdgeRegionDef[]
  /** Which immune cells are already on duty when the level begins. */
  startingCells: StartingCellDef[]
  /** When the pathogens turn up, and how many. */
  waves: WaveDef[]
}

/**
 * The size of the game window.
 * The bottom strip is reserved for the HUD, so the tissue itself gets
 * TISSUE_VIEW. All level and simulation coordinates use TISSUE_VIEW.
 */
export const WORLD = { width: 960, height: 600 }
/** One line of symbols along the bottom. Words cost height; pictures don't. */
export const HUD_HEIGHT = 48
export const TISSUE_VIEW = { width: WORLD.width, height: WORLD.height - HUD_HEIGHT }

/**
 * LEVEL 1 — a cut in the skin.
 * Forgiving on purpose: two wide vessels close to the wound, one narrow one
 * further away so you can feel the difference.
 */
export const theCut: LevelDef = {
  id: 'the-cut',
  name: 'The Cut',
  blurb: 'You grazed your knee. Bacteria are getting in through the wound.',
  seed: 20260805,
  bodyCellCount: 50,
  clusterCount: 7,

  // Tissue right under the cut, so the bacteria have something to attack the
  // moment they get in, then more spread down and out towards the vessels.
  blobs: [
    { x: 0.5, y: 0.3, size: 2.1 }, // hugging the wound
    { x: 0.23, y: 0.24, size: 1.8 },
    { x: 0.76, y: 0.22, size: 1.9 },
    { x: 0.31, y: 0.66, size: 3.0 },
    { x: 0.56, y: 0.74, size: 1.8 },
    { x: 0.79, y: 0.6, size: 1.9 },
  ],

  // Blood vessels. Your immune cells walk in from these.
  openings: [
    { id: 'vessel-upper-left', label: 'vessel', edge: 'left', along: 0.3, width: 165, depth: 70 },
    { id: 'vessel-right', label: 'vessel', edge: 'right', along: 0.48, width: 140, depth: 65 },
    { id: 'vessel-lower-left', label: 'narrow vessel', edge: 'left', along: 0.82, width: 80, depth: 55 },
  ],

  // Where the bacteria get in.
  entries: [{ id: 'the-cut', label: 'the cut', edge: 'top', along: 0.5, width: 150, depth: 42 }],

  // Two macrophages already patrolling wherever there is room, and one
  // neutrophil right down in the far corner by the narrow vessel. It is the
  // fastest thing you have and it starts furthest from the trouble, so you have
  // to notice it and send it — and it only lives 90 seconds, which is the lesson.
  startingCells: [
    { cell: 'macrophage', count: 2 },
    { cell: 'neutrophil', count: 1, at: { x: 0.12, y: 0.82 } },
  ],

  // A couple get in through the cut, then more as the wound stays open. They
  // also split in two on their own, so later waves land on top of a growing
  // problem rather than a clean slate.
  waves: [
    { at: 3, pathogen: 'blue-bacteria', count: 2 },
    { at: 30, pathogen: 'blue-bacteria', count: 3 },
    { at: 65, pathogen: 'blue-bacteria', count: 4 },
    { at: 105, pathogen: 'blue-bacteria', count: 5 },
  ],
}

export const levels: LevelDef[] = [theCut]
