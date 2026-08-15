import Phaser from 'phaser'
import { balance } from '../content/balance'
import { findImmuneCell } from '../content/cells'
import { theCut, TISSUE_VIEW } from '../content/levels'
import { findPathogen } from '../content/pathogens'
import type { Vec2 } from '../sim/geometry'
import type { ImmuneCell } from '../sim/immuneCells'
import type { EdgeRegion } from '../sim/openings'
import type { BodyCell } from '../sim/tissue'
import { TICKS_PER_SECOND, World } from '../sim/world'
import { HudScene } from './HudScene'
import { font, granulePalette, immunePalette, palette, pathogenPalette, textColour } from './palette'
import { cellOutline, insideCell } from './shapes'

const MS_PER_TICK = 1000 / TICKS_PER_SECOND

/** Never run more than this many ticks in one frame, however long the frame was. */
const MAX_TICKS_PER_FRAME = 12

/** How long a dead immune cell takes to wither away, in level seconds. */
const DEATH_FADE_SECONDS = 1.2

/** How big a granule is drawn. Its hit radius is smaller, over in the sim. */
const GRANULE_LENGTH = 7
const GRANULE_WIDTH = 4

export class LevelScene extends Phaser.Scene {
  private world!: World
  private tissueGraphics!: Phaser.GameObjects.Graphics
  private pathogenGraphics!: Phaser.GameObjects.Graphics
  private granuleGraphics!: Phaser.GameObjects.Graphics
  private immuneGraphics!: Phaser.GameObjects.Graphics
  private highlightGraphics!: Phaser.GameObjects.Graphics

  /**
   * Each body cell's outline, worked out once. Body cells never move, so there
   * is no reason to recompute these every frame.
   */
  private outlines = new Map<number, Vec2[]>()

  private leftoverMs = 0

  constructor() {
    super('level')
  }

  create(): void {
    this.world = new World(theCut, TISSUE_VIEW)

    // The HUD reads these. Registry keeps the two scenes decoupled.
    this.registry.set('world', this.world)
    this.registry.set('speed', balance.timeSpeeds[balance.defaultSpeedIndex])

    this.drawTerrain()

    this.tissueGraphics = this.add.graphics()
    for (const cell of this.world.bodyCells) {
      this.outlines.set(cell.id, buildOutline(cell))
    }

    // Above the tissue, so you can see bacteria sitting on a cell they're eating.
    this.pathogenGraphics = this.add.graphics()

    // Poison in flight, above the bacteria it is aimed at.
    this.granuleGraphics = this.add.graphics()

    // Above the bacteria, so a swallowed one is drawn inside its macrophage.
    this.immuneGraphics = this.add.graphics()

    // Top of the pile: the vessels lighting up while you place a recruit.
    this.highlightGraphics = this.add.graphics()

    // After both, so nothing covers the labels up.
    this.drawLabels()

    this.bindPointer()

    // Added here rather than in the game config so it always starts after the
    // world exists.
    if (!this.scene.get('hud')) {
      this.scene.add('hud', HudScene, true)
    }
  }

  update(time: number, deltaMs: number): void {
    const speed = (this.registry.get('speed') as number) ?? 1

    // Clamp the frame so that alt-tabbing away doesn't dump a huge backlog of
    // ticks into one frame.
    this.leftoverMs += Math.min(deltaMs, 100) * speed

    let ticks = 0
    while (this.leftoverMs >= MS_PER_TICK && ticks < MAX_TICKS_PER_FRAME) {
      this.world.step()
      this.leftoverMs -= MS_PER_TICK
      ticks++
    }

    // If we hit the cap we are running behind. Drop the backlog instead of
    // trying to catch up forever.
    if (this.leftoverMs > MS_PER_TICK * MAX_TICKS_PER_FRAME) {
      this.leftoverMs = 0
    }

    this.drawTissue()
    this.drawPathogens()
    this.drawGranules()
    this.drawImmuneCells()
    this.drawRecruitHighlights(time)
  }

