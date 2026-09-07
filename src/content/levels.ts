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
 * What one of these looks like on screen, and what shape the tissue is held
 * back in.
 *
 *   mouth  a smooth tube opening into the tissue. Blood vessels are always
 *          this, and so are surfaces like a lung or a gut wall.
 *   wound  a gash torn into the flesh: full width where it broke the surface,
 *          tapering to a point as it cuts in. A cut in the skin.
 *
 * Openings default to `mouth` and entries to `wound`, so most of the time you
 * can leave it out.
 */
export type EdgeRegionShape = 'mouth' | 'wound'

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
  /**
   * Leave it out unless you want a vessel drawn as a gash, or a wound drawn as
   * a smooth surface.
   */
  shape?: EdgeRegionShape
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
  blurb: 'You cut your thumb. Bacteria are getting in through the wound.',
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
  ],

  // Where the bacteria get in. Drawn as a gash, so `depth` is how far the cut
  // goes in before it tapers to a point — a cut wants to be a good deal deeper
  // than it is wide at the tip, or it reads as a shallow notch instead.
  entries: [{ id: 'the-cut', label: 'the cut', edge: 'top', along: 0.5, width: 130, depth: 80 }],

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

/**
 * LEVEL 2 — a graze.
 *
 * A graze isn't one clean cut, it is a scrape: the skin is torn open in several
 * places at once, none of them deep. So this level has TWO ways in, both
 * shallow — a little scratch and a bigger one — and you cannot simply park
 * everything you own on one of them.
 *
 * It is also where COCCI turn up. A cocci is a clump of balls that comes apart
 * one ball at a time, so a single blue one is two mouthfuls rather than one,
 * and a macrophage has to digest the first before it can come back for the
 * second. They are slow enough that you always have time to reach them — the
 * problem is never catching one, it is finishing one off before the next
 * arrives. That is the lesson: a slow enemy you can't kill quickly is worse
 * than a fast one you can.
 */
export const theGraze: LevelDef = {
  id: 'the-graze',
  name: 'The Graze',
  blurb: 'You skidded and scraped your knee. Two scratches, and something round and tough is getting in.',
  seed: 20260903,
  bodyCellCount: 56,
  clusterCount: 7,

  // Tissue under both scratches, so neither one can be ignored, joined by a
  // spine down the middle. The two lower blobs are what you fall back to when
  // the top goes badly — and what the vessels open onto.
  blobs: [
    { x: 0.27, y: 0.22, size: 2.0 }, // under the little scratch
    { x: 0.66, y: 0.2, size: 2.3 }, // under the big one
    { x: 0.46, y: 0.46, size: 2.4 },
    { x: 0.19, y: 0.7, size: 2.2 },
    { x: 0.76, y: 0.63, size: 2.4 },
    { x: 0.5, y: 0.84, size: 1.8 },
  ],

  // Both vessels sit low, well away from the scratches. Nothing you recruit
  // arrives where the trouble is; it has to walk up. With bacteria this slow
  // that is survivable, which is exactly why the cocci are the slow ones.
  openings: [
    { id: 'vessel-lower-left', label: 'vessel', edge: 'left', along: 0.62, width: 150, depth: 68 },
    { id: 'vessel-lower-right', label: 'vessel', edge: 'right', along: 0.56, width: 130, depth: 62 },
  ],

  // Both shallow — a graze scrapes the surface off, it doesn't cut down in. So
  // these are wide for their depth, the opposite shape to the cut in level 1.
  entries: [
    { id: 'small-scratch', label: 'scratch', edge: 'top', along: 0.27, width: 76, depth: 30 },
    { id: 'big-scratch', label: 'scrape', edge: 'top', along: 0.66, width: 148, depth: 44 },
  ],

  // One macrophage parked between the two scratches so there is always
  // something near whichever one goes first, two more roaming, and a neutrophil
  // down by the right-hand vessel. The neutrophil matters here in a way it
  // didn't in level 1: its granules knock a whole ball off a clump every time
  // one lands, which is the fastest way to take a cocci apart.
  startingCells: [
    { cell: 'macrophage', count: 1, at: { x: 0.5, y: 0.36 } },
    { cell: 'macrophage', count: 2 },
    { cell: 'neutrophil', count: 1, at: { x: 0.82, y: 0.74 } },
  ],

  // One cocci on its own first, with plenty of time to work out what it takes
  // to kill it. Then one at the other scratch, so both are live. The rods
  // arriving later are the contrast: five of them are less work than two clumps.
  //
  // Every batch carries one yellow in with it, and which yellow follows the way
  // in: the scrape brings clumps, the scratch brings rods. So a yellow cocci is
  // a fourth ball to chip off where you were already chipping, and a yellow rod
  // is the one thing on the level quick enough to walk away from a macrophage —
  // the neutrophil down by the right-hand vessel is the answer to both.
  //
  // Waves sharing an `at` all arrive together, which is how a scrape batch and
  // a scratch batch land at the same moment.
  waves: [
    { at: 4, pathogen: 'blue-cocci', count: 1, entry: 'big-scratch' },
    { at: 4, pathogen: 'yellow-cocci', count: 1, entry: 'big-scratch' },
    { at: 28, pathogen: 'blue-cocci', count: 1, entry: 'small-scratch' },
    { at: 28, pathogen: 'yellow-bacteria', count: 1, entry: 'small-scratch' },
    { at: 55, pathogen: 'blue-cocci', count: 2, entry: 'big-scratch' },
    { at: 55, pathogen: 'yellow-cocci', count: 1, entry: 'big-scratch' },
    { at: 85, pathogen: 'blue-bacteria', count: 3, entry: 'small-scratch' },
    { at: 85, pathogen: 'yellow-bacteria', count: 1, entry: 'small-scratch' },
    { at: 118, pathogen: 'blue-cocci', count: 2, entry: 'big-scratch' },
    { at: 118, pathogen: 'yellow-cocci', count: 1, entry: 'big-scratch' },
    { at: 118, pathogen: 'blue-bacteria', count: 2, entry: 'small-scratch' },
    { at: 118, pathogen: 'yellow-bacteria', count: 1, entry: 'small-scratch' },
    { at: 152, pathogen: 'blue-cocci', count: 3, entry: 'big-scratch' },
    { at: 152, pathogen: 'yellow-cocci', count: 1, entry: 'big-scratch' },
  ],
}

