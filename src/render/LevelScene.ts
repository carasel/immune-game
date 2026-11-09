import Phaser from 'phaser'
import { balance } from '../content/balance'
import { findImmuneCell } from '../content/cells'
import { inflammation } from '../content/inflammation'
import { findLevel, levels, TISSUE_VIEW, WORLD } from '../content/levels'
import { ballOffsets, findPathogen } from '../content/pathogens'
import { polygonCentre, type Vec2 } from '../sim/geometry'
import type { ImmuneCell, Meal } from '../sim/immuneCells'
import { radiusOf, strengthOf } from '../sim/inflammation'
import type { EdgeRegion } from '../sim/openings'
import type { Splinter } from '../sim/splinter'
import type { BodyCell } from '../sim/tissue'
import { TICKS_PER_SECOND, World } from '../sim/world'
import { formatClock } from './format'
import { HudScene } from './HudScene'
import {
  font,
  granulePalette,
  immunePalette,
  inflammationPalette,
  netPalette,
  palette,
  pathogenPalette,
  splinterPalette,
  textColour,
} from './palette'
import { cellOutline, insideCell, rodTail, ROD_TAIL_ROOT, rodTailShape, spiralBody } from './shapes'

const MS_PER_TICK = 1000 / TICKS_PER_SECOND

/** Never run more than this many ticks in one frame, however long the frame was. */
const MAX_TICKS_PER_FRAME = 12

/** How long a dead immune cell takes to wither away, in level seconds. */
const DEATH_FADE_SECONDS = 1.2

/**
 * How close together two clicks on the same cell have to be to mean "set off
 * its NET". Short on purpose: this control kills one of your own cells, so a
 * hesitant double-click should select it twice and do nothing else.
 */
const DOUBLE_CLICK_MS = 320

/** How big a granule is drawn. Its hit radius is smaller, over in the sim. */
const GRANULE_LENGTH = 7
const GRANULE_WIDTH = 4

/**
 * How a rod's tail wiggles.
 *
 * The wiggle is wound off level time rather than wall-clock time, so a paused
 * game holds still and a fast-forwarded one thrashes. `PER_SECOND` is how many
 * full waves pass down the tail in one level second.
 */
const TAIL_WAVES_PER_SECOND = 2.6

/**
 * How far apart two bacteria's wiggles are pushed, in radians per id. An
 * awkward number on purpose: it stops a family of freshly split bacteria from
 * all beating in time with each other, which looks like a bug.
 */
const TAIL_STAGGER = 1.7

/**
 * How many full waves run along a spiral's body in one level second while it
 * darts. It holds still while it rests, so the wriggle is the dart.
 */
const SPIRAL_WAVES_PER_SECOND = 4

/** How long the splinter takes to slide out once the pus pushes it, in level seconds. */
const SPLINTER_EXIT_SECONDS = 1.6

/** How thick the pus round the splinter gets when it is just about to push it out. */
const PUS_THICKEST = 30

/** How far apart the blobs of pus are along the splinter's sides. */
const PUS_BLOB_SPACING = 9

/** How long the restart button's "Sure?" waits for a second click, in real milliseconds. */
const RESTART_SURE_MS = 3000

export class LevelScene extends Phaser.Scene {
  private world!: World
  private tissueGraphics!: Phaser.GameObjects.Graphics
  private inflammationGraphics!: Phaser.GameObjects.Graphics
  private splinterGraphics!: Phaser.GameObjects.Graphics
  private pathogenGraphics!: Phaser.GameObjects.Graphics
  private netGraphics!: Phaser.GameObjects.Graphics
  private granuleGraphics!: Phaser.GameObjects.Graphics
  private immuneGraphics!: Phaser.GameObjects.Graphics
  private highlightGraphics!: Phaser.GameObjects.Graphics

  /**
   * Each body cell's outline, worked out once. Body cells never move, so there
   * is no reason to recompute these every frame.
   */
  private outlines = new Map<number, Vec2[]>()

  private leftoverMs = 0

  /**
   * Level time so far, in seconds — real time scaled by the speed control. What
   * the tail wiggle is wound off, so animation runs at the same speed as the
   * game it belongs to instead of ignoring the pause button.
   */
  private levelSeconds = 0

