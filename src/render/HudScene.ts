import Phaser from 'phaser'
import { balance } from '../content/balance'
import { findImmuneCell, immuneCells } from '../content/cells'
import { HUD_HEIGHT, WORLD } from '../content/levels'
import type { World } from '../sim/world'
import { font, immunePalette, palette, textColour } from './palette'

interface SpeedButton {
  speed: number
  box: Phaser.GameObjects.Rectangle
}

interface RecruitButton {
  defId: string
  cost: number
  box: Phaser.GameObjects.Rectangle
  label: Phaser.GameObjects.Text
  swatch: Phaser.GameObjects.Arc
}

/**
 * The bar along the bottom: energy, how much tissue is left, the clock, and the
 * speed controls. Lives in its own scene so UI never fights the game camera.
 */
export class HudScene extends Phaser.Scene {
  private world!: World

  private energyText!: Phaser.GameObjects.Text
  private incomeText!: Phaser.GameObjects.Text
  private tissueText!: Phaser.GameObjects.Text
  private immuneText!: Phaser.GameObjects.Text
  private bacteriaText!: Phaser.GameObjects.Text
  private clockText!: Phaser.GameObjects.Text
  private energyBar!: Phaser.GameObjects.Graphics
  private starvingWarning!: Phaser.GameObjects.Text
  private lostBanner!: Phaser.GameObjects.Text
  private lostSubtitle!: Phaser.GameObjects.Text

  private recruitHint!: Phaser.GameObjects.Text

  private speedButtons: SpeedButton[] = []
  private recruitButtons: RecruitButton[] = []

  private readonly top = WORLD.height - HUD_HEIGHT
  /** Two rows: readouts along the top, recruiting underneath. */
  private readonly readoutY = WORLD.height - HUD_HEIGHT + 22
  private readonly recruitY = WORLD.height - HUD_HEIGHT + 58

  constructor() {
    super('hud')
  }

  create(): void {
    this.world = this.registry.get('world') as World

    this.add
      .rectangle(0, this.top, WORLD.width, HUD_HEIGHT, palette.hudPanel, 0.96)
      .setOrigin(0, 0)

    const midY = this.readoutY
    const recruitY = this.recruitY

    this.energyText = this.add
      .text(16, midY, '', {
        fontFamily: font.family,
        fontSize: '16px',
        color: textColour.energy,
      })
      .setOrigin(0, 0.5)

    this.energyBar = this.add.graphics()

    // Income sits with the energy bar, because that's what it feeds.
    this.incomeText = this.add
      .text(292, midY, '', {
        fontFamily: font.family,
        fontSize: '13px',
        color: textColour.energy,
      })
      .setOrigin(0, 0.5)

    this.tissueText = this.add
      .text(368, midY, '', {
        fontFamily: font.family,
        fontSize: '13px',
        color: textColour.bright,
      })
      .setOrigin(0, 0.5)

    this.immuneText = this.add
      .text(492, midY, '', {
        fontFamily: font.family,
        fontSize: '13px',
        color: textColour.immune,
      })
      .setOrigin(0, 0.5)

    this.bacteriaText = this.add
      .text(602, midY, '', {
        fontFamily: font.family,
        fontSize: '13px',
        color: textColour.bacteria,
      })
      .setOrigin(0, 0.5)

    // Right-aligned, so it grows leftwards into empty space rather than sliding
    // underneath the speed buttons.
    this.clockText = this.add
      .text(742, midY, '', {
        fontFamily: font.family,
        fontSize: '13px',
        color: textColour.dim,
      })
      .setOrigin(1, 0.5)

    // Sits just above the HUD, blinking, because losing a macrophage with no
    // explanation looks like the game taking one off you.
    this.starvingWarning = this.add
      .text(WORLD.width / 2, this.top - 20, '', {
        fontFamily: font.family,
        fontSize: '17px',
        color: textColour.lost,
      })
      .setOrigin(0.5)
      .setVisible(false)

    this.lostBanner = this.add
      .text(WORLD.width / 2, this.top / 2, 'TISSUE LOST', {
        fontFamily: font.family,
        fontSize: '44px',
        color: textColour.lost,
      })
      .setOrigin(0.5)
      .setVisible(false)

    // How long it held out — the number to watch when balancing a level.
    this.lostSubtitle = this.add
      .text(WORLD.width / 2, this.top / 2 + 36, '', {
        fontFamily: font.family,
        fontSize: '16px',
        color: textColour.dim,
      })
      .setOrigin(0.5)
      .setVisible(false)

    this.buildSpeedButtons(midY)
    this.buildRecruitButtons(recruitY)
    this.bindKeys()
    this.refresh()
  }

