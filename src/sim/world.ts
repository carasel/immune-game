import { balance } from '../content/balance'
import { findImmuneCell, type ImmuneCellDef } from '../content/cells'
import type { LevelDef, WaveDef } from '../content/levels'
import { findPathogen, type PathogenDef } from '../content/pathogens'
import { Economy } from './economy'
import { rectContains, type Size } from './geometry'
import {
  separateImmuneCells,
  updateImmuneCell,
  type ImmuneCell,
  type ImmuneCellContext,
} from './immuneCells'
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

/**
 * The two ways to lose a level.
 *
 * `tissue` — every body cell is dead. There is nothing left to defend.
 * `starvation` — no energy left, and the last immune cell has starved.
 */
export type LossReason = 'tissue' | 'starvation'

export class World {
  readonly level: LevelDef
  readonly bounds: Size

  /** Blood vessels — where your immune cells arrive. */
  readonly openings: EdgeRegion[]
  /** Wounds and surfaces — where the pathogens get in. */
  readonly entries: EdgeRegion[]

  readonly bodyCells: BodyCell[]
  readonly pathogens: Pathogen[] = []
  readonly immuneCells: ImmuneCell[] = []
  readonly economy: Economy

  tickCount = 0

  /** How long the tissue held out. Only meaningful once `isLost` is true. */
  lostAtSeconds = 0

