import type Phaser from 'phaser'
import { TISSUE_VIEW } from '../content/levels'
import type { Rect } from '../sim/geometry'
import type { World } from '../sim/world'
import { palette } from './palette'

/**
 * A little map of a level, drawn inside `box`.
 *
 * It is the real layout — the same tissue, the same vessels, the same wound,
 * built from the level's own seed — just shrunk. So a level that looks different
 * on this screen really is different, and nobody has to remember to redraw a
 * picture when a level is retuned.
 */
export function drawLevelMap(
  graphics: Phaser.GameObjects.Graphics,
  world: World,
  box: Rect,
): void {
  // Fit the tissue area into the box, keeping its shape.
  const scale = Math.min(box.width / TISSUE_VIEW.width, box.height / TISSUE_VIEW.height)
  const width = TISSUE_VIEW.width * scale
  const height = TISSUE_VIEW.height * scale
  const left = box.x + (box.width - width) / 2
  const top = box.y + (box.height - height) / 2

  const atX = (x: number) => left + x * scale
  const atY = (y: number) => top + y * scale

  graphics.fillStyle(palette.background, 1)
  graphics.fillRect(left, top, width, height)

  for (const opening of world.openings) {
    const { corridor } = opening
    graphics.fillStyle(palette.vessel, 1)
    graphics.fillRect(
      atX(corridor.x),
      atY(corridor.y),
      corridor.width * scale,
      corridor.height * scale,
    )
  }

  for (const entry of world.entries) {
    // A gash is drawn as its real outline, shrunk — so a card shows you the
    // shape of the wound you'd be defending, not just where it is.
    if (entry.walls) {
      graphics.fillStyle(palette.woundMouth, 1)
      graphics.fillPoints(
        entry.keepOut.outline.map((point) => ({ x: atX(point.x), y: atY(point.y) })),
        true,
      )
      continue
    }

    const { corridor } = entry
    graphics.fillStyle(palette.entry, 1)
    graphics.fillRect(
      atX(corridor.x),
      atY(corridor.y),
      corridor.width * scale,
      corridor.height * scale,
    )
  }

  // Body cells as plain dots: at this size the lumpy outlines would be mush.
  graphics.fillStyle(palette.tissueFill, 1)
  for (const cell of world.bodyCells) {
    graphics.fillCircle(atX(cell.x), atY(cell.y), Math.max(1.2, cell.radius * scale))
  }

  graphics.lineStyle(1, palette.hudButtonActive, 0.5)
  graphics.strokeRect(left, top, width, height)
}