  update(time: number): void {
    this.refresh()
    this.refreshStarvingWarning(time)
  }

  private buildSpeedButtons(midY: number): void {
    const width = 44
    const height = 26
    const gap = 6
    const speeds = balance.timeSpeeds

    const totalWidth = speeds.length * width + (speeds.length - 1) * gap
    let x = WORLD.width - totalWidth - 16 + width / 2

    for (const speed of speeds) {
      const box = this.add
        .rectangle(x, midY, width, height, palette.hudButton)
        .setInteractive({ useHandCursor: true })

      this.add
        .text(x, midY, labelForSpeed(speed), {
          fontFamily: font.family,
          fontSize: '13px',
          color: textColour.bright,
        })
        .setOrigin(0.5)

      box.on('pointerdown', () => this.setSpeed(speed))

      this.speedButtons.push({ speed, box })
      x += width + gap
    }
  }

  /**
   * One button per cell type in content/cells.ts, so adding the neutrophil adds
   * its button too. Clicking one only *starts* a recruit — the vessels then
   * light up on the map and the energy goes when you pick one.
   */
  private buildRecruitButtons(y: number): void {
    this.add
      .text(16, y, 'Recruit', {
        fontFamily: font.family,
        fontSize: '13px',
        color: textColour.dim,
      })
      .setOrigin(0, 0.5)

    const width = 172
    const gap = 8
    let x = 78

    for (const def of immuneCells) {
      const box = this.add
        .rectangle(x, y, width, 28, palette.hudButton)
        .setOrigin(0, 0.5)
        .setInteractive({ useHandCursor: true })

      // A dot in the cell's own colour, so the button and the thing it makes
      // are obviously the same thing.
      const swatch = this.add.circle(x + 18, y, 7, immunePalette[def.id]?.fill ?? palette.energyBar)

      const label = this.add
        .text(x + 34, y, `${def.name}   ${def.cost}`, {
          fontFamily: font.family,
          fontSize: '13px',
          color: textColour.bright,
        })
        .setOrigin(0, 0.5)

      box.on('pointerdown', () => this.toggleRecruit(def.id))

      this.recruitButtons.push({ defId: def.id, cost: def.cost, box, label, swatch })
      x += width + gap
    }

    this.recruitHint = this.add
      .text(x + 8, y, '', {
        fontFamily: font.family,
        fontSize: '13px',
        color: textColour.vessel,
      })
      .setOrigin(0, 0.5)
  }

  /** Clicking the button you are already recruiting with calls it off. */
  private toggleRecruit(defId: string): void {
    if (this.world.recruitingDefId === defId) this.world.cancelRecruit()
    else this.world.beginRecruit(defId)
  }

  private bindKeys(): void {
    const keyboard = this.input.keyboard
    if (!keyboard) return

    keyboard.on('keydown-SPACE', () => this.togglePause())

    balance.timeSpeeds.forEach((speed, index) => {
      keyboard.on(`keydown-${['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'][index] ?? 'ZERO'}`, () =>
        this.setSpeed(speed),
      )
    })
  }

  private setSpeed(speed: number): void {
    if (speed !== 0) this.registry.set('lastRunningSpeed', speed)
    this.registry.set('speed', speed)
  }

  private togglePause(): void {
    const current = (this.registry.get('speed') as number) ?? 1
    if (current === 0) {
      this.setSpeed((this.registry.get('lastRunningSpeed') as number) ?? 1)
    } else {
      this.setSpeed(0)
    }
  }