  private lostTo: LossReason | null = null
  private readonly rng: Rng
  private nextPathogenId = 1
  private nextImmuneCellId = 1
  private nextWave = 0
  /** Counts down to the next starvation death while energy is at zero. */
  private starveIn = balance.starvationSecondsPerCell

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
    this.spawnStartingCells()
  }

  /**
   * Advance the world by exactly one tick.
   *
   * The order matters: earn first, then pay the upkeep, then see who starves.
   * Energy stops at zero, so "still zero once the bills are paid" is exactly
   * what "the tissue can't afford its immune cells" means. Charging upkeep
   * before the income arrives would nudge the total back above zero every
   * single tick, and nothing would ever starve.
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
    this.updateImmuneCells()
    this.starveImmuneCells()
    this.checkForLoss()
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

  get livingImmuneCellCount(): number {
    let count = 0
    for (const cell of this.immuneCells) {
      if (cell.alive) count++
    }
    return count
  }

  /** Dead body cells still waiting for a macrophage to clear them up. */
  get debrisCount(): number {
    let count = 0
    for (const cell of this.bodyCells) {
      if (cell.debris) count++
    }
    return count
  }

  /** How many of each immune cell type are alive, keyed by their def id. */
  get immuneCellCounts(): Map<string, number> {
    const counts = new Map<string, number>()

    for (const cell of this.immuneCells) {
      if (!cell.alive) continue
      counts.set(cell.defId, (counts.get(cell.defId) ?? 0) + 1)
    }

    return counts
  }

  get isLost(): boolean {
    return this.lostTo !== null
  }

  /** Which way it was lost, or null while it is still going. */
  get lossReason(): LossReason | null {
    return this.lostTo
  }

  /**
   * Two ways to lose.
   *
   * Losing the tissue is immediate and absolute: with every body cell dead
   * there is nothing left to defend and nothing left earning, so it is over
   * however much energy happens to be banked.
   *
   * Running out of energy is the slow one. Zero energy on its own is not the
   * end — the cells starve one at a time, so there is a panicky window where
   * killing something can still turn it around. See GAME_DESIGN.md section 2.
   */
  private checkForLoss(): void {
    if (this.isLost) return

    if (this.livingBodyCellCount === 0) {
      this.lostTo = 'tissue'
    } else if (this.economy.isEmpty && this.livingImmuneCellCount === 0) {
      this.lostTo = 'starvation'
    } else {
      return
    }

    this.lostAtSeconds = this.elapsedSeconds
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

  /**
   * The immune cells already on duty when the level starts. Cells you recruit
   * later arrive at a vessel opening instead and have to walk in.
   */
  private spawnStartingCells(): void {
    for (const garrison of this.level.startingCells) {
      const def = findImmuneCell(garrison.cell)
      if (!def) {
        console.error(
          `Level "${this.level.id}" starts with "${garrison.cell}", ` +
            'which is not a cell id in content/cells.ts.',
        )
        continue
      }

      for (let i = 0; i < garrison.count; i++) {
        this.addImmuneCell(def)
      }
    }
  }

  /** Drops a cell into the open channels between the blobs of tissue. */
  private addImmuneCell(def: ImmuneCellDef): void {
    const margin = def.radius + balance.edgeMargin

    let x = this.bounds.width / 2
    let y = this.bounds.height / 2

    // If the tissue is too packed to find a clear spot, the last guess gets used
    // anyway. Immune cells can squeeze through tissue, so a tight start is
    // survivable rather than broken.
    for (let attempt = 0; attempt < 400; attempt++) {
      x = randomRange(this.rng, margin, this.bounds.width - margin)
      y = randomRange(this.rng, margin, this.bounds.height - margin)
      if (this.isRoomForImmuneCell(def, x, y)) break
    }

    this.immuneCells.push({
      id: this.nextImmuneCellId++,
      defId: def.id,
      x,
      y,
      angle: this.rng() * Math.PI * 2,
      alive: true,
      ageSeconds: 0,
      wanderIn: randomRange(this.rng, 0, def.wanderChangeSeconds),
      meal: null,
    })
  }

  /** Clear of tissue, clear of other immune cells, and not sitting in a wound. */
  private isRoomForImmuneCell(def: ImmuneCellDef, x: number, y: number): boolean {
    for (const entry of this.entries) {
      if (rectContains(entry.corridor, x, y, def.radius)) return false
    }

    for (const bodyCell of this.bodyCells) {
      if (!bodyCell.alive) continue
      if (Math.hypot(bodyCell.x - x, bodyCell.y - y) < def.radius + bodyCell.radius) return false
    }

    for (const other of this.immuneCells) {
      if (!other.alive) continue
      const otherDef = findImmuneCell(other.defId)
      if (!otherDef) continue
      if (Math.hypot(other.x - x, other.y - y) < def.radius + otherDef.radius) return false
    }

    return true
  }

  private updateImmuneCells(): void {
    const context: ImmuneCellContext = {
      dt: SECONDS_PER_TICK,
      bodyCells: this.bodyCells,
      pathogens: this.pathogens,
      bounds: this.bounds,
      rng: this.rng,
      // Eating things is what pays for the whole immune system.
      onMealFinished: (_cell, meal) => this.economy.credit(meal.reward),
    }

    for (const cell of this.immuneCells) {
      if (!cell.alive) continue

      const def = findImmuneCell(cell.defId)
      if (!def) continue

      updateImmuneCell(cell, def, context)

      // Only living cells cost anything. A cell that died this tick doesn't.
      if (cell.alive) this.economy.chargeUpkeep(def.upkeepPerSecond, SECONDS_PER_TICK)
    }

    separateImmuneCells(this.immuneCells, this.bounds)
  }

  /**
   * At zero energy the tissue can't feed its immune cells, and they starve one
   * at a time with a few seconds between each. Visible, and slow enough that
   * clearing a bacterium can still save the rest of them.
   */
  private starveImmuneCells(): void {
    if (!this.economy.isEmpty) {
      this.starveIn = balance.starvationSecondsPerCell
      return
    }

    this.starveIn -= SECONDS_PER_TICK
    if (this.starveIn > 0) return

    this.starveIn = balance.starvationSecondsPerCell

    // The oldest one goes first.
    let oldest: ImmuneCell | undefined
    for (const cell of this.immuneCells) {
      if (!cell.alive) continue
      if (!oldest || cell.ageSeconds > oldest.ageSeconds) oldest = cell
    }

    if (oldest) oldest.alive = false
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
