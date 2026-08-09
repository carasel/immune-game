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

  // Wounds and surfaces — where pathogens get in
  entry: 0x2ec4b6,
  entryLip: 0x6ef2e6,

  /** The ring round the cell you have picked up, and where you sent it. */
  selection: 0xeef1fb,

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
export const immunePalette: Record<string, { fill: number; edge: number; nucleus: number }> = {
  macrophage: { fill: 0xffd23f, edge: 0xc98a0b, nucleus: 0x8f5f00 },
  neutrophil: { fill: 0xffa040, edge: 0xcc6a10, nucleus: 0x8a4300 },
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
