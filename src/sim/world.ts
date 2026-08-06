import { balance } from '../content/balance'
import type { LevelDef, WaveDef } from '../content/levels'
import { findPathogen, type PathogenDef } from '../content/pathogens'
import { Economy } from './economy'
import type { Size } from './geometry'
import { resolveEdgeRegions, type EdgeRegion } from './openings'
import { updatePathogen, type Pathogen } from './pathogens'
import { makeRng, randomRange, type Rng } from './rng'
import { generateBodyCells, type BodyCell } from './tissue'

/**
 * The simulation runs at a FIXED rate, always. Speeding the game up runs more
 * ticks per drawn frame; it never makes a tick bigger. That means the game
 * behaves identically at 0.5x and 3x, and it can be replayed exactly.
 *
 * Nothing in this folder is allowed to import Phaser.
 */
export const TICKS_PER_SECOND = 60
export const SECONDS_PER_TICK = 1 / TICKS_PER_SECOND

export class World {
  readonly level: LevelDef
  readonly bounds: Size

  /** Blood vessels — where your immune cells arrive. */
  readonly openings: EdgeRegion[]
  /** Wounds and surfaces — where the pathogens get in. */
  readonly entries: EdgeRegion[]

  readonly bodyCells: BodyCell[]
  readonly pathogens: Pathogen[] = []
  readonly economy: Economy

  tickCount = 0

  /** How long the tissue held out. Only meaningful once `isLost` is true. */
  lostAtSeconds = 0

  private lost = false
  private readonly rng: Rng
  private nextPathogenId = 1
  private nextWave = 0

  constructor(level: LevelDef, bounds: Size) {
    this.level = level
    this.bounds = bounds

    this.rng = makeRng(level.seed)
    this.openings = resolveEdgeRegions(level.openings, bounds)
    this.entries = resolveEdgeRegions(level.entries, bounds)

    const clearRects = [...this.openings, ...this.entries].map((region) => region.corridor)
    this.bodyCells = generateBodyCells(
      bounds,
      clearRects,
      { count: level.bodyCellCount, clusterCount: level.clusterCount, blobs: level.blobs },
      this.rng,
    )

    this.economy = new Economy(balance.startingEnergy)
  }

  /**
   * Advance the world by exactly one tick.
   *
   * Losing does not stop the simulation — the bacteria carry on and finish the
   * tissue off, which is worth watching and worth knowing when balancing. The
   * loss is latched instead, so energy climbing back above zero afterwards
   * doesn't undo it.
   */
  step(): void {
    this.tickCount++
    this.releaseDueWaves()
    this.updatePathogens()
    this.economy.addIncome(this.livingBodyCellCount, SECONDS_PER_TICK)

    if (!this.lost && this.economy.energy <= 0) {
      this.lost = true
      this.lostAtSeconds = this.elapsedSeconds
    }
  }

  get elapsedSeconds(): number {
    return this.tickCount * SECONDS_PER_TICK
  }

  get livingBodyCellCount(): number {
    let count = 0
    for (const cell of this.bodyCells) {
      if (cell.alive) count++
    }
    return count
  }

  get livingPathogenCount(): number {
    let count = 0
    for (const pathogen of this.pathogens) {
      if (pathogen.alive) count++
    }
    return count
  }

  /**
   * The tissue ran out of energy. Once immune cells exist this becomes "no
   * energy AND no immune cells left", with starvation killing them off one at a
   * time first — see GAME_DESIGN.md section 2. For now there are no immune
   * cells, so zero energy is the end of it.
   */
  get isLost(): boolean {
    return this.lost
  }

  private releaseDueWaves(): void {
    while (this.nextWave < this.level.waves.length) {
      const wave = this.level.waves[this.nextWave]
      if (this.elapsedSeconds < wave.at) return

      this.nextWave++
      this.releaseWave(wave)
    }
  }

  private releaseWave(wave: WaveDef): void {
    const def = findPathogen(wave.pathogen)
    if (!def) {
      console.error(
        `Level "${this.level.id}" has a wave of "${wave.pathogen}", ` +
          'which is not a pathogen id in content/pathogens.ts.',
      )
      return
    }

    const entry = wave.entry
      ? this.entries.find((candidate) => candidate.id === wave.entry)
      : this.entries[0]

    if (!entry) {
      console.error(`Level "${this.level.id}" has a wave using entry "${wave.entry}", which it has no.`)
      return
    }

    for (let i = 0; i < wave.count; i++) {
      this.addPathogen(def, entry)
    }
  }

  /** Puts a new pathogen just inside an entry, spread across its width. */
  private addPathogen(def: PathogenDef, entry: EdgeRegion): void {
    // Sideways along the mouth, which is at right angles to the inward direction.
    const acrossX = -entry.inward.y
    const acrossY = entry.inward.x
    const offset = randomRange(this.rng, -entry.width * 0.35, entry.width * 0.35)

    this.pathogens.push({
      id: this.nextPathogenId++,
      defId: def.id,
      x: entry.innerPoint.x + acrossX * offset,
      y: entry.innerPoint.y + acrossY * offset,
      angle: Math.atan2(entry.inward.y, entry.inward.x),
      health: def.health,
      alive: true,
      // Staggered, so a whole wave doesn't split at the same instant.
      divideIn: def.divideEverySeconds * randomRange(this.rng, 0.6, 1.1),
      wanderIn: randomRange(this.rng, 0, def.wanderChangeSeconds),
    })
  }

  private updatePathogens(): void {
    const context = {
      dt: SECONDS_PER_TICK,
      bodyCells: this.bodyCells,
      bounds: this.bounds,
      rng: this.rng,
      onBodyCellDied: () => this.economy.chargeForBodyCellDeath(),
    }

    // Newborns go in a separate list so they don't get a turn until next tick.
    const newborns: Pathogen[] = []
    const roomLeft = balance.maxPathogens - this.pathogens.length

    for (const pathogen of this.pathogens) {
      if (!pathogen.alive) continue

      const def = findPathogen(pathogen.defId)
      if (!def) continue

      updatePathogen(pathogen, def, context)

      pathogen.divideIn -= SECONDS_PER_TICK
      if (pathogen.divideIn > 0) continue

      pathogen.divideIn = def.divideEverySeconds
      if (newborns.length >= roomLeft) continue

      newborns.push(this.splitOff(pathogen, def))
    }

    this.pathogens.push(...newborns)
  }

  /** A copy of `parent`, nudged to one side so they aren't exactly stacked. */
  private splitOff(parent: Pathogen, def: PathogenDef): Pathogen {
    const angle = this.rng() * Math.PI * 2

    return {
      id: this.nextPathogenId++,
      defId: parent.defId,
      x: parent.x + Math.cos(angle) * def.radius,
      y: parent.y + Math.sin(angle) * def.radius,
      angle,
      health: def.health,
      alive: true,
      divideIn: def.divideEverySeconds * randomRange(this.rng, 0.8, 1.2),
      wanderIn: randomRange(this.rng, 0, def.wanderChangeSeconds),
    }
  }
}