  /**
   * How far along each spiral's wave has run, by pathogen id. Held here rather
   * than worked out from the clock because it only moves while the spiral is
   * darting, so it has to remember where it stopped.
   */
  private spiralPhases = new Map<number, number>()

  /** `levelSeconds` when the bacteria were last drawn, to know how far to wind the spirals. */
  private pathogensDrawnAt = 0

  private levelId = levels[0].id

  /** Shown once the level is decided. Built lazily, since most levels don't end. */
  private ending: Phaser.GameObjects.Container | null = null

  /** The restart button in the corner, for a level that is going wrong. */
  private restartBox!: Phaser.GameObjects.Rectangle
  private restartText!: Phaser.GameObjects.Text
  /**
   * When the "Sure?" stops waiting for its second click, in real milliseconds.
   * Restarting takes two clicks so a stray one can't throw a game away.
   */
  private restartArmedUntil = 0

  /** For spotting a double-click: which cell was clicked last, and when. */
  private lastClickedCellId: number | null = null
  private lastClickedAt = Number.NEGATIVE_INFINITY

  constructor() {
    super('level')
  }

  /** Which level to play. Set by the menu when it starts this scene. */
  init(data: { levelId?: string }): void {
    this.levelId = data.levelId ?? levels[0].id
  }

  create(): void {
    // Phaser reuses this same object when a scene restarts, so anything held on
    // `this` survives from the last go and has to be cleared by hand. Without
    // this, a second attempt at a level would never show its ending again.
    this.ending = null
    this.outlines.clear()
    this.leftoverMs = 0
    this.levelSeconds = 0
    this.spiralPhases.clear()
    this.pathogensDrawnAt = 0
    this.restartArmedUntil = 0
    this.forgetLastClick()

    const level = findLevel(this.levelId) ?? levels[0]
    this.world = new World(level, TISSUE_VIEW)

    // The HUD reads these. Registry keeps the two scenes decoupled.
    this.registry.set('world', this.world)
    this.registry.set('speed', balance.timeSpeeds[balance.defaultSpeedIndex])
    this.registry.set('recruitMenuOpen', false)

    this.drawTerrain()

    this.tissueGraphics = this.add.graphics()
    for (const cell of this.world.bodyCells) {
      this.outlines.set(cell.id, buildOutline(cell))
    }

    // See-through over the tissue, so you can watch what is under it redden.
    this.inflammationGraphics = this.add.graphics()

    // The splinter and the pus round it sit on the tissue, under anything that
    // moves, so a bacterium coming off it is drawn on top of it.
    this.splinterGraphics = this.add.graphics()

    // Webs lie on the ground, under everything caught in them — so a bacterium
    // stuck in one is still clearly a bacterium you can click on.
    this.netGraphics = this.add.graphics()

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
    this.buildRestartButton()

    this.bindPointer()

    // Added here rather than in the game config so it always starts after the
    // world exists. Coming back from the menu it already exists but is stopped.
    if (!this.scene.get('hud')) {
      this.scene.add('hud', HudScene, true)
    } else if (!this.scene.isActive('hud')) {
      this.scene.launch('hud')
    }
  }

  update(time: number, deltaMs: number): void {
    const speed = (this.registry.get('speed') as number) ?? 1

    // Clamp the frame so that alt-tabbing away doesn't dump a huge backlog of
    // ticks into one frame.
    const levelMs = Math.min(deltaMs, 100) * speed
    this.leftoverMs += levelMs
    this.levelSeconds += levelMs / 1000

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
    this.drawInflammation(time)
    this.drawSplinter()
    this.drawNets()
    this.drawPathogens()
    this.drawGranules()
    this.drawImmuneCells()
    this.drawRecruitHighlights(time)
    this.refreshRestartButton(time)

    if (this.world.isOver && !this.ending) this.showEnding()
  }