  /**
   * Granules: little purple darts, pointing the way they are flying. Sharp and
   * nasty on purpose — they are poison, and they do not care whose cell they
   * land on.
   */
  private drawGranules(): void {
    const graphics = this.granuleGraphics
    graphics.clear()

    for (const granule of this.world.granules) {
      if (!granule.alive) continue

      const forwardX = Math.cos(granule.angle)
      const forwardY = Math.sin(granule.angle)

      // A dart: a point out front, and two corners trailing behind it.
      const points: Vec2[] = [
        { x: granule.x + forwardX * GRANULE_LENGTH, y: granule.y + forwardY * GRANULE_LENGTH },
        {
          x: granule.x - forwardX * GRANULE_LENGTH * 0.6 - forwardY * GRANULE_WIDTH,
          y: granule.y - forwardY * GRANULE_LENGTH * 0.6 + forwardX * GRANULE_WIDTH,
        },
        {
          x: granule.x - forwardX * GRANULE_LENGTH * 0.6 + forwardY * GRANULE_WIDTH,
          y: granule.y - forwardY * GRANULE_LENGTH * 0.6 - forwardX * GRANULE_WIDTH,
        },
      ]

      graphics.fillStyle(granulePalette.fill, 1)
      graphics.fillPoints(points, true)

      graphics.lineStyle(1, granulePalette.edge, 1)
      graphics.strokePoints(points, true)
    }
  }

  /**
   * While a recruit is waiting to be placed, every vessel pulses to say "pick
   * one of these". They are the only places a recruit can arrive, and a 9-year
   * -old shouldn't have to be told that twice.
   */
  private drawRecruitHighlights(time: number): void {
    const graphics = this.highlightGraphics
    graphics.clear()

    if (!this.world.recruitingDefId) return

    const pulse = 0.5 + 0.5 * Math.sin(time / 190)

    for (const opening of this.world.openings) {
      const { corridor } = opening
      const corners = innerCorners(opening)

      graphics.fillStyle(palette.vesselLip, 0.1 + 0.14 * pulse)
      graphics.fillRoundedRect(corridor.x, corridor.y, corridor.width, corridor.height, corners)

      graphics.lineStyle(3, palette.vesselLip, 0.55 + 0.45 * pulse)
      graphics.strokeRoundedRect(corridor.x, corridor.y, corridor.width, corridor.height, corners)
    }
  }

