/**
 * Colours. Bright, flat and friendly — the Kurzgesagt look.
 * Phaser wants colours as 0xRRGGBB numbers; text wants '#rrggbb' strings.
 */
export const palette = {
  background: 0x0b1020,

  // Body cells
  tissueFill: 0xf0929e,
  tissueEdge: 0xcc6577,
  nucleus: 0xbe4a63,
  /** What a body cell fades towards as it gets eaten. */
  tissueSick: 0x6b5a6e,
  /** The empty outline a dead body cell leaves behind, until it's cleared away. */
  debrisFill: 0x6b5a6e,
  debrisEdge: 0x9a86a0,

  // Blood vessels — where your cells come in
  vessel: 0xa81f38,
  vesselLip: 0xff6b81,

  // Surfaces pathogens get in through — a lung, a gut wall
  entry: 0x2ec4b6,
  entryLip: 0x6ef2e6,

  /**
   * A cut. Dark red just under the surface going almost black down at the tip,
   * so you read "down into" rather than "a hole in the side", with a raw bright
   * lip along the torn edges. Deliberately nothing like a vessel: a vessel is a
   * smooth red tube you want cells to come out of, and this is a gash.
   */
  woundMouth: 0x8c1c2e,
  woundDeep: 0x25060f,
  woundLip: 0xff7a8c,

  /** The ring round the cell you have picked up, and where you sent it. */
  selection: 0xeef1fb,
  /** The ring round a pathogen you have sent a cell after. */
  attackTarget: 0xff6b6b,

  // HUD
  hudPanel: 0x141c36,
  hudButton: 0x27325c,
  hudButtonActive: 0x4d7cff,
  energyBarTrack: 0x232c4d,
  energyBar: 0xffd166,
}

/**
 * One entry per pathogen colour. Colour means difficulty, powers and antigen all
 * at once, so these want to read as "harmless" through to "very bad news".
 * Placeholders until they're drawn properly.
 */
export const pathogenPalette = {
  blue: { fill: 0x4d8cff, edge: 0x2554b0 },
  green: { fill: 0x4bd36b, edge: 0x1f8a3c },
  yellow: { fill: 0xf5d33d, edge: 0xb08c00 },
  orange: { fill: 0xff9636, edge: 0xc25a00 },
  red: { fill: 0xff5252, edge: 0xb01212 },
  purple: { fill: 0xb45cff, edge: 0x6b1fb0 },
}

/**
 * One entry per immune cell type, keyed by its `id` in content/cells.ts.
 * Placeholders until they're drawn properly.
 */
export const immunePalette: Record<
  string,
  { fill: number; edge: number; nucleus: number; nucleusAlpha?: number }
> = {
  macrophage: { fill: 0xffd23f, edge: 0xc98a0b, nucleus: 0x8f5f00 },
  /**
   * Purple nucleus, to match the poison it throws. Drawn nearly solid, because
   * a purple that gets blended halfway into orange stops looking purple.
   */
  neutrophil: { fill: 0xffa040, edge: 0xcc6a10, nucleus: 0x8f2ce0, nucleusAlpha: 0.95 },
}

/** The granules a neutrophil throws: little purple darts of poison. */
export const granulePalette = {
  fill: 0xb45cff,
  edge: 0x6b1fb0,
}

/**
 * A NET: the web of DNA a neutrophil throws out as it dies. Pale and stringy,
 * with the purple of its granules still in it.
 */
export const netPalette = {
  fill: 0xd9c6ff,
  strand: 0xe9dcff,
  poison: 0xb45cff,
}

export const textColour = {
  bright: '#eef1fb',
  dim: '#8d97bd',
  energy: '#ffd166',
  vessel: '#ff9aa8',
  entry: '#7df0e4',
  bacteria: '#82abff',
  immune: '#ffd94a',
  won: '#6ef2a0',
  lost: '#ff6b6b',
}

export const font = {
  family: 'system-ui, "Segoe UI", Roboto, sans-serif',
}