  /**
   * A small button in the top-right corner of the tissue, for starting the level
   * again when it is going wrong. The bar along the bottom is full, so it lives
   * up here. First click asks "Sure?", second click restarts.
   */
  private buildRestartButton(): void {
    const x = WORLD.width - 52
    const y = 20

    this.restartBox = this.add
      .rectangle(x, y, 84, 26, palette.hudButton, 0.85)
      .setStrokeStyle(1, palette.hudButtonActive, 0.6)
      .setInteractive({ useHandCursor: true })

    this.restartText = this.add
      .text(x, y, '', {
        fontFamily: font.family,
        fontSize: '13px',
        color: textColour.bright,
      })
      .setOrigin(0.5)

    this.restartBox.on('pointerdown', () => {
      if (this.time.now < this.restartArmedUntil) {
        this.scene.restart({ levelId: this.levelId })
        return
      }
      this.restartArmedUntil = this.time.now + RESTART_SURE_MS
    })
  }

  private refreshRestartButton(time: number): void {
    // Once the level is over the ending offers "Try again" instead.
    const show = !this.world.isOver
    this.restartBox.setVisible(show)
    this.restartText.setVisible(show)

    const armed = time < this.restartArmedUntil
    this.restartText.setText(armed ? 'Sure?' : 'Restart')
    this.restartBox.setFillStyle(armed ? palette.hudButtonActive : palette.hudButton, 0.85)
  }

  /**
   * How a level finishes: what happened, and the two things you might want to do
   * about it. Lives here rather than in the HUD because this scene owns which
   * level is being played, so it is the one that can start another.
   */
  private showEnding(): void {
    const won = this.world.isWon
    const middle = TISSUE_VIEW.height / 2

    this.ending = this.add.container(0, 0)

    // Something to read it against. By the time a level ends the tissue is
    // usually covered in bacteria, and the one thing you want to be legible is
    // what just happened.
    this.ending.add(
      this.add
        .rectangle(WORLD.width / 2, middle + 6, 600, 200, palette.background, 0.88)
        .setStrokeStyle(1, palette.hudButtonActive, 0.5),
    )

    this.ending.add(
      this.add
        .text(WORLD.width / 2, middle - 40, won ? 'TISSUE SAVED' : 'TISSUE LOST', {
          fontFamily: font.family,
          fontSize: '44px',
          color: won ? textColour.won : textColour.lost,
        })
        .setOrigin(0.5),
    )

    this.ending.add(
      this.add
        .text(WORLD.width / 2, middle, this.endingLine(), {
          fontFamily: font.family,
          fontSize: '16px',
          color: textColour.dim,
        })
        .setOrigin(0.5),
    )

    this.addEndingButton(WORLD.width / 2 - 96, middle + 56, 'Try again', () =>
      this.scene.restart({ levelId: this.levelId }),
    )
    this.addEndingButton(WORLD.width / 2 + 96, middle + 56, 'Choose level', () => {
      this.scene.stop('hud')
      this.scene.start('menu')
    })
  }

  private endingLine(): string {
    if (this.world.isWon) {
      return (
        `infection cleared in ${formatClock(this.world.wonAtSeconds)} — ` +
        `${this.world.livingBodyCellCount} of ${this.world.bodyCells.length} body cells made it`
      )
    }

    // Which way you lost matters: every body cell eaten is a different failure
    // from your last cell starving, and they should not read alike.
    const cause =
      this.world.lossReason === 'tissue'
        ? 'every body cell is dead'
        : 'your last immune cell starved'

    return `${cause} — it held out for ${formatClock(this.world.lostAtSeconds)}`
  }

  private addEndingButton(x: number, y: number, label: string, onClick: () => void): void {
    const box = this.add
      .rectangle(x, y, 160, 34, palette.hudButton)
      .setStrokeStyle(1, palette.hudButtonActive, 0.7)
      .setInteractive({ useHandCursor: true })

    const text = this.add
      .text(x, y, label, {
        fontFamily: font.family,
        fontSize: '15px',
        color: textColour.bright,
      })
      .setOrigin(0.5)

    box.on('pointerover', () => box.setFillStyle(palette.hudButtonActive))
    box.on('pointerout', () => box.setFillStyle(palette.hudButton))
    box.on('pointerdown', onClick)

    this.ending?.add([box, text])
  }