  /**
   * Click a macrophage to pick it up, then click the ground to send it there.
   * While a recruit is waiting to be placed, clicks pick the vessel it arrives
   * at instead. Escape backs out of either.
   *
   * All this scene does is turn a click into a position and hand it to the
   * simulation. What a click *means* is a game rule, so it lives in world.ts.
   */
  private bindPointer(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      // The HUD is a separate scene drawn over the bottom strip, so clicks down
      // there belong to it and never to the tissue.
      if (pointer.worldY >= TISSUE_VIEW.height) return

      // The recruit menu floats over the tissue. While it is open a click is
      // the menu's business — picking a row or dismissing it — and must not
      // also send a macrophage somewhere underneath it.
      if (this.registry.get('recruitMenuOpen')) return

      // Placing a recruit takes over the click entirely: hit a vessel and it
      // arrives there, miss and the recruit is called off. No half states.
      if (this.world.recruitingDefId) {
        const opening = this.world.openingAt(pointer.worldX, pointer.worldY)
        if (opening) this.world.recruitAt(opening.id)
        else this.world.cancelRecruit()
        return
      }

      if (this.world.selectImmuneCellAt(pointer.worldX, pointer.worldY)) return

      // Clicking a bacterium sends the cell after that one specifically;
      // clicking the ground just sends it there.
      const quarry = this.world.pathogenAt(pointer.worldX, pointer.worldY)
      if (quarry && this.world.orderSelectedToChase(quarry.id)) return

      this.world.orderSelectedTo(pointer.worldX, pointer.worldY)
    })

    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.world.recruitingDefId) this.world.cancelRecruit()
      else this.world.clearSelection()
    })
  }

  /** Vessels and wounds. Drawn once, underneath the tissue. */
  private drawTerrain(): void {
    const graphics = this.add.graphics()

    for (const opening of this.world.openings) {
      this.drawEdgeRegion(graphics, opening, palette.vessel, palette.vesselLip)
    }
    for (const entry of this.world.entries) {
      this.drawEdgeRegion(graphics, entry, palette.entry, palette.entryLip)
    }
  }

  /**
   * Scaffolding, so you can see which opening is which while we build. These
   * should go once immune cells are actually walking in through them.
   */
  private drawLabels(): void {
    for (const opening of this.world.openings) {
      this.labelEdgeRegion(opening, textColour.vessel)
    }
    for (const entry of this.world.entries) {
      this.labelEdgeRegion(entry, textColour.entry)
    }
  }

  private drawEdgeRegion(
    graphics: Phaser.GameObjects.Graphics,
    region: EdgeRegion,
    fill: number,
    lip: number,
  ): void {
    const { corridor } = region

    // Round only the corners facing into the tissue, so it reads as a mouth
    // opening inwards. Everything stays inside the corridor rectangle, which is
    // exactly the area body cells were kept out of.
    const corners = innerCorners(region)

    graphics.fillStyle(fill, 1)
    graphics.fillRoundedRect(corridor.x, corridor.y, corridor.width, corridor.height, corners)

    graphics.lineStyle(2, lip, 0.55)
    graphics.strokeRoundedRect(corridor.x, corridor.y, corridor.width, corridor.height, corners)
  }

  private labelEdgeRegion(region: EdgeRegion, colour: string): void {
    // Nudge the label a little further in than the mouth so it sits clear.
    const x = region.mouth.x + region.inward.x * (region.depth + 26)
    const y = region.mouth.y + region.inward.y * (region.depth + 26)

    this.add
      .text(x, y, region.label, {
        fontFamily: font.family,
        fontSize: '13px',
        color: colour,
      })
      .setOrigin(0.5)
      .setAlpha(0.85)
  }

  private drawTissue(): void {
    const graphics = this.tissueGraphics
    graphics.clear()

    for (const cell of this.world.bodyCells) {
      const outline = this.outlines.get(cell.id)
      if (!outline) continue

      if (!cell.alive) {
        // A dead body cell fades away but leaves its outline behind — an empty
        // husk, sitting there until a macrophage comes and clears it up.
        if (!cell.debris) continue

        graphics.fillStyle(palette.debrisFill, 0.16)
        graphics.fillPoints(outline, true)

        graphics.lineStyle(2, palette.debrisEdge, 0.65)
        graphics.strokePoints(outline, true)
        continue
      }

      // Fade towards a sickly colour as it gets eaten, so you can see which
      // cells are in trouble before they vanish.
      const hurt = 1 - cell.health
      graphics.fillStyle(mixColour(palette.tissueFill, palette.tissueSick, hurt), 1)
      graphics.fillPoints(outline, true)

      graphics.lineStyle(2, mixColour(palette.tissueEdge, palette.tissueSick, hurt), 1)
      graphics.strokePoints(outline, true)

      graphics.fillStyle(palette.nucleus, 0.5)
      graphics.fillCircle(cell.x, cell.y, cell.radius * 0.34)
    }
  }

  /** Rod-shaped bacteria: rounded rectangles, turned to face where they swim. */
  private drawPathogens(): void {
    const graphics = this.pathogenGraphics
    graphics.clear()

    for (const pathogen of this.world.pathogens) {
      if (!pathogen.alive) continue

      const def = findPathogen(pathogen.defId)
      if (!def) continue

      const colour = pathogenPalette[def.colour]
      const halfLength = def.length / 2
      const halfWidth = def.width / 2
      const corner = def.width * 0.36

      graphics.save()
      graphics.translateCanvas(pathogen.x, pathogen.y)
      graphics.rotateCanvas(pathogen.angle)

      graphics.fillStyle(colour.fill, 1)
      graphics.fillRoundedRect(-halfLength, -halfWidth, def.length, def.width, corner)

      graphics.lineStyle(2, colour.edge, 1)
      graphics.strokeRoundedRect(-halfLength, -halfWidth, def.length, def.width, corner)

      graphics.restore()
    }
  }

  /**
   * Macrophages: big yellow pears, narrow end pointing where they're going.
   *
   * A cell that has just swallowed something swells up, with its meal showing
   * through in the fat end and shrinking away as it gets digested. So you can
   * always tell at a glance which of your macrophages are busy — and being busy
   * is exactly when they can't help you.
   */
  private drawImmuneCells(): void {
    const graphics = this.immuneGraphics
    graphics.clear()

    const selected = this.world.selectedImmuneCell

    // Orders first, underneath everything, so a cell is never hidden by its own
    // destination marker.
    for (const cell of this.world.immuneCells) {
      const order = cell.order
      if (!cell.alive || !order) continue

      if (order.kind === 'move') {
        graphics.lineStyle(1, palette.selection, 0.3)
        graphics.lineBetween(cell.x, cell.y, order.x, order.y)

        graphics.lineStyle(2, palette.selection, 0.7)
        graphics.strokeCircle(order.x, order.y, 6)
        continue
      }

      // Chasing: ring the target instead, in a colour that means "kill this".
      const quarry = this.world.pathogens.find(
        (pathogen) => pathogen.id === order.pathogenId && pathogen.alive,
      )
      if (!quarry) continue

      graphics.lineStyle(1, palette.attackTarget, 0.35)
      graphics.lineBetween(cell.x, cell.y, quarry.x, quarry.y)

      graphics.lineStyle(2, palette.attackTarget, 0.85)
      graphics.strokeCircle(quarry.x, quarry.y, 16)
    }

    for (const cell of this.world.immuneCells) {
      const def = findImmuneCell(cell.defId)
      if (!def) continue

      const colour = immunePalette[def.id]
      if (!colour) continue

      // A dead cell withers away over a second or so instead of vanishing
      // between frames, so you can see that you lost one and roughly why.
      const fade = cell.alive ? 1 : this.fadeFor(cell)
      if (fade <= 0) continue

      // 0 the instant it swallows something, 1 when it has finished digesting.
      const digested = cell.meal ? 1 - cell.meal.secondsLeft / cell.meal.totalSeconds : 1
      const swell = (1 + 0.14 * (1 - digested)) * (0.7 + 0.3 * fade)

      const outline = cellOutline(cell.x, cell.y, cell.angle, def, swell)

      // A ring on the ground under the one you have picked up.
      if (cell === selected) {
        graphics.lineStyle(2, palette.selection, 0.9)
        graphics.strokeCircle(cell.x, cell.y, def.radius * swell + 7)
      }

      graphics.fillStyle(colour.fill, fade)
      graphics.fillPoints(outline, true)

      graphics.lineStyle(2, colour.edge, fade)
      graphics.strokePoints(outline, true)

      // The nucleus sits forward of centre, out of the way of the belly.
      const nucleus = insideCell(cell.x, cell.y, cell.angle, def, -0.22)
      graphics.fillStyle(colour.nucleus, (colour.nucleusAlpha ?? 0.5) * fade)
      graphics.fillCircle(nucleus.x, nucleus.y, def.radius * 0.28)

      if (!cell.meal) continue

      const meal = insideCell(cell.x, cell.y, cell.angle, def, 0.36)
      const size = def.radius * 0.44 * (1 - digested)
      if (size < 1) continue

      graphics.fillStyle(mealColour(cell.meal.pathogenDefId), 0.9 * fade)
      graphics.fillCircle(meal.x, meal.y, size)
    }
  }

  /** 1 the moment a cell dies, down to 0 once it has finished withering away. */
  private fadeFor(cell: ImmuneCell): number {
    if (cell.diedAtSeconds === null) return 0

    const since = this.world.elapsedSeconds - cell.diedAtSeconds
    return since >= DEATH_FADE_SECONDS ? 0 : 1 - since / DEATH_FADE_SECONDS
  }
}