/**
 * THE PETRI DISH — the playtest level.
 *
 * This one is not a level to win. It is a bench to put things on and look at
 * them, so that trying out a new pathogen or a new immune cell never means
 * touching The Cut or The Graze. Break this level as much as you like.
 *
 * Everything about it is chosen to get out of the way, so that whatever happens
 * is the thing you were testing and not the terrain:
 *
 *   ONE EVEN FIELD OF TISSUE — a big blob in the middle with four round it, so
 *   there is always something for a pathogen to eat wherever it comes in, and
 *   open channels between them to watch things move through.
 *
 *   THREE VESSELS, ALL CLOSE — left, right, and one underneath. In the real
 *   levels the walk from the vessel is half the lesson; here it is just waiting
 *   about, so you can put a freshly recruited cell next to anything in seconds.
 *
 *   THREE DROPPERS ALONG THE TOP — smooth mouths rather than gashes, because
 *   nothing here is a wound. Somebody is dripping bacteria in on purpose.
 *
 *   THE WHOLE FAMILY, ONE AT A TIME — the waves walk all six colours up the
 *   ladder in both shapes, rods down the left and clumps down the right, a new
 *   rung every fifteen seconds. So you can watch a purple without first winning
 *   an argument with a mutation dice roll, and you see each one on its own
 *   before the next arrives.
 *
 * HOW TO USE IT
 *
 *   To look at one thing and nothing else, change its wave's `at` to 4 and
 *   delete the ones above it. To keep something alive longer, raise the `at` of
 *   whatever comes next.
 *
 *   To try a pathogen that doesn't exist yet, add it to content/pathogens.ts and
 *   put one line in the waves below. To try a new immune cell, add it to
 *   content/cells.ts and put it in `startingCells` — it will be there from the
 *   first second, which is what you want when you are watching how it behaves.
 *
 *   The clock is your friend: 3x runs the whole ladder in about forty seconds,
 *   and pause lets you stop on the interesting frame.
 *
 *   Left completely alone it holds 53 of its 58 body cells right through the
 *   climb, with the energy piling up past 500 — so for the two minutes it takes
 *   the ladder to run, you can watch instead of play.
 *
 *   It is not safe forever, mind. Everything in here still breeds, and it
 *   breeds faster than five macrophages can eat: ignore the dish for four
 *   minutes and there is barely any tissue left. If you want longer to stare at
 *   something, pause, or thin the specimens out yourself.
 */