  /**
   * A NET: a pale, stringy web with the purple of the granules still in it. It
   * thins out as it breaks down, so you can see how long you have left.
   *
   * The strands are laid out from the net's own id, so a given web looks the
   * same every frame instead of shimmering.
   */
  private drawNets(): void {
    const graphics = this.netGraphics
    graphics.clear()

    for (const net of this.world.nets) {
      if (!net.alive) continue

      const left = net.secondsLeft / net.totalSeconds

      graphics.fillStyle(netPalette.fill, 0.16 * left)
      graphics.fillCircle(net.x, net.y, net.radius)

      graphics.lineStyle(2, netPalette.strand, 0.5 * left)
      graphics.strokeCircle(net.x, net.y, net.radius)

      // Strands across the web, at fixed angles for this net.
      const strands = 9
      const turn = net.id * 0.7
      graphics.lineStyle(1, netPalette.strand, 0.45 * left)

      for (let i = 0; i < strands; i++) {
        const angle = turn + (i / strands) * Math.PI * 2
        const across = angle + Math.PI * 0.62

        graphics.lineBetween(
          net.x + Math.cos(angle) * net.radius,
          net.y + Math.sin(angle) * net.radius,
          net.x + Math.cos(across) * net.radius,
          net.y + Math.sin(across) * net.radius,
        )
      }

      // Beads of poison caught in the mesh.
      graphics.fillStyle(netPalette.poison, 0.5 * left)
      for (let i = 0; i < strands; i++) {
        const angle = turn * 1.7 + (i / strands) * Math.PI * 2
        const reach = net.radius * (0.3 + 0.22 * ((i * 7) % 3))
        graphics.fillCircle(net.x + Math.cos(angle) * reach, net.y + Math.sin(angle) * reach, 2.5)
      }
    }
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
   * Inflamed circles: a red, see-through swelling over the tissue, with a
   * slow throb at the edge. A circle calming down shrinks and pales, so you can
   * see one going out without having to read a number.
   */
  private drawInflammation(time: number): void {
    const graphics = this.inflammationGraphics
    graphics.clear()

    for (const patch of this.world.inflammations) {
      if (!patch.alive) continue

      const strength = strengthOf(patch)
      const radius = radiusOf(patch)
      // Each throbs out of step with the others, so two circles side by side
      // don't pulse like one thing.
      const throb = 0.5 + 0.5 * Math.sin(time / 420 + patch.id * 1.3)

      graphics.fillStyle(inflammationPalette.fill, (0.24 + 0.06 * throb) * strength)
      graphics.fillCircle(patch.x, patch.y, radius)

      // A hotter middle, so it reads as swelling rather than a flat red disc.
      graphics.fillStyle(inflammationPalette.fill, 0.12 * strength)
      graphics.fillCircle(patch.x, patch.y, radius * 0.6)

      graphics.lineStyle(2, inflammationPalette.edge, (0.45 + 0.3 * throb) * strength)
      graphics.strokeCircle(patch.x, patch.y, radius)
    }
  }

  /**
   * The splinter: a sliver of wood with the grain running down it, sitting in a
   * yellow blob of pus that thickens as neutrophils die round it. When the pus
   * wins, it slides back out the way it came in and leaves a raw hole behind.
   */
  private drawSplinter(): void {
    const graphics = this.splinterGraphics
    graphics.clear()

    const splinter = this.world.splinter
    if (!splinter) return

    if (splinter.pushedOut) {
      this.drawSplinterHole(graphics, splinter)

      const since = this.world.elapsedSeconds - (splinter.pushedOutAtSeconds ?? 0)
      if (since < SPLINTER_EXIT_SECONDS) {
        const gone = since / SPLINTER_EXIT_SECONDS
        this.drawWood(graphics, splinter, gone, 1 - gone)
      }
      return
    }

    this.drawPus(graphics, splinter, this.world.pusFraction)
    this.drawWood(graphics, splinter, 0, 1)
  }

  /**
   * The wood itself. `out` slides it back along its own length, 0 where it is
   * stuck and 1 once it is completely out of the skin.
   */
  private drawWood(
    graphics: Phaser.GameObjects.Graphics,
    splinter: Splinter,
    out: number,
    alpha: number,
  ): void {
    // Back the way it came: from the tip towards the skin, by its whole length.
    const skin = splinter.skin
    const shiftX = (skin.x - splinter.tip.x) * out * 1.1
    const shiftY = (skin.y - splinter.tip.y) * out * 1.1
    const shape = splinter.outline.map((point) => ({ x: point.x + shiftX, y: point.y + shiftY }))

    graphics.fillStyle(splinterPalette.wood, alpha)
    graphics.fillPoints(shape, true)

    // Grain, running from the skin end to the tip. Only drawn for a four-sided
    // splinter, where "the two long sides" is a clear idea.
    if (shape.length === 4) {
      const [skinA, skinB, tipB, tipA] = shape
      const lines = 5

      for (let line = 1; line < lines; line++) {
        const across = line / lines
        graphics.lineStyle(line % 2 === 0 ? 1.5 : 1, splinterPalette.grain, 0.55 * alpha)
        graphics.lineBetween(
          skinA.x + (skinB.x - skinA.x) * across,
          skinA.y + (skinB.y - skinA.y) * across,
          tipA.x + (tipB.x - tipA.x) * (0.15 + across * 0.7),
          tipA.y + (tipB.y - tipA.y) * (0.15 + across * 0.7),
        )
      }
    }

    graphics.lineStyle(2, splinterPalette.edge, alpha)
    graphics.strokePoints(shape, true)
  }

  /**
   * Pus: a lumpy yellow blob all round the splinter's sides, thickening as it
   * builds. Made of overlapping circles with their own fixed wobble, so it is
   * blobby rather than a neat outline, and it doesn't shimmer.
   */
  private drawPus(graphics: Phaser.GameObjects.Graphics, splinter: Splinter, fraction: number): void {
    if (fraction <= 0) return

    const blobs: { x: number; y: number; size: number }[] = []
    let index = 0

    for (const [from, to] of splinter.sides) {
      const length = Math.hypot(to.x - from.x, to.y - from.y)
      const steps = Math.max(1, Math.round(length / PUS_BLOB_SPACING))

      for (let step = 0; step <= steps; step++) {
        const along = step / steps
        // Two lumpinesses on top of each other, so it bulges in big lobes with
        // smaller bumps on them rather than one even ripple all the way along.
        const wobble = 0.72 + 0.2 * Math.sin(index * 0.9) + 0.12 * Math.sin(index * 2.7 + 1)
        blobs.push({
          x: from.x + (to.x - from.x) * along,
          y: from.y + (to.y - from.y) * along,
          size: PUS_THICKEST * fraction * wobble,
        })
        index++
      }
    }

    // Every edge before any fill, so the blobs merge into one lump.
    graphics.fillStyle(splinterPalette.pusEdge, 0.9)
    for (const blob of blobs) graphics.fillCircle(blob.x, blob.y, blob.size + 2)

    graphics.fillStyle(splinterPalette.pusFill, 0.95)
    for (const blob of blobs) graphics.fillCircle(blob.x, blob.y, blob.size)
  }

  /**
   * What a pushed-out splinter leaves: a raw hole, drawn the same way as the
   * cut, so it reads as a wound and never as a vessel. Dark red where it broke
   * the skin, going almost black down where the tip was.
   */
  private drawSplinterHole(graphics: Phaser.GameObjects.Graphics, splinter: Splinter): void {
    const shape = splinter.outline

    // Sliced from the skin end to the tip, for a four-sided one. Anything else
    // is just filled, darker towards the middle.
    if (shape.length === 4) {
      const [skinA, skinB, tipB, tipA] = shape
      const slices = 12
      const at = (from: Vec2, to: Vec2, along: number) => ({
        x: from.x + (to.x - from.x) * along,
        y: from.y + (to.y - from.y) * along,
      })

      for (let slice = 0; slice < slices; slice++) {
        const top = slice / slices
        const bottom = (slice + 1) / slices
        graphics.fillStyle(mixColour(palette.woundMouth, palette.woundDeep, (top + bottom) / 2), 1)
        graphics.fillPoints(
          [at(skinA, tipA, top), at(skinB, tipB, top), at(skinB, tipB, bottom), at(skinA, tipA, bottom)],
          true,
        )
      }
    } else {
      graphics.fillStyle(palette.woundMouth, 1)
      graphics.fillPoints(shape, true)

      const middle = polygonCentre(shape)
      graphics.fillStyle(palette.woundDeep, 0.8)
      graphics.fillPoints(
        shape.map((point) => ({
          x: middle.x + (point.x - middle.x) * 0.6,
          y: middle.y + (point.y - middle.y) * 0.6,
        })),
        true,
      )
    }

    // Raw edges, brightest up at the skin and fading as they go in. How deep a
    // point is gets measured along the splinter, from the skin end to the tip.
    const axisX = splinter.tip.x - splinter.skin.x
    const axisY = splinter.tip.y - splinter.skin.y
    const axisSquared = Math.max(1, axisX * axisX + axisY * axisY)
    const depthOf = (x: number, y: number) =>
      ((x - splinter.skin.x) * axisX + (y - splinter.skin.y) * axisY) / axisSquared

    for (const [from, to] of splinter.sides) {
      const steps = 10
      for (let step = 0; step < steps; step++) {
        const a = step / steps
        const b = (step + 1) / steps
        const middle = (a + b) / 2
        const depth = depthOf(from.x + (to.x - from.x) * middle, from.y + (to.y - from.y) * middle)
        graphics.lineStyle(3, palette.woundLip, 0.95 - 0.7 * Math.min(1, Math.max(0, depth)))
        graphics.lineBetween(
          from.x + (to.x - from.x) * a,
          from.y + (to.y - from.y) * a,
          from.x + (to.x - from.x) * b,
          from.y + (to.y - from.y) * b,
        )
      }
    }
  }

  /**
   * While an inflamed circle is waiting to be put down, a ghost of it follows
   * the pointer, exactly the size it will be, so you can see what it covers.
   */
  private drawInflammationPreview(graphics: Phaser.GameObjects.Graphics, time: number): void {
    const pointer = this.input.activePointer
    if (pointer.worldY >= TISSUE_VIEW.height) return

    const pulse = 0.5 + 0.5 * Math.sin(time / 190)

    graphics.fillStyle(inflammationPalette.fill, 0.1 + 0.08 * pulse)
    graphics.fillCircle(pointer.worldX, pointer.worldY, inflammation.radius)

    graphics.lineStyle(2, inflammationPalette.edge, 0.5 + 0.4 * pulse)
    graphics.strokeCircle(pointer.worldX, pointer.worldY, inflammation.radius)
  }

  /**
   * While a recruit is waiting to be placed, every vessel pulses to say "pick
   * one of these". They are the only places a recruit can arrive, and a 9-year
   * -old shouldn't have to be told that twice.
   */
  private drawRecruitHighlights(time: number): void {
    const graphics = this.highlightGraphics
    graphics.clear()

    if (this.world.isPlacingInflammation) {
      this.drawInflammationPreview(graphics, time)
      return
    }

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
    // Nothing uses the right button, and the browser menu popping up over the
    // game when a nine-year-old mis-clicks helps nobody.
    this.input.mouse?.disableContextMenu()

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      // The HUD is a separate scene drawn over the bottom strip, so clicks down
      // there belong to it and never to the tissue.
      if (pointer.worldY >= TISSUE_VIEW.height) return

      // The restart button sits over the tissue, and a click on it is its own.
      if (this.restartBox.visible && this.restartBox.getBounds().contains(pointer.worldX, pointer.worldY)) {
        return
      }

      // The recruit menu floats over the tissue. While it is open a click is
      // the menu's business — picking a row or dismissing it — and must not
      // also send a macrophage somewhere underneath it.
      if (this.registry.get('recruitMenuOpen')) return

      // A right-click while something is waiting to be placed calls it off.
      if (pointer.rightButtonDown()) {
        if (this.world.isPlacingInflammation) {
          this.world.cancelInflammation()
          return
        }
        if (this.world.recruitingDefId) {
          this.world.cancelRecruit()
          return
        }
      }

      // Inflaming takes over the click the same way: the circle goes down
      // wherever you click on the tissue.
      if (this.world.isPlacingInflammation) {
        this.world.inflameAt(pointer.worldX, pointer.worldY)
        return
      }

      // Placing a recruit takes over the click entirely: hit a vessel and it
      // arrives there, miss and the recruit is called off. No half states.
      if (this.world.recruitingDefId) {
        const opening = this.world.openingAt(pointer.worldX, pointer.worldY)
        if (opening) this.world.recruitAt(opening.id)
        else this.world.cancelRecruit()
        return
      }

      const cell = this.world.selectImmuneCellAt(pointer.worldX, pointer.worldY)
      if (cell) {
        // Twice on the same cell in quick succession sets off its NET. Only
        // neutrophils have one, so double-clicking anything else is harmless.
        if (this.isSecondClickOn(cell.id)) {
          this.world.formNetFrom(cell.id)
          this.forgetLastClick()
        } else {
          this.lastClickedCellId = cell.id
          this.lastClickedAt = this.time.now
        }

        return
      }

      // A click anywhere else breaks the pair, so a click here and a click there
      // can never add up to killing a cell.
      this.forgetLastClick()

      // Clicking a bacterium sends the cell after that one specifically;
      // clicking the ground just sends it there.
      const quarry = this.world.pathogenAt(pointer.worldX, pointer.worldY)
      if (quarry && this.world.orderSelectedToChase(quarry.id)) return

      this.world.orderSelectedTo(pointer.worldX, pointer.worldY)
    })

