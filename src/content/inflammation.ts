/**
 * INFLAMMATION, AND THE PUS THAT PUSHES A SPLINTER OUT
 * =====================================================
 * Every number for both lives here. Change one, save, and the game reloads.
 *
 * Inflammation is something YOU switch on: press the red button in the bar at
 * the bottom, then click the tissue, and a circle of it goes red. Inside the
 * circle your cells hurry, bacteria wade, and your own tissue slowly suffers,
 * because swelling does real damage. It costs energy every second it is alive.
 *
 * It calms down by itself once the fight in it is over. See GAME_DESIGN.md §7.
 *
 * All of these are first guesses. Tune them while you play.
 */
export const inflammation = {
  // ---------------------------------------------------------------------------
  // THE CIRCLE
  // ---------------------------------------------------------------------------

  /** How big a circle is, in pixels from the middle to the edge. */
  radius: 120,

  /**
   * Energy per second, for each circle, while it is at full strength. A circle
   * that is calming down costs less as it shrinks. 50 healthy body cells earn
   * 5 a second, so one circle eats a fifth of that.
   */
  costPerSecond: 1,

  /**
   * How much faster immune cells move inside a circle. 1.5 is half as fast
   * again. Real inflammation brings blood and signals that hurry them along.
   */
  immuneCellSpeedMultiplier: 2,

  /**
   * How much slower bacteria move inside a circle. 0.6 is a bit over half
   * speed. The swelling is fluid, and swimming through it is hard work.
   */
  pathogenSpeedMultiplier: 0.6,

  /**
   * Damage to each of YOUR body cells inside a circle, every second. A body
   * cell has 1 health, so 0.006 takes nearly three minutes to kill one. A blue
   * bacterium chewing on it does 0.09. Slow, but it adds up if you leave a
   * circle sitting on healthy tissue.
   */
  bodyCellDamagePerSecond: 0.006,

  /**
   * How long a circle waits for bacteria if you put it somewhere with none in
   * it. Lets you lay one down just before a wave arrives.
   */
  graceSeconds: 10,

  /**
   * How long a circle takes to calm down once there are no bacteria in it. It
   * shrinks and gets weaker the whole way, and swells back up if more arrive.
   */
  fadeSeconds: 12,

  /**
   * How small a circle gets just before it disappears, as a fraction of its
   * full size. 0.4 means it shrinks to a bit under half.
   */
  smallestFadingSize: 0.3,

  /**
   * Does a circle touching the splinter stay at full strength for as long as
   * the splinter is in, even with no bacteria in it? Real inflammation goes on
   * while there is something stuck in you. It still costs energy every second,
   * so it is a price for keeping the pus coming. false to switch it off.
   */
  splinterKeepsItGoing: true,

  // ---------------------------------------------------------------------------
  // PUS
  // A splinter is too big for any cell to eat. What gets it out is pus: dead
  // neutrophils piling up round it until the pressure pushes it back out of the
  // skin. Only neutrophils that die near the splinter while that spot is
  // inflamed count. Inflammation is what keeps them fighting there.
  // ---------------------------------------------------------------------------

  /** How close to the splinter a neutrophil has to die for it to count. */
  pusReach: 100,

  /** How much pus one neutrophil leaves when it dies there. */
  pusPerNeutrophil: 1,

  /**
   * How much pus it takes to push the splinter out. 3 is three neutrophils. A
   * neutrophil that throws its NET dies on the spot, so that is the quick way.
   */
  pusToPushOut: 3,

  /**
   * Macrophages clean pus up, which undoes your work, but only when there is
   * nothing better to do: no bacteria to eat and no dead body cells to clear.
   * This is how much pus one mouthful takes away.
   */
  pusPerMacrophageBite: 0.1,

  /** How long a macrophage spends digesting one mouthful of pus. */
  macrophageSecondsPerPusBite: 4,

  /** Energy a mouthful of pus is worth to the macrophage that eats it. */
  energyPerPusBite: 1,

  /**
   * Once the splinter is out, the hole it leaves is still a way in. Later waves
   * that were going to come off the splinter come in through the hole instead,
   * this much of the size. 0.5 is half, rounded up.
   */
  waveSizeAfterPushedOut: 0.5,
}
