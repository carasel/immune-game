import Phaser from 'phaser'
import { balance } from '../content/balance'
import { theCut, TISSUE_VIEW } from '../content/levels'
import { findPathogen } from '../content/pathogens'
import type { Vec2 } from '../sim/geometry'
import type { EdgeRegion } from '../sim/openings'
import type { BodyCell } from '../sim/tissue'
import { TICKS_PER_SECOND, World } from '../sim/world'
import { HudScene } from './HudScene'
import { font, palette, pathogenPalette, textColour } from './palette'

const MS_PER_TICK = 1000 / TICKS_PER_SECOND

/** Never run more than this many ticks in one frame, however long the frame was. */
const MAX_TICKS_PER_FRAME = 12

export class LevelScene extends Phaser.Scene {
  private world!: World
  private tissueGraphics!: Phaser.GameObjects.Graphics
  private pathogenGraphics!: Phaser.GameObjects.Graphics

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

    // After both, so nothing covers the labels up.
    this.drawLabels()

    // Added here rather than in the game config so it always starts after the
    // world exists.
    if (!this.scene.get('hud')) {
      this.scene.add('hud', HudScene, true)
    }
  }

  update(_time: number, deltaMs: number): void {
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
      if (!cell.alive) continue

      const outline = this.outlines.get(cell.id)
      if (!outline) continue

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