    this.input.keyboard?.on('keydown-ESC', () => {
      this.forgetLastClick()
      if (this.world.isPlacingInflammation) this.world.cancelInflammation()
      else if (this.world.recruitingDefId) this.world.cancelRecruit()
      else this.world.clearSelection()
    })
  }

  /**
   * Is this the second of a pair of clicks on the same cell, close enough
   * together to mean it? Clicking two different cells in a row never counts,
   * however fast — that is just picking cells up.
   */
  private isSecondClickOn(cellId: number): boolean {
    return (
      cellId === this.lastClickedCellId && this.time.now - this.lastClickedAt <= DOUBLE_CLICK_MS
    )
  }

  private forgetLastClick(): void {
    this.lastClickedCellId = null
    this.lastClickedAt = Number.NEGATIVE_INFINITY
  }

  /** Vessels and wounds. Drawn once, underneath the tissue. */
  private drawTerrain(): void {
    const graphics = this.add.graphics()

    for (const opening of this.world.openings) {
      this.drawEdgeRegion(graphics, opening, palette.vessel, palette.vesselLip)
    }
    for (const entry of this.world.entries) {
      if (entry.walls) this.drawWound(graphics, entry)
      else this.drawEdgeRegion(graphics, entry, palette.entry, palette.entryLip)
    }
  }

  /**
   * A cut, seen end-on: a gash torn into the flesh, wide where it broke the
   * surface and tapering to a point as it goes in.
   *
   * Drawn as a stack of slices between the two walls, darkening as they go
   * deeper, because a wound you can see the bottom of doesn't look deep. The
   * shape is the sim's, the same one the tissue was held back from, so the
   * body cells really are packed against these walls.
   */
  private drawWound(graphics: Phaser.GameObjects.Graphics, wound: EdgeRegion): void {
    const [wallA, wallB] = wound.walls!
    const slices = wallA.length - 1

    for (let slice = 0; slice < slices; slice++) {
      const depth = (slice + 0.5) / slices
      graphics.fillStyle(mixColour(palette.woundMouth, palette.woundDeep, depth), 1)
      graphics.fillPoints(
        [wallA[slice], wallA[slice + 1], wallB[slice + 1], wallB[slice]],
        true,
      )
    }

    // The torn edges, raw and bright where the surface broke and fading away
    // into the dark. Drawn a segment at a time so it can fade.
    for (const wall of wound.walls!) {
      for (let step = 0; step < wall.length - 1; step++) {
        const depth = step / (wall.length - 1)
        graphics.lineStyle(3, palette.woundLip, 0.95 - 0.75 * depth)
        graphics.lineBetween(wall[step].x, wall[step].y, wall[step + 1].x, wall[step + 1].y)
      }
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

    // Just past the tip, out in the tissue where it doesn't sit on the wood.
    const splinter = this.world.splinter
    if (splinter) {
      const awayX = splinter.tip.x - splinter.skin.x
      const awayY = splinter.tip.y - splinter.skin.y
      const away = Math.hypot(awayX, awayY) || 1

      this.add
        .text(
          splinter.tip.x + (awayX / away) * 34,
          splinter.tip.y + (awayY / away) * 34,
          splinter.label,
          { fontFamily: font.family, fontSize: '13px', color: textColour.entry },
        )
        .setOrigin(0.5)
        .setAlpha(0.85)
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

  /**
   * Bacteria, turned to face the way they are swimming.
   *
   * Rods are one rounded rectangle with a wiggling tail behind it. Cocci are a
   * clump of balls, and the clump is drawn from the same `ballOffsets` the
   * simulation measures them with — so a clump you can see three balls on
   * really is a three-ball clump, and it visibly shrinks as they are knocked
   * off.
   *
   * The tail is decoration only. Nothing in the simulation knows about it, so a
   * tail can't be bitten and doesn't make a bacterium easier to catch.
   *
   * Spirals are a thick wavy line, outlined by drawing it twice: wide in the
   * edge colour, then narrower in the fill on top. The wave runs along them only
   * while they dart.
   */
  private drawPathogens(): void {
    const graphics = this.pathogenGraphics
    graphics.clear()

    const elapsed = this.levelSeconds - this.pathogensDrawnAt
    this.pathogensDrawnAt = this.levelSeconds

    for (const pathogen of this.world.pathogens) {
      if (!pathogen.alive) {
        this.spiralPhases.delete(pathogen.id)
        continue
      }

      const def = findPathogen(pathogen.defId)
      if (!def) continue

      const colour = pathogenPalette[def.colour]

      graphics.save()
      graphics.translateCanvas(pathogen.x, pathogen.y)
      graphics.rotateCanvas(pathogen.angle)

      if (def.shape === 'spiral') {
        // Started off staggered, for the same reason the tails are.
        let phase = this.spiralPhases.get(pathogen.id) ?? pathogen.id * TAIL_STAGGER
        if (!pathogen.resting) phase += elapsed * SPIRAL_WAVES_PER_SECOND * Math.PI * 2
        this.spiralPhases.set(pathogen.id, phase)

        const body = spiralBody(def, phase)

        graphics.lineStyle(def.thickness + 4, colour.edge, 1)
        graphics.strokePoints(body)
        graphics.fillStyle(colour.edge, 1)
        graphics.fillCircle(body[0].x, body[0].y, (def.thickness + 4) / 2)
        graphics.fillCircle(body[body.length - 1].x, body[body.length - 1].y, (def.thickness + 4) / 2)

        graphics.lineStyle(def.thickness, colour.fill, 1)
        graphics.strokePoints(body)
        graphics.fillStyle(colour.fill, 1)
        graphics.fillCircle(body[0].x, body[0].y, def.thickness / 2)
        graphics.fillCircle(body[body.length - 1].x, body[body.length - 1].y, def.thickness / 2)
      } else if (def.shape === 'cocci') {
        const balls = ballOffsets(pathogen.balls, def.ballRadius)

        // Every ball is filled before any of them is outlined, so the outlines
        // sit on top of the whole clump and it reads as one thing made of balls
        // rather than a stack of separate circles.
        graphics.fillStyle(colour.fill, 1)
        for (const ball of balls) {
          graphics.fillCircle(ball.x, ball.y, def.ballRadius)
        }

        graphics.lineStyle(2, colour.edge, 1)
        for (const ball of balls) {
          graphics.strokeCircle(ball.x, ball.y, def.ballRadius)
        }
      } else {
        const halfLength = def.length / 2
        const halfWidth = def.width / 2
        const corner = def.width * 0.36

        // The tail goes down before the body, so its root ends up hidden under
        // the fill and the tail looks like it grows out of the bacterium.
        const phase =
          this.levelSeconds * TAIL_WAVES_PER_SECOND * Math.PI * 2 + pathogen.id * TAIL_STAGGER

        graphics.lineStyle(1.5, colour.edge, 1)
        graphics.strokePoints(
          rodTail(def.length * ROD_TAIL_ROOT, rodTailShape(def.tailLength), phase),
        )

        graphics.fillStyle(colour.fill, 1)
        graphics.fillRoundedRect(-halfLength, -halfWidth, def.length, def.width, corner)

        graphics.lineStyle(2, colour.edge, 1)
        graphics.strokeRoundedRect(-halfLength, -halfWidth, def.length, def.width, corner)
      }

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

      graphics.fillStyle(mealColour(cell.meal), 0.9 * fade)
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

/** The colour of whatever a macrophage is digesting. Debris and pus have no pathogen. */
function mealColour(meal: Meal): number {
  if (meal.kind === 'pus') return splinterPalette.pusFill

  const colour = meal.pathogenDefId ? findPathogen(meal.pathogenDefId)?.colour : undefined
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