/** The colour of whatever a macrophage is digesting. Debris has no pathogen. */
function mealColour(pathogenDefId: string | undefined): number {
  const colour = pathogenDefId ? findPathogen(pathogenDefId)?.colour : undefined
  return colour ? pathogenPalette[colour].fill : palette.debrisEdge
}


/** Blend two 0xRRGGBB colours. `amount` 0 gives `from`, 1 gives `to`. */
function mixColour(from: number, to: number, amount: number): number {
  const t = amount < 0 ? 0 : amount > 1 ? 1 : amount

  const fromRed = (from >> 16) & 0xff
  const fromGreen = (from >> 8) & 0xff
  const fromBlue = from & 0xff

  const red = Math.round(fromRed + (((to >> 16) & 0xff) - fromRed) * t)
  const green = Math.round(fromGreen + (((to >> 8) & 0xff) - fromGreen) * t)
  const blue = Math.round(fromBlue + ((to & 0xff) - fromBlue) * t)

  return (red << 16) | (green << 8) | blue
}

/** Rounds only the corners of a corridor that face into the tissue. */
function innerCorners(region: EdgeRegion): Phaser.Types.GameObjects.Graphics.RoundedRectRadius {
  const { corridor } = region
  const r = Math.min(24, Math.min(corridor.width, corridor.height) / 2)
  const none = { tl: 0, tr: 0, bl: 0, br: 0 }

  switch (region.edge) {
    case 'left':
      return { ...none, tr: r, br: r }
    case 'right':
      return { ...none, tl: r, bl: r }
    case 'top':
      return { ...none, bl: r, br: r }
    case 'bottom':
      return { ...none, tl: r, tr: r }
  }
}

/**
 * A slightly wobbly circle, so 50 body cells don't look like 50 identical
 * circles. Uses the cell's own wobbleSeed, so it is stable across frames and
 * across reloads.
 */
function buildOutline(cell: BodyCell): Vec2[] {
  const segments = 18
  const points: Vec2[] = []

  // Split across two harmonics, but never bulging more than bodyCellWobble in
  // total — the tissue generator spaces cells apart on exactly that assumption.
  const amplitude = balance.bodyCellWobble

  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2
    const wobble =
      1 +
      amplitude * 0.64 * Math.sin(angle * 3 + cell.wobbleSeed) +
      amplitude * 0.36 * Math.sin(angle * 5 - cell.wobbleSeed * 2)

    points.push({
      x: cell.x + Math.cos(angle) * cell.radius * wobble,
      y: cell.y + Math.sin(angle) * cell.radius * wobble,
    })
  }

  return points
}
