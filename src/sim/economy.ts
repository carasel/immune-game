import { balance } from '../content/balance'

/**
 * Energy: the player's money and their health at the same time.
 *
 * Income comes from living body cells. The main drain is body cells dying.
 * Immune cell upkeep and inflammation will plug in here later.
 */
export class Economy {
  energy: number

  /** Totals, for the end-of-level screen and for balancing. */
  totalEarned = 0
  totalSpent = 0
  totalLostToDeaths = 0

  constructor(startingEnergy: number = balance.startingEnergy) {
    this.energy = startingEnergy
  }

  /** Called every tick. */
  addIncome(livingBodyCells: number, seconds: number): void {
    const amount = livingBodyCells * balance.incomePerBodyCellPerSecond * seconds
    this.energy += amount
    this.totalEarned += amount
  }

  /** The big drain. Called once per body cell death. */
  chargeForBodyCellDeath(): void {
    this.energy -= balance.energyLostWhenABodyCellDies
    this.totalLostToDeaths += balance.energyLostWhenABodyCellDies
  }

  canAfford(cost: number): boolean {
    return this.energy >= cost
  }

  /** Returns false and changes nothing if there isn't enough energy. */
  spend(cost: number): boolean {
    if (!this.canAfford(cost)) return false
    this.energy -= cost
    this.totalSpent += cost
    return true
  }

  /** Macrophages eating things, mostly. */
  credit(amount: number): void {
    this.energy += amount
    this.totalEarned += amount
  }

  /** True once the tissue can no longer pay for itself. Starvation begins. */
  get isEmpty(): boolean {
    return this.energy <= 0
  }
}