export const thePetriDish: LevelDef = {
  id: 'the-petri-dish',
  name: 'The Petri Dish',
  blurb: 'A dish to try things out in. Every bacteria in the game turns up here, one at a time.',
  seed: 20260907,
  bodyCellCount: 58,
  clusterCount: 5,

  // A middle mass with four blobs around it, evenly spaced. Deliberately dull:
  // a symmetrical layout means a pathogen that behaves oddly on the left and
  // sensibly on the right is telling you something real.
  blobs: [
    { x: 0.5, y: 0.52, size: 3.0 }, // the middle of the dish
    { x: 0.2, y: 0.28, size: 2.35 }, // under the rod dropper
    { x: 0.8, y: 0.28, size: 2.35 }, // under the clump dropper
    { x: 0.22, y: 0.78, size: 2.35 },
    { x: 0.78, y: 0.78, size: 2.35 },
  ],

  // Wide, and one on three different sides. Between them there is nowhere in
  // the dish you cannot get a recruit to quickly.
  openings: [
    { id: 'vessel-left', label: 'vessel', edge: 'left', along: 0.55, width: 190, depth: 72 },
    { id: 'vessel-right', label: 'vessel', edge: 'right', along: 0.55, width: 190, depth: 72 },
    { id: 'vessel-bottom', label: 'vessel', edge: 'bottom', along: 0.5, width: 170, depth: 68 },
  ],

  // `mouth`, not the usual `wound`: these are pipettes, not injuries, and they
  // draw as neat tubes so the dish reads as a dish on the level-select card.
  //
  // The middle one is FIRST on purpose — a wave written without an `entry` uses
  // the level's first — so a line you scribble in to try something lands in the
  // middle of the dish with nothing else going on around it.
  //
  // The left and right labels describe the schedule below rather than the holes
  // themselves. Send clumps down the left if you like; rename the label to
  // match and nothing else cares.
  entries: [
    { id: 'middle-dropper', label: 'dropper', edge: 'top', along: 0.5, width: 90, depth: 50, shape: 'mouth' },
    { id: 'left-dropper', label: 'rods', edge: 'top', along: 0.2, width: 90, depth: 50, shape: 'mouth' },
    { id: 'right-dropper', label: 'clumps', edge: 'top', along: 0.8, width: 90, depth: 50, shape: 'mouth' },
  ],

  // A big garrison, every one of them placed by hand so the dish starts exactly
  // the same way every single time. Two macrophages in the middle where they
  // can reach any dropper, one at each vessel, and a neutrophil in the middle
  // and at both side vessels.
  //
  // Five macrophages sounds like a lot for a level nobody has to win, and it is
  // the number that makes the bench a bench. A macrophage moves at 16 and
  // everything above blue swims at 30 or more, so a crowd of them cannot chase
  // your specimen down and eat it before you have looked at it — all they can
  // do is mop up whatever blunders into them, which is exactly the job. Without
  // them the blues you weren't studying breed into the hundreds and the tissue
  // is gone in three minutes. With them the dish sits at about 53 of its 58
  // body cells for the whole climb, with the energy piling up.
  //
  // Three neutrophils, because they are what you actually want to be testing:
  // they are the only thing fast enough to catch the top of the ladder, and the
  // only thing with granules and NETs. They live 90 seconds, and the purple
  // wave lands at 79 — so the three you start with are still just alive to be
  // thrown at it. After that you buy more, which by then you can easily afford.
  startingCells: [
    { cell: 'macrophage', count: 2, at: { x: 0.5, y: 0.52 } },
    { cell: 'macrophage', count: 1, at: { x: 0.5, y: 0.85 } },
    { cell: 'macrophage', count: 1, at: { x: 0.12, y: 0.55 } },
    { cell: 'macrophage', count: 1, at: { x: 0.88, y: 0.55 } },
    { cell: 'neutrophil', count: 1, at: { x: 0.5, y: 0.52 } },
    { cell: 'neutrophil', count: 1, at: { x: 0.12, y: 0.55 } },
    { cell: 'neutrophil', count: 1, at: { x: 0.88, y: 0.55 } },
  ],

  // The whole ladder, a rung every 15 seconds, rods on the left and clumps on
  // the right so you can watch the two shapes of one colour side by side. One
  // of each, because a testbed wants a specimen and not a swarm.
  //
  // Then, at 115, a finale — three purples at once through the middle dropper,
  // so the level can actually be won rather than just looked at. Clear
  // everything after that wave has landed and the tissue is saved.
  //
  // Waves have to stay in `at` order: the simulation stops at the first one
  // that isn't due yet, so a wave out of order arrives late or not at all.
  waves: [
    { at: 4, pathogen: 'blue-bacteria', count: 1, entry: 'left-dropper' },
    { at: 4, pathogen: 'blue-cocci', count: 1, entry: 'right-dropper' },
    { at: 19, pathogen: 'yellow-bacteria', count: 1, entry: 'left-dropper' },
    { at: 19, pathogen: 'yellow-cocci', count: 1, entry: 'right-dropper' },
    { at: 34, pathogen: 'red-bacteria', count: 1, entry: 'left-dropper' },
    { at: 34, pathogen: 'red-cocci', count: 1, entry: 'right-dropper' },
    { at: 49, pathogen: 'green-bacteria', count: 1, entry: 'left-dropper' },
    { at: 49, pathogen: 'green-cocci', count: 1, entry: 'right-dropper' },
    { at: 64, pathogen: 'orange-bacteria', count: 1, entry: 'left-dropper' },
    { at: 64, pathogen: 'orange-cocci', count: 1, entry: 'right-dropper' },
    { at: 79, pathogen: 'purple-bacteria', count: 1, entry: 'left-dropper' },
    { at: 79, pathogen: 'purple-cocci', count: 1, entry: 'right-dropper' },
    { at: 115, pathogen: 'purple-bacteria', count: 2, entry: 'middle-dropper' },
    { at: 115, pathogen: 'purple-cocci', count: 1, entry: 'middle-dropper' },
  ],
}

/**
 * The Petri Dish goes last: it is a bench rather than a place, and it is not
 * part of anybody's progress through the game.
 */
export const levels: LevelDef[] = [theCut, theGraze, thePetriDish]

/** Returns undefined for an unknown id rather than crashing. */
export function findLevel(id: string): LevelDef | undefined {
  return levels.find((level) => level.id === id)
}
