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
  // PATHOGENS
  // Each pathogen's own numbers live in content/pathogens.ts. This is the limit
  // that applies to all of them at once.
  // ---------------------------------------------------------------------------

  /** Hard cap, so runaway bacteria can't grind the game to a halt. */
  maxPathogens: 250,

  // ---------------------------------------------------------------------------
  // IMMUNE CELLS
  // Each cell type's own numbers live in content/cells.ts. These apply to all of
  // them at once.
  // ---------------------------------------------------------------------------

  /**
   * How fast an immune cell moves while squeezing between body cells, as a
   * fraction of its normal speed. This is real: white blood cells crawl through
   * tissue by deforming themselves, and it's slow going. It also means the open
   * channels between the blobs are genuinely worth using.
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