  private refresh(): void {
    const { economy } = this.world
    const speed = (this.registry.get('speed') as number) ?? 1

    this.energyText.setText(`Energy  ${Math.floor(economy.energy)}`)

    const living = this.world.livingBodyCellCount
    const total = this.world.bodyCells.length

    // What the tissue earns, minus what the immune cells cost to keep. Watching
    // this go negative is the clearest warning the game gives you.
    const perSecond = living * balance.incomePerBodyCellPerSecond - this.upkeepPerSecond
    const sign = perSecond < 0 ? '' : '+'

    this.incomeText.setText(`${sign}${perSecond.toFixed(1)}/sec`)
    this.incomeText.setColor(perSecond < 0 ? textColour.lost : textColour.energy)

    this.tissueText.setText(`Body cells  ${living}/${total}`)
    this.immuneText.setText(this.immuneSummary())

    const bacteria = this.world.livingPathogenCount
    this.bacteriaText.setText(bacteria === 0 ? '' : `Bacteria  ${bacteria}`)

    this.clockText.setText(
      speed === 0 ? 'PAUSED' : `${formatClock(this.world.elapsedSeconds)}   ${speed}x`,
    )

    const lost = this.world.isLost
    this.lostBanner.setVisible(lost)
    this.lostSubtitle.setVisible(lost)
    if (lost) {
      // Which way you lost matters: every body cell eaten is a different
      // failure from your last cell starving, and they should not read alike.
      const cause =
        this.world.lossReason === 'tissue'
          ? 'every body cell is dead'
          : 'your last immune cell starved'

      this.lostSubtitle.setText(
        `${cause} — it held out for ${formatClock(this.world.lostAtSeconds)}`,
      )
    }

    this.drawEnergyBar(economy.energy)

    for (const button of this.speedButtons) {
      const active = button.speed === speed
      button.box.setFillStyle(active ? palette.hudButtonActive : palette.hudButton)
    }

    this.refreshRecruitButtons()
  }

  /**
   * A button you can't afford says so by going dim, rather than by doing
   * nothing when you press it.
   */
  private refreshRecruitButtons(): void {
    const recruiting = this.world.recruitingDefId

    for (const button of this.recruitButtons) {
      const affordable = this.world.economy.canAfford(button.cost)
      const active = recruiting === button.defId

      button.box.setFillStyle(active ? palette.hudButtonActive : palette.hudButton)
      button.box.setAlpha(affordable || active ? 1 : 0.4)
      button.label.setAlpha(affordable || active ? 1 : 0.45)
      button.swatch.setAlpha(affordable || active ? 1 : 0.45)
    }

    const def = recruiting ? findImmuneCell(recruiting) : undefined
    this.recruitHint.setText(def ? `click a vessel to send the ${def.name.toLowerCase()} in` : '')
  }

  /**
   * Out of energy, with cells still to lose. Blinks, and counts down to the
   * next one, so it is obvious both that they are dying and that stopping it is
   * still possible — killing one bacterium can pay for them again.
   */
  private refreshStarvingWarning(time: number): void {
    const starving = this.world.isStarving && !this.world.isLost
    this.starvingWarning.setVisible(starving)
    if (!starving) return

    const next = Math.ceil(this.world.secondsToNextStarvation)
    this.starvingWarning.setText(
      `OUT OF ENERGY — your cells are starving. Next one dies in ${next}s`,
    )
    this.starvingWarning.setAlpha(0.55 + 0.45 * Math.sin(time / 140))
  }

  /** "Macrophages  2", and one entry per type once there are more of them. */
  private immuneSummary(): string {
    const parts: string[] = []

    for (const [defId, count] of this.world.immuneCellCounts) {
      const def = findImmuneCell(defId)
      parts.push(`${def ? def.name : defId}s  ${count}`)
    }

    return parts.join('   ')
  }

  private get upkeepPerSecond(): number {
    let total = 0

    for (const [defId, count] of this.world.immuneCellCounts) {
      const def = findImmuneCell(defId)
      if (def) total += def.upkeepPerSecond * count
    }

    return total
  }

  private drawEnergyBar(energy: number): void {
    const x = 150
    const y = this.readoutY - 4
    const width = 132
    const height = 8

    const fraction = Phaser.Math.Clamp(energy / balance.energyBarDisplayMax, 0, 1)

    this.energyBar.clear()
    this.energyBar.fillStyle(palette.energyBarTrack, 1)
    this.energyBar.fillRoundedRect(x, y, width, height, 4)
    if (fraction > 0) {
      this.energyBar.fillStyle(palette.energyBar, 1)
      this.energyBar.fillRoundedRect(x, y, Math.max(width * fraction, 4), height, 4)
    }
  }
}

function labelForSpeed(speed: number): string {
  if (speed === 0) return '||'
  return `${speed}x`
}

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.floor(totalSeconds % 60)
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
