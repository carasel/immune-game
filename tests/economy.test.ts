import { describe, expect, it } from 'vitest'
import { balance } from '../src/content/balance'
import { Economy } from '../src/sim/economy'

describe('energy', () => {
  it('earns from every living body cell, every second', () => {
    const economy = new Economy(0)

    economy.addIncome(50, 1)

    expect(economy.energy).toBeCloseTo(50 * balance.incomePerBodyCellPerSecond)
    expect(economy.totalEarned).toBeCloseTo(economy.energy)
  })

  it('takes a one-off hit when a body cell dies', () => {
    const economy = new Economy(100)

    economy.chargeForBodyCellDeath()

    expect(economy.energy).toBe(100 - balance.energyLostWhenABodyCellDies)
    expect(economy.totalLostToDeaths).toBe(balance.energyLostWhenABodyCellDies)
  })

  it('charges upkeep by the second', () => {
    const economy = new Economy(100)

    economy.chargeUpkeep(0.4, 0.5)

    expect(economy.energy).toBeCloseTo(99.8)
    expect(economy.totalLostToUpkeep).toBeCloseTo(0.2)
  })

  it('stops at zero rather than going negative', () => {
    const economy = new Economy(10)

    economy.chargeForBodyCellDeath()
    economy.chargeUpkeep(100, 1)

    expect(economy.energy).toBe(0)
    expect(economy.isEmpty).toBe(true)
  })

  it('still counts what was lost after it floors at zero', () => {
    const economy = new Economy(5)

    economy.chargeForBodyCellDeath()

    // Only 5 was there to lose, but the death cost what it costs.
    expect(economy.energy).toBe(0)
    expect(economy.totalLostToDeaths).toBe(balance.energyLostWhenABodyCellDies)
  })

  it('refuses to spend what it does not have, and changes nothing', () => {
    const economy = new Economy(59)

    expect(economy.canAfford(60)).toBe(false)
    expect(economy.spend(60)).toBe(false)
    expect(economy.energy).toBe(59)
    expect(economy.totalSpent).toBe(0)
  })

  it('spends what it does have', () => {
    const economy = new Economy(60)

    expect(economy.spend(60)).toBe(true)
    expect(economy.energy).toBe(0)
    expect(economy.totalSpent).toBe(60)
  })
})
