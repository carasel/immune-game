import Phaser from 'phaser'
import { balance } from '../content/balance'
import { findImmuneCell, immuneCells } from '../content/cells'
import { HUD_HEIGHT, WORLD } from '../content/levels'
import type { World } from '../sim/world'
import { drawBacteriumIcon, drawBodyCellIcon, drawEnergyIcon, drawImmuneCellIcon } from './icons'
import { font, immunePalette, palette, textColour } from './palette'

interface SpeedButton {
  speed: number
  box: Phaser.GameObjects.Rectangle
}

interface RecruitRow {
  defId: string
  cost: number
  row: Phaser.GameObjects.Rectangle
  label: Phaser.GameObjects.Text
}

/** Left of the speed buttons, which are pinned to the right-hand end. */
const RECRUIT_BUTTON_X = 700

/** Where the immune cell counts start, and how far apart their slots sit. */
const IMMUNE_READOUT_X = 410
const IMMUNE_READOUT_STEP = 56

/** Phaser wants 0xRRGGBB for shapes and '#rrggbb' for text. */
function hexColour(colour: number | undefined): string {
  return colour === undefined ? textColour.bright : `#${colour.toString(16).padStart(6, '0')}`
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
  /** One count per immune cell type, keyed by its def id. */
  private immuneTexts = new Map<string, Phaser.GameObjects.Text>()
  private bacteriaText!: Phaser.GameObjects.Text
  private clockText!: Phaser.GameObjects.Text
  private energyBar!: Phaser.GameObjects.Graphics
  private starvingWarning!: Phaser.GameObjects.Text
  private lostBanner!: Phaser.GameObjects.Text
  private lostSubtitle!: Phaser.GameObjects.Text

  private recruitHint!: Phaser.GameObjects.Text
  private recruitButton!: Phaser.GameObjects.Rectangle
  private recruitMenu!: Phaser.GameObjects.Container
  private menuBounds!: Phaser.Geom.Rectangle

  private speedButtons: SpeedButton[] = []
  private recruitRows: RecruitRow[] = []

  private readonly top = WORLD.height - HUD_HEIGHT
  private readonly readoutY = WORLD.height - HUD_HEIGHT / 2

  constructor() {
    super('hud')
  }

  create(): void {
    this.world = this.registry.get('world') as World

    this.add
      .rectangle(0, this.top, WORLD.width, HUD_HEIGHT, palette.hudPanel, 0.96)
      .setOrigin(0, 0)

    const midY = this.readoutY

    // Icons are drawn once — they never change. Only the numbers beside them do.
    const icons = this.add.graphics()

    drawEnergyIcon(icons, 24, midY, 11)
    this.energyText = this.add
      .text(40, midY, '', {
        fontFamily: font.family,
        fontSize: '16px',
        color: textColour.energy,
      })
      .setOrigin(0, 0.5)

    this.energyBar = this.add.graphics()

    // Income sits with the energy bar, because that's what it feeds.
    this.incomeText = this.add
      .text(240, midY, '', {
        fontFamily: font.family,
        fontSize: '13px',
        color: textColour.energy,
      })
      .setOrigin(0, 0.5)

    drawBodyCellIcon(icons, 330, midY, 9)
    this.tissueText = this.add
      .text(344, midY, '', {
        fontFamily: font.family,
        fontSize: '13px',
        color: textColour.bright,
      })
      .setOrigin(0, 0.5)

    // One slot per cell type, so a new cell in content/cells.ts gets a readout
    // without anything here changing. Three types would want a wider gap or a
    // smaller step; two fit comfortably.
    immuneCells.forEach((def, index) => {
      const x = IMMUNE_READOUT_X + index * IMMUNE_READOUT_STEP

      drawImmuneCellIcon(icons, x, midY, def.radius >= 20 ? 10 : 9, def)

      this.immuneTexts.set(
        def.id,
        this.add
          .text(x + 16, midY, '', {
            fontFamily: font.family,
            fontSize: '13px',
            color: hexColour(immunePalette[def.id]?.fill),
          })
          .setOrigin(0, 0.5),
      )
    })

    const bacteriaX = IMMUNE_READOUT_X + immuneCells.length * IMMUNE_READOUT_STEP + 4
    drawBacteriumIcon(icons, bacteriaX, midY, 10)
    this.bacteriaText = this.add
      .text(bacteriaX + 18, midY, '', {
        fontFamily: font.family,
        fontSize: '13px',
        color: textColour.bacteria,
      })
      .setOrigin(0, 0.5)

    // Right-aligned, so it grows leftwards into empty space rather than sliding
    // underneath the buttons.
    this.clockText = this.add
      .text(660, midY, '', {
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
    this.buildRecruitButton(midY)
    this.buildRecruitMenu()
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
   * One "+" button. The names and costs live in the menu it opens, where there
   * is room for words, which is what keeps this bar down to a single line.
   */
  private buildRecruitButton(y: number): void {
    this.recruitButton = this.add
      .rectangle(RECRUIT_BUTTON_X, y, 52, 26, palette.hudButton)
      .setInteractive({ useHandCursor: true })

    this.add
      .text(RECRUIT_BUTTON_X, y, '+', {
        fontFamily: font.family,
        fontSize: '18px',
        color: textColour.bright,
      })
      .setOrigin(0.5)

    this.recruitButton.on('pointerdown', () => this.toggleMenu())

    // Just above the bar, right-aligned to the button that raised it.
    this.recruitHint = this.add
      .text(RECRUIT_BUTTON_X + 26, y - 26, '', {
        fontFamily: font.family,
        fontSize: '13px',
        color: textColour.vessel,
      })
      .setOrigin(1, 0.5)
  }

  /**
   * The floating menu: one row per cell type in content/cells.ts, so adding the
   * neutrophil adds its row too. Picking a row only *starts* a recruit — the
   * vessels then light up on the map, and the energy goes when you pick one.
   */
  private buildRecruitMenu(): void {
    const rowHeight = 34
    const width = 210
    const padding = 8

    const height = padding * 2 + immuneCells.length * rowHeight
    const left = RECRUIT_BUTTON_X + 26 - width
    const bottom = this.top - 10

    this.recruitMenu = this.add.container(0, 0).setVisible(false)
    this.menuBounds = new Phaser.Geom.Rectangle(left, bottom - height, width, height)

    const panel = this.add
      .rectangle(left, bottom - height, width, height, palette.hudPanel, 0.98)
      .setOrigin(0, 0)
      .setStrokeStyle(1, palette.hudButtonActive, 0.6)
    this.recruitMenu.add(panel)

    const icons = this.add.graphics()
    this.recruitMenu.add(icons)

    immuneCells.forEach((def, index) => {
      const y = bottom - height + padding + rowHeight * index + rowHeight / 2

      const row = this.add
        .rectangle(left + padding, y, width - padding * 2, rowHeight - 4, palette.hudButton, 0)
        .setOrigin(0, 0.5)
        .setInteractive({ useHandCursor: true })

      // The same picture as the HUD readout and the cell on the map.
      drawImmuneCellIcon(icons, left + padding + 20, y, def.radius >= 20 ? 11 : 9, def)

      const label = this.add
        .text(left + padding + 42, y, def.name, {
          fontFamily: font.family,
          fontSize: '14px',
          color: textColour.bright,
        })
        .setOrigin(0, 0.5)

      const cost = this.add
        .text(left + width - padding - 10, y, `${def.cost}`, {
          fontFamily: font.family,
          fontSize: '14px',
          color: textColour.energy,
        })
        .setOrigin(1, 0.5)

      row.on('pointerdown', () => {
        this.world.beginRecruit(def.id)
        this.setMenuOpen(false)
      })

      this.recruitMenu.add([row, label, cost])
      this.recruitRows.push({ defId: def.id, cost: def.cost, row, label })
    })
  }

  /** Opens the menu, or shuts it — and calls off any recruit you'd started. */
  private toggleMenu(): void {
    if (this.recruitMenu.visible) {
      this.setMenuOpen(false)
      return
    }

    this.world.cancelRecruit()
    this.setMenuOpen(true)
  }

  /**
   * The level scene needs to know, so that a click landing on the menu doesn't
   * also order a macrophage about underneath it.
   */
  private setMenuOpen(open: boolean): void {
    this.recruitMenu.setVisible(open)
    this.registry.set('recruitMenuOpen', open)
  }

  private bindKeys(): void {
    // Clicking anywhere that isn't the menu shuts it. The level scene ignores
    // clicks while it is open, so this can't also move a macrophage.
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.recruitMenu.visible) return
      if (this.menuBounds.contains(pointer.x, pointer.y)) return
      if (this.recruitButton.getBounds().contains(pointer.x, pointer.y)) return

      this.setMenuOpen(false)
    })

    const keyboard = this.input.keyboard
    if (!keyboard) return

    keyboard.on('keydown-SPACE', () => this.togglePause())
    keyboard.on('keydown-ESC', () => this.setMenuOpen(false))

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

    // The pictures say what each number is, so the numbers stand alone.
    this.energyText.setText(`${Math.floor(economy.energy)}`)

    const living = this.world.livingBodyCellCount
    const total = this.world.bodyCells.length

    // What the tissue earns, minus what the immune cells cost to keep. Watching
    // this go negative is the clearest warning the game gives you.
    const perSecond = living * balance.incomePerBodyCellPerSecond - this.upkeepPerSecond
    const sign = perSecond < 0 ? '' : '+'

    this.incomeText.setText(`${sign}${perSecond.toFixed(1)}/sec`)
    this.incomeText.setColor(perSecond < 0 ? textColour.lost : textColour.energy)

    this.tissueText.setText(`${living}/${total}`)

    const counts = this.world.immuneCellCounts
    for (const [defId, text] of this.immuneTexts) {
      text.setText(`${counts.get(defId) ?? 0}`)
    }

    const bacteria = this.world.livingPathogenCount
    this.bacteriaText.setText(bacteria === 0 ? '—' : `${bacteria}`)

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
   * A row you can't afford says so by going dim, rather than by doing nothing
   * when you press it.
   */
  private refreshRecruitButtons(): void {
    const recruiting = this.world.recruitingDefId

    for (const entry of this.recruitRows) {
      const affordable = this.world.economy.canAfford(entry.cost)
      entry.row.setFillStyle(palette.hudButton, affordable ? 0.55 : 0.2)
      entry.label.setAlpha(affordable ? 1 : 0.45)
    }

    // The + lights up while a recruit is waiting for a vessel, so it is obvious
    // the game is asking you for something.
    this.recruitButton.setFillStyle(
      recruiting || this.recruitMenu.visible ? palette.hudButtonActive : palette.hudButton,
    )

    const def = recruiting ? findImmuneCell(recruiting) : undefined
    this.recruitHint.setText(def ? `click a vessel to send the ${def.name.toLowerCase()} in` : '')
    this.recruitHint.setVisible(def !== undefined)
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

  private get upkeepPerSecond(): number {
    let total = 0

    for (const [defId, count] of this.world.immuneCellCounts) {
      const def = findImmuneCell(defId)
      if (def) total += def.upkeepPerSecond * count
    }

    return total
  }

  private drawEnergyBar(energy: number): void {
    const x = 96
    const y = this.readoutY - 4
    const width = 120
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
