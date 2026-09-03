import Phaser from 'phaser'
import { levels, TISSUE_VIEW, WORLD, type LevelDef } from '../content/levels'
import { World } from '../sim/world'
import { drawLevelMap } from './levelMap'
import { font, palette, textColour } from './palette'

/** One card per level, laid out across the screen. */
const CARD = { width: 264, height: 288, gap: 24 }
const MAP = { inset: 12, height: 132 }

/**
 * The level select. Lists whatever is in `content/levels.ts`, so a new level
 * appears here the moment it exists — there is nothing to register.
 */
export class MenuScene extends Phaser.Scene {
  constructor() {
    super('menu')
  }

  create(): void {
    this.add
      .text(WORLD.width / 2, 72, 'IMMUNE', {
        fontFamily: font.family,
        fontSize: '52px',
        color: textColour.bright,
      })
      .setOrigin(0.5)

    this.add
      .text(WORLD.width / 2, 118, 'pick somewhere to defend', {
        fontFamily: font.family,
        fontSize: '17px',
        color: textColour.dim,
      })
      .setOrigin(0.5)

    const total = levels.length * CARD.width + (levels.length - 1) * CARD.gap
    let x = (WORLD.width - total) / 2
    const y = 168

    for (const level of levels) {
      this.buildCard(level, x, y)
      x += CARD.width + CARD.gap
    }
  }

  private buildCard(level: LevelDef, x: number, y: number): void {
    const panel = this.add
      .rectangle(x, y, CARD.width, CARD.height, palette.hudPanel, 0.96)
      .setOrigin(0, 0)
      .setStrokeStyle(1, palette.hudButton)
      .setInteractive({ useHandCursor: true })

    // Its own graphics, made after the panel so the map sits on top of it
    // rather than being dimmed by it.
    const graphics = this.add.graphics()

    // The real layout, from the level's own seed.
    drawLevelMap(graphics, new World(level, TISSUE_VIEW), {
      x: x + MAP.inset,
      y: y + MAP.inset,
      width: CARD.width - MAP.inset * 2,
      height: MAP.height,
    })

    this.add
      .text(x + MAP.inset, y + MAP.inset + MAP.height + 14, level.name, {
        fontFamily: font.family,
        fontSize: '21px',
        color: textColour.bright,
      })
      .setOrigin(0, 0)

    this.add
      .text(x + MAP.inset, y + MAP.inset + MAP.height + 46, level.blurb, {
        fontFamily: font.family,
        fontSize: '13px',
        color: textColour.dim,
        wordWrap: { width: CARD.width - MAP.inset * 2 },
        lineSpacing: 3,
      })
      .setOrigin(0, 0)

    const play = this.add
      .text(x + CARD.width / 2, y + CARD.height - 24, 'PLAY', {
        fontFamily: font.family,
        fontSize: '17px',
        color: textColour.bright,
      })
      .setOrigin(0.5)

    panel.on('pointerover', () => {
      panel.setStrokeStyle(2, palette.hudButtonActive)
      play.setColor(textColour.energy)
    })
    panel.on('pointerout', () => {
      panel.setStrokeStyle(1, palette.hudButton)
      play.setColor(textColour.bright)
    })

    panel.on('pointerdown', () => this.scene.start('level', { levelId: level.id }))
  }
}
