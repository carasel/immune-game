import type Phaser from 'phaser'
import { macrophage, type ImmuneCellDef } from '../content/cells'
import { blueBacteria } from '../content/pathogens'
import { immunePalette, palette, pathogenPalette } from './palette'
import { cellOutline, insideCell } from './shapes'

/**
 * Little pictures of the things in the game, for the HUD.
 *
 * They are drawn with the same shapes and colours as the real thing, from the
 * same content files, so the icon for a macrophage always looks like the
 * macrophages on screen. `size` is the radius the icon should fit inside.
 */

/** A lightning bolt: energy. */
export function drawEnergyIcon(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  size: number,
): void {
  // A zigzag, as fractions of the icon size.
  const bolt = [
    { x: 0.34, y: -1 },
    { x: -0.52, y: 0.08 },
    { x: -0.06, y: 0.08 },
    { x: -0.34, y: 1 },
    { x: 0.52, y: -0.12 },
    { x: 0.06, y: -0.12 },
  ].map((point) => ({ x: x + point.x * size, y: y + point.y * size }))

  graphics.fillStyle(palette.energyBar, 1)
  graphics.fillPoints(bolt, true)
}

/** A body cell: a pink circle with its nucleus. */
export function drawBodyCellIcon(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  size: number,
): void {
  graphics.fillStyle(palette.tissueFill, 1)
  graphics.fillCircle(x, y, size)

  graphics.lineStyle(1.5, palette.tissueEdge, 1)
  graphics.strokeCircle(x, y, size)

  // The same proportion the tissue itself is drawn at.
  graphics.fillStyle(palette.nucleus, 0.5)
  graphics.fillCircle(x, y, size * 0.34)
}

/**
 * Any immune cell, facing right, at its own shape and colours. One function for
 * all of them, so a new cell type in content/cells.ts gets its picture free.
 */
export function drawImmuneCellIcon(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  size: number,
  def: ImmuneCellDef,
): void {
  const colour = immunePalette[def.id]
  if (!colour) return

  const shape = {
    radius: size,
    nose: def.nose,
    belly: def.belly,
    spikes: def.spikes,
    spikiness: def.spikiness,
  }

  // A lopsided cell's bulk sits behind its middle, so nudge it back to look
  // centred in the space the icon is given.
  const centreX = x + size * def.nose * 0.6
  const outline = cellOutline(centreX, y, 0, shape)

  graphics.fillStyle(colour.fill, 1)
  graphics.fillPoints(outline, true)

  graphics.lineStyle(1.5, colour.edge, 1)
  graphics.strokePoints(outline, true)

  const nucleus = insideCell(centreX, y, 0, shape, -0.22)
  graphics.fillStyle(colour.nucleus, colour.nucleusAlpha ?? 0.5)
  graphics.fillCircle(nucleus.x, nucleus.y, size * 0.28)
}

/** The macrophage specifically, for anywhere that just wants the one picture. */
export function drawMacrophageIcon(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  size: number,
): void {
  drawImmuneCellIcon(graphics, x, y, size, macrophage)
}

/** A bacterium: the blue rod, at the proportions it is drawn in the tissue. */
export function drawBacteriumIcon(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  size: number,
): void {
  const colour = pathogenPalette[blueBacteria.colour]

  const length = size * 2
  const width = length * (blueBacteria.width / blueBacteria.length)

  graphics.fillStyle(colour.fill, 1)
  graphics.fillRoundedRect(x - length / 2, y - width / 2, length, width, width * 0.36)

  graphics.lineStyle(1.5, colour.edge, 1)
  graphics.strokeRoundedRect(x - length / 2, y - width / 2, length, width, width * 0.36)
}

