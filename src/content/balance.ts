/**
 * BALANCE
 * =======
 * Every number that decides how the game FEELS lives in this file.
 * Change a number, save the file, and the game reloads by itself.
 *
 * Nothing in here is precious. All of it is a guess until we play it.
 */
export const balance = {
  // ---------------------------------------------------------------------------
  // ENERGY
  // Energy is your money AND your health. It comes from living body cells,
  // and the main way you lose it is body cells dying.
  // ---------------------------------------------------------------------------

  /** How much energy you begin a level with. */
  startingEnergy: 100,

  /** Energy earned per second, for each living body cell. 50 cells = +5/sec. */
  incomePerBodyCellPerSecond: 0.1,

  /** One-off energy hit when a body cell dies. This is the big one. */
  energyLostWhenABodyCellDies: 15,

  /** How much energy the bar shows as "full". Display only, changes nothing. */
  energyBarDisplayMax: 300,

  // ---------------------------------------------------------------------------
  // TISSUE
  // How the body cells are laid out. Bigger spacing = roomier channels for
  // immune cells to walk through.
  // ---------------------------------------------------------------------------

  /**
   * Size of one body cell. This is the main dial for how the tissue looks.
   * Everything below scales off it, so you can change just this one number and
   * the blobs, the gaps and the spacing all stay sensible.
   */
  bodyCellRadius: 28,

  /**
   * How lumpy a body cell's outline is, as a fraction of its radius.
   * 0 draws perfect circles. 0.11 bulges out by 11%.
   *
   * The layout needs this number too, because a cell takes up more room than
   * its radius suggests — that is what stops them overlapping.
   */
  bodyCellWobble: 0.11,

  /**
   * How close body cells get, as a multiple of their full drawn width.
   * 1.0 = just touching, never overlapping. Higher leaves a gap.
   * Below 1.0 they would overlap, so the generator refuses to go there.
   */
  bodyCellSpacingMultiplier: 1.0,

  /**
   * How big one blob of tissue is, measured in body cells across.
   * Each blob picks a size somewhere between these two.
   */
  clusterSpreadMin: 1.4,
  clusterSpreadMax: 2.2,

  /**
   * How far apart blob centres are, in body cells. Smaller makes the blobs
   * merge into one mass; bigger breaks the tissue into separate islands.
   */
  clusterSeparation: 2.6,

  /**
   * How ragged the blobs are. Body cells fill a blob from the middle outwards;
   * this is how much that order gets shuffled.
   *
   * 0 fills in near-perfect rings. 0.15 gives a natural uneven edge. Above
   * about 0.4 the blobs start to look moth-eaten.
   */
  tissueRaggedness: 0.4,

  /**
   * How hard the body cells settle together after being placed.
   *
   * 0 leaves them loosely scattered where they landed. Higher squashes them up
   * against each other into proper packed tissue. Very high makes the blobs go
   * round and lose their lumpy edges.
   */
  tissueSettleSteps: 40,

  /** How far body cells stay back from a vessel opening or a wound. */
  openingClearance: 8,

  /** Clear space between the tissue and the edge of the screen. */
  edgeMargin: 16,

  // ---------------------------------------------------------------------------
  // SPRINGY TISSUE
  // Body cells sit on springs. Immune cells and bacteria push them aside to get
  // through, the cells next to them get shoved along too, and they all spring
  // back to where they grew once nothing is pushing.
  // ---------------------------------------------------------------------------

  /**
   * How far a body cell can be pushed from where it grew, in body cells across
   * (1 = one whole cell width). Past this it stops giving way, and whatever is
   * pushing has to squeeze past it instead — see squeezeSpeedMultiplier.
   *
   * Bigger makes the tissue softer: it parts like jelly to let things through.
   */
  bodyCellMaxPush: 0.5,

  /**
   * How quickly a pushed body cell springs back, in seconds. After this long it
   * has gone about two thirds of the way home. Smaller is snappier.
   */
  bodyCellSpringBackSeconds: 1,

  /**
   * How fast something moves while it is pushing living body cells out of its
   * way, as a fraction of its normal speed. Slower than the open channels, so
   * they are still worth using, but much faster than squeezing.
   */
  pushSpeedMultiplier: 0.75,

  /**
   * The same for debris — the outlines dead cells leave behind. A husk is empty
   * and light, so it is shoved aside more easily than a living cell, and when
   * debris and a living cell bump into each other it is the debris that moves.
   */
  pushDebrisSpeedMultiplier: 0.95,

  // ---------------------------------------------------------------------------
  // PATHOGENS
  // Each pathogen's own numbers live in content/pathogens.ts. This is the limit
  // that applies to all of them at once.
  // ---------------------------------------------------------------------------

  /** Hard cap, so runaway bacteria can't grind the game to a halt. */
  maxPathogens: 400,

  /**
   * How much two bacteria are allowed to overlap each other. 0 means they can't
   * overlap at all; 1 means they can sit right on top of each other.
   *
   * 0.6 is the starting point: enough that a big infection still fits on the
   * screen, little enough that a swarm spreads out and you can SEE how many
   * there are, instead of dozens piling onto one spot and looking like a few.
   */
  bacteriaOverlap: 0.6,

  /**
   * The chance that a bacterium splitting in two comes out a shade further UP
   * the colour ladder than its parent — harder, faster, worth more.
   *
   * This is the only way a new colour ever appears in a level: the waves bring
   * blue and nothing else. Let a fight run away from you for long enough and it
   * starts changing colour, which is antigenic drift, and is exactly why the flu
   * vaccine is a yearly guess.
   */
  mutationUpChance: 0.1,

  /**
   * The chance it comes out a shade DOWN the ladder instead, back towards blue.
   *
   * Drift is deliberately lopsided: nine times out of ten it climbs. An even
   * walk up and down goes almost nowhere, so a lineage left alone would take
   * most of an hour to reach green. Weighted this way it climbs steadily, and
   * the odd step back is just enough that the ladder doesn't feel like a
   * one-way escalator.
   */
  mutationDownChance: 0.05,

  // ---------------------------------------------------------------------------
  // IMMUNE CELLS
  // Each cell type's own numbers live in content/cells.ts. These apply to all of
  // them at once.
  // ---------------------------------------------------------------------------

  /**
   * How fast something moves while squeezing past body cells that won't give
   * way any more (they have been pushed as far as bodyCellMaxPush lets them),
   * as a fraction of its normal speed. Immune cells and bacteria alike.
   *
   * This is real: white blood cells crawl through tissue by deforming
   * themselves, and it's slow going. It also means nothing ever gets stuck, so
   * "walk towards the nearest bacterium" still needs no pathfinding.
   */
  squeezeSpeedMultiplier: 0.4,

  /**
   * Do immune cells shove each other apart, or can they stack up?
   * True keeps them spread out; false lets a dozen pile onto one bacterium.
   */
  immuneCellsBlockEachOther: true,

  /**
   * At zero energy the tissue can't feed its immune cells any more and they
   * start to starve: one dies every this many seconds. Lower is more brutal.
   */
  starvationSecondsPerCell: 4,

  // ---------------------------------------------------------------------------
  // TIME
  // The simulation always runs at a fixed 60 ticks per second. These speeds
  // change how many ticks happen per drawn frame, so the game behaves
  // identically whether it is paused, slow or fast.
  // ---------------------------------------------------------------------------

  /** 0 is paused. 1 is normal. Add or remove speeds freely. */
  timeSpeeds: [0, 0.5, 1, 3],

  /** Which of the speeds above a level starts on. 2 means "1x". */
  defaultSpeedIndex: 2,
}
