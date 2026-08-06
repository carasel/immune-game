import Phaser from 'phaser'
import { balance } from '../content/balance'
import { HUD_HEIGHT, WORLD } from '../content/levels'
import type { World } from '../sim/world'
import { font, palette, textColour } from './palette'

interface SpeedButton {
  speed: number
  box: Phaser.GameObjects.Rectangle
}

/**
 * The bar along the bottom: energy, how much tissue is left, the clock, and the
 * speed controls. Lives in its own scene so UI never fights the game camera.
 */
export class HudScene extends Phaser.Scene {
  private world!: World

  private energyText!: Phaser.GameObjects.Text
  private tissueText!: Phaser.GameObjects.Text
  private bacteriaText!: Phaser.GameObjects.Text
  private clockText!: Phaser.GameObjects.Text
  private energyBar!: Phaser.GameObjects.Graphics
  private lostBanner!: Phaser.GameObjects.Text
  private lostSubtitle!: Phaser.GameObjects.Text

  private speedButtons: SpeedButton[] = []

  private readonly top = WORLD.height - HUD_HEIGHT

  constructor() {
    super('hud')
  }

  create(): void {
    this.world = this.registry.get('world') as World

    this.add
      .rectangle(0, this.top, WORLD.width, HUD_HEIGHT, palette.hudPanel, 0.96)
      .setOrigin(0, 0)

    const midY = this.top + HUD_HEIGHT / 2

    this.energyText = this.add
      .text(16, midY, '', {
        fontFamily: font.family,
        fontSize: '16px',
        color: textColour.energy,
      })
      .setOrigin(0, 0.5)

    this.energyBar = this.add.graphics()

    this.tissueText = this.add
      .text(306, midY, '', {
        fontFamily: font.family,
        fontSize: '14px',
        color: textColour.bright,
      })
      .setOrigin(0, 0.5)

    this.bacteriaText = this.add
      .text(516, midY, '', {
        fontFamily: font.family,
        fontSize: '14px',
        color: textColour.bacteria,
      })
      .setOrigin(0, 0.5)

    // Far enough right that the readouts can't run underneath it, and still
    // clear of the speed buttons.
    this.clockText = this.add
      .text(632, midY, '', {
        fontFamily: font.family,
        fontSize: '14px',
        color: textColour.dim,
      })
      .setOrigin(0, 0.5)

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
    this.bindKeys()
    this.refresh()
  }

  update(): void {
    this.refresh()
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
    const perSecond = living * balance.incomePerBodyCellPerSecond

    this.tissueText.setText(`Body cells  ${living}/${total}   (+${perSecond.toFixed(1)}/sec)`)

    const bacteria = this.world.livingPathogenCount
    this.bacteriaText.setText(bacteria === 0 ? '' : `Bacteria  ${bacteria}`)

    this.clockText.setText(
      speed === 0 ? 'PAUSED' : `${formatClock(this.world.elapsedSeconds)}   ${speed}x`,
    )

    const lost = this.world.isLost
    this.lostBanner.setVisible(lost)
    this.lostSubtitle.setVisible(lost)
    if (lost) {
      this.lostSubtitle.setText(`the tissue held out for ${formatClock(this.world.lostAtSeconds)}`)
    }

    this.drawEnergyBar(economy.energy)

    for (const button of this.speedButtons) {
      const active = button.speed === speed
      button.box.setFillStyle(active ? palette.hudButtonActive : palette.hudButton)
    }
  }

  private drawEnergyBar(energy: number): void {
    const x = 150
    const y = this.top + HUD_HEIGHT / 2 - 4
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
