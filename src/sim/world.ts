import { balance } from '../content/balance'
import { findImmuneCell, type ImmuneCellDef } from '../content/cells'
import type { LevelDef, WaveDef } from '../content/levels'
import { findPathogen, type PathogenDef } from '../content/pathogens'
import { Economy } from './economy'
import { clamp, distance, rectContains, type Size, type Vec2 } from './geometry'
import { updateGranule, type Granule } from './granules'
import { bodyCellsUnder, updateNet, type Net } from './nets'
import {
  killImmuneCell,
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

/**
 * How close a click has to be to count as hitting something small. A bacterium
 * is only 10 across, and a 9-year-old with a mouse should not have to be
 * pixel-perfect to send a cell after one.
 */
const MINIMUM_CLICK_RADIUS = 16

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
  /** Poison in flight, thrown by neutrophils. */
  readonly granules: Granule[] = []
  /** Webs on the ground, left by neutrophils that tore themselves apart. */
  readonly nets: Net[] = []
  readonly economy: Economy

  tickCount = 0

  /** How long the tissue held out. Only meaningful once `isLost` is true. */
  lostAtSeconds = 0
  /** How long clearing the infection took. Only meaningful once `isWon`. */
  wonAtSeconds = 0

  private lostTo: LossReason | null = null
  private won = false
  /** Which immune cell the player has clicked on, if any. */
  private selectedId: number | null = null
  /**
   * The cell type the player has asked for but not yet placed. Recruiting is
   * two steps — pick the cell, then pick the vessel it walks in through — and
   * the energy is not spent until the second one.
   */
  private pendingRecruit: string | null = null
  private readonly rng: Rng
  private nextPathogenId = 1
  private nextImmuneCellId = 1
  private nextGranuleId = 1
  private nextNetId = 1
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
   * Neither winning nor losing stops the simulation — after a loss the bacteria
   * carry on and finish the tissue off, which is worth watching and worth
   * knowing when balancing. The outcome is latched instead, so energy climbing
   * back above zero afterwards doesn't undo it.
   */
  step(): void {
    this.tickCount++
    this.releaseDueWaves()
    // Before the pathogens, so anything held in a web is held this tick too.
    this.updateNets()
    this.updatePathogens()
    this.economy.addIncome(this.livingBodyCellCount, SECONDS_PER_TICK)
    this.updateImmuneCells()
    this.updateGranules()
    this.starveImmuneCells()
    this.checkForOutcome()
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

  get isWon(): boolean {
    return this.won
  }

  /** True once the level is decided, either way. */
  get isOver(): boolean {
    return this.isLost || this.won
  }

  /**
   * Has every wave the level had arrived? Until they all have, killing the last
   * bacterium on screen is a lull, not a victory.
   */
  get allWavesReleased(): boolean {
    return this.nextWave >= this.level.waves.length
  }

  /**
   * How the level ends. It is decided once and then latched, so the simulation
   * can carry on running afterwards without the answer changing.
   *
   * Losing the tissue is immediate and absolute: with every body cell dead
   * there is nothing left to defend and nothing left earning, so it is over
   * however much energy happens to be banked.
   *
   * Running out of energy is the slow one. Zero energy on its own is not the
   * end — the cells starve one at a time, so there is a panicky window where
   * killing something can still turn it around. See GAME_DESIGN.md section 2.
   *
   * Winning is the other side of it: every wave has arrived, and you killed
   * everything that came. Losing is checked first, because tissue with nothing
   * left alive in it has not been saved by the infection also being over.
   */
  private checkForOutcome(): void {
    if (this.isOver) return

    if (this.livingBodyCellCount === 0) {
      this.lostTo = 'tissue'
    } else if (this.economy.isEmpty && this.livingImmuneCellCount === 0) {
      this.lostTo = 'starvation'
    }

    if (this.isLost) {
      this.lostAtSeconds = this.elapsedSeconds
      return
    }

    // `nextWave > 0` means at least one wave actually turned up: a level with
    // no waves at all has no infection to clear, so it cannot be won.
    if (this.nextWave > 0 && this.allWavesReleased && this.livingPathogenCount === 0) {
      this.won = true
      this.wonAtSeconds = this.elapsedSeconds
    }
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
   * The cell the player has selected, or null. A cell that dies while selected
   * stops being selected, which is why this is looked up rather than held.
   */
  get selectedImmuneCell(): ImmuneCell | null {
    if (this.selectedId === null) return null

    const cell = this.immuneCells.find((candidate) => candidate.id === this.selectedId)
    return cell && cell.alive ? cell : null
  }

  /**
   * Selects the immune cell under a point and returns it, or returns null and
   * changes nothing if the click missed every cell. The caller can treat null
   * as "they clicked the ground".
   */
  selectImmuneCellAt(x: number, y: number): ImmuneCell | null {
    const cell = this.immuneCellAt(x, y)
    if (cell) this.selectedId = cell.id
    return cell
  }

  /** The immune cell under a point, without selecting it. */
  private immuneCellAt(x: number, y: number): ImmuneCell | null {
    let best: ImmuneCell | null = null
    let bestDistance = Number.POSITIVE_INFINITY

    for (const cell of this.immuneCells) {
      if (!cell.alive) continue

      const def = findImmuneCell(cell.defId)
      if (!def) continue

      // Overlapping cells: the one whose middle is nearest wins.
      const away = distance(cell.x, cell.y, x, y)
      if (away > def.radius || away >= bestDistance) continue

      best = cell
      bestDistance = away
    }

    return best
  }

  clearSelection(): void {
    this.selectedId = null
  }

  /**
   * Sends the selected cell to a point. It walks there ignoring bacteria and
   * debris on the way, then goes back to hunting on its own.
   *
   * Returns false if nothing is selected, so a click on empty ground with no
   * cell picked up does nothing at all.
   */
  orderSelectedTo(x: number, y: number): boolean {
    const cell = this.selectedImmuneCell
    if (!cell) return false

    const def = findImmuneCell(cell.defId)
    if (!def) return false

    // A destination that isn't a real place would send the cell to NaN and it
    // would never be seen again. Refuse it here rather than trust every caller.
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false

    // Keep the destination somewhere the cell can actually stand.
    cell.order = {
      kind: 'move',
      x: clamp(x, def.radius, this.bounds.width - def.radius),
      y: clamp(y, def.radius, this.bounds.height - def.radius),
    }

    return true
  }

  /**
   * Sends the selected cell after one particular pathogen. It goes for that one
   * and nothing else until it is dead, walking past easier targets on the way —
   * which is the whole point of being able to pick one.
   *
   * Returns false if nothing is selected or that pathogen is already dead.
   */
  orderSelectedToChase(pathogenId: number): boolean {
    const cell = this.selectedImmuneCell
    if (!cell) return false

    const quarry = this.pathogens.find((pathogen) => pathogen.id === pathogenId)
    if (!quarry || !quarry.alive) return false

    cell.order = { kind: 'chase', pathogenId }
    return true
  }

  /**
   * The pathogen under a point, if there is one. Bacteria are small, so the
   * click is given a bit of slack — missing a bacterium you clearly aimed at
   * is worse than occasionally catching one you didn't.
   */
  pathogenAt(x: number, y: number): Pathogen | null {
    let best: Pathogen | null = null
    let bestDistance = Number.POSITIVE_INFINITY

    for (const pathogen of this.pathogens) {
      if (!pathogen.alive) continue

      const def = findPathogen(pathogen.defId)
      if (!def) continue

      const reach = Math.max(def.radius, MINIMUM_CLICK_RADIUS)
      const away = distance(pathogen.x, pathogen.y, x, y)
      if (away > reach || away >= bestDistance) continue

      best = pathogen
      bestDistance = away
    }

    return best
  }

  /** The cell type waiting to be placed at a vessel, or null. */
  get recruitingDefId(): string | null {
    return this.pendingRecruit
  }

  /**
   * Step one of recruiting: pick what you want. Nothing is charged yet — the
   * energy goes when you pick the vessel, so changing your mind is free.
   *
   * Returns false if you can't afford it, which is also why the check is here
   * and not only on the button.
   */
  beginRecruit(defId: string): boolean {
    const def = findImmuneCell(defId)
    if (!def || !this.economy.canAfford(def.cost)) return false

    this.pendingRecruit = defId
    return true
  }

  cancelRecruit(): void {
    this.pendingRecruit = null
  }

  /**
   * Step two: the vessel it walks in through. This is where the energy goes.
   *
   * Recruits are not placed where you want them — they arrive at the mouth of a
   * blood vessel and walk to the fight themselves, which is what extravasation
   * really is and what makes a far-off corner expensive to defend.
   *
   * Returns the new cell, or null if the recruit fell through (nothing pending,
   * unknown vessel, or the energy went while you were deciding).
   */
  recruitAt(openingId: string): ImmuneCell | null {
    if (!this.pendingRecruit) return null

    const def = findImmuneCell(this.pendingRecruit)
    const opening = this.openings.find((candidate) => candidate.id === openingId)
    if (!def || !opening) return null

    if (!this.economy.spend(def.cost)) {
      // Went broke between choosing the cell and choosing the vessel.
      this.pendingRecruit = null
      return null
    }

    this.pendingRecruit = null

    // Spread across the mouth, so several recruits don't land in a stack.
    const acrossX = -opening.inward.y
    const acrossY = opening.inward.x
    const offset = randomRange(this.rng, -opening.width * 0.3, opening.width * 0.3)

    return this.createImmuneCell(
      def,
      opening.innerPoint.x + acrossX * offset,
      opening.innerPoint.y + acrossY * offset,
      Math.atan2(opening.inward.y, opening.inward.x),
    )
  }

  /** The vessel under a point, if there is one. Used for placing a recruit. */
  openingAt(x: number, y: number): EdgeRegion | null {
    for (const opening of this.openings) {
      if (rectContains(opening.corridor, x, y)) return opening
    }

    return null
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

      // Positions in the level are fractions of the area, like the blobs are.
      const at = garrison.at
        ? { x: garrison.at.x * this.bounds.width, y: garrison.at.y * this.bounds.height }
        : undefined

      for (let i = 0; i < garrison.count; i++) {
        this.addImmuneCell(def, at)
      }
    }
  }

  /**
   * Drops a cell into the open channels between the blobs of tissue: at `at` if
   * the level asked for somewhere particular, otherwise anywhere there is room.
   */
  private addImmuneCell(def: ImmuneCellDef, at?: Vec2): void {
    const margin = def.radius + balance.edgeMargin
    const insideX = (value: number) => clamp(value, margin, this.bounds.width - margin)
    const insideY = (value: number) => clamp(value, margin, this.bounds.height - margin)

    // Hand-placed cells try their spot first; scattered ones start from a guess,
    // never from the middle of the map.
    let x = at ? insideX(at.x) : randomRange(this.rng, margin, this.bounds.width - margin)
    let y = at ? insideY(at.y) : randomRange(this.rng, margin, this.bounds.height - margin)

    // If the tissue is too packed to find a clear spot, the last guess gets used
    // anyway. Immune cells can squeeze through tissue, so a tight start is
    // survivable rather than broken.
    for (let attempt = 0; attempt < 400 && !this.isRoomForImmuneCell(def, x, y); attempt++) {
      if (at) {
        // Hand-placed: stay near where the level asked for, searching a little
        // wider each try, so several cells at one spot end up side by side.
        const spread = def.radius * (1 + attempt / 10)
        x = insideX(at.x + randomRange(this.rng, -spread, spread))
        y = insideY(at.y + randomRange(this.rng, -spread, spread))
      } else {
        x = randomRange(this.rng, margin, this.bounds.width - margin)
        y = randomRange(this.rng, margin, this.bounds.height - margin)
      }
    }

    this.createImmuneCell(def, x, y, this.rng() * Math.PI * 2)
  }

  /** Makes a cell and puts it in the world. Everything else goes through here. */
  private createImmuneCell(
    def: ImmuneCellDef,
    x: number,
    y: number,
    angle: number,
  ): ImmuneCell {
    const cell: ImmuneCell = {
      id: this.nextImmuneCellId++,
      defId: def.id,
      // Never outside the world, however it got placed.
      x: clamp(x, def.radius, this.bounds.width - def.radius),
      y: clamp(y, def.radius, this.bounds.height - def.radius),
      angle,
      alive: true,
      ageSeconds: 0,
      wanderIn: randomRange(this.rng, 0, def.wanderChangeSeconds),
      // Loaded from the moment it arrives.
      fireIn: 0,
      meal: null,
      order: null,
      diedAtSeconds: null,
    }

    this.immuneCells.push(cell)
    return cell
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
      elapsedSeconds: this.elapsedSeconds,
      bodyCells: this.bodyCells,
      pathogens: this.pathogens,
      bounds: this.bounds,
      rng: this.rng,
      // Eating things is what pays for the whole immune system.
      onMealFinished: (_cell, meal) => this.economy.credit(meal.reward),
      onGranuleThrown: (cell, def, angle) => this.throwGranule(cell, def, angle),
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
   * Orders one cell to tear itself apart and throw a web out over everything
   * around it. The cell dies — that is not a side effect, it is how a NET is
   * made — and the tissue underneath takes the damage there and then.
   *
   * Returns false if there is no such living cell, or it is not the sort of
   * cell that can do this. Macrophages cannot.
   */
  formNetFrom(cellId: number): boolean {
    const cell = this.immuneCells.find((candidate) => candidate.id === cellId)
    if (!cell || !cell.alive) return false

    const def = findImmuneCell(cell.defId)
    if (!def?.net) return false

    const net: Net = {
      id: this.nextNetId++,
      x: cell.x,
      y: cell.y,
      radius: def.net.radius,
      secondsLeft: def.net.durationSeconds,
      totalSeconds: def.net.durationSeconds,
      damagePerSecondToPathogens: def.net.damagePerSecondToPathogens,
      alive: true,
    }

    // What the web lands on, it smothers — once, as it falls.
    for (const bodyCell of bodyCellsUnder(net, this.bodyCells)) {
      bodyCell.health -= def.net.damageToBodyCells
      if (bodyCell.health > 0) continue

      bodyCell.health = 0
      bodyCell.alive = false
      bodyCell.debris = true
      this.economy.chargeForBodyCellDeath()
    }

    this.nets.push(net)
    killImmuneCell(cell, this.elapsedSeconds)

    // A cell that has just killed itself should not stay selected.
    if (this.selectedId === cell.id) this.selectedId = null

    return true
  }

  private updateNets(): void {
    if (this.nets.length === 0) return

    const context = { dt: SECONDS_PER_TICK, pathogens: this.pathogens }

    for (const net of this.nets) {
      if (net.alive) updateNet(net, context)
    }

    if (this.nets.some((net) => !net.alive)) {
      const standing = this.nets.filter((net) => net.alive)
      this.nets.length = 0
      this.nets.push(...standing)
    }
  }

  /**
   * A granule leaves the edge of the cell that threw it rather than its middle,
   * so it doesn't look like it comes out of nowhere.
   */
  private throwGranule(cell: ImmuneCell, def: ImmuneCellDef, angle: number): void {
    if (!def.granules) return

    this.granules.push({
      id: this.nextGranuleId++,
      x: cell.x + Math.cos(angle) * def.radius,
      y: cell.y + Math.sin(angle) * def.radius,
      angle,
      speed: def.granules.speed,
      rangeLeft: def.granules.range,
      damageToPathogens: def.granules.damageToPathogens,
      damageToBodyCells: def.granules.damageToBodyCells,
      alive: true,
    })
  }

  private updateGranules(): void {
    if (this.granules.length === 0) return

    const context = {
      dt: SECONDS_PER_TICK,
      bodyCells: this.bodyCells,
      pathogens: this.pathogens,
      bounds: this.bounds,
      onBodyCellDied: () => this.economy.chargeForBodyCellDeath(),
    }

    for (const granule of this.granules) {
      if (granule.alive) updateGranule(granule, context)
    }

    // Spent granules are dropped rather than piling up for the whole level.
    const spent = this.granules.findIndex((granule) => !granule.alive)
    if (spent !== -1) {
      const flying = this.granules.filter((granule) => granule.alive)
      this.granules.length = 0
      this.granules.push(...flying)
    }
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

    // Whoever has the least life left in them goes first: a neutrophil with
    // seconds to live before a macrophage that would have lasted for months.
    // Both accurate — neutrophils are the disposable ones, made and replaced by
    // the billion — and kinder, since it costs you the cheap cell first.
    let weakest: ImmuneCell | undefined
    let leastLeft = Number.POSITIVE_INFINITY
    let oldestAge = -1

    for (const cell of this.immuneCells) {
      if (!cell.alive) continue

      const def = findImmuneCell(cell.defId)
      if (!def) continue

      const lifeLeft =
        def.lifespanSeconds === undefined
          ? Number.POSITIVE_INFINITY
          : def.lifespanSeconds - cell.ageSeconds

      // Between cells that would both have lived for ever, the oldest goes.
      const weaker = lifeLeft < leastLeft || (lifeLeft === leastLeft && cell.ageSeconds > oldestAge)
      if (!weaker) continue

      weakest = cell
      leastLeft = lifeLeft
      oldestAge = cell.ageSeconds
    }

    if (weakest) killImmuneCell(weakest, this.elapsedSeconds)
  }

  /**
   * True while the energy is gone and there are still cells to lose. The HUD
   * shouts about this: a cell starving to death with no warning reads as the
   * game losing one of your macrophages, not as a consequence of going broke.
   */
  get isStarving(): boolean {
    return this.economy.isEmpty && this.livingImmuneCellCount > 0
  }

  /** Seconds until the next cell starves, while `isStarving`. */
  get secondsToNextStarvation(): number {
    return Math.max(0, this.starveIn)
  }

  private updatePathogens(): void {
    const context = {
      dt: SECONDS_PER_TICK,
      bodyCells: this.bodyCells,
      bounds: this.bounds,
      rng: this.rng,
      nets: this.nets,
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
