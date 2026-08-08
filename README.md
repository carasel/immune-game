# Immune

A 2D game about the immune system. See [GAME_DESIGN.md](GAME_DESIGN.md) for what we're building
and why.

## Running it

Needs [Node.js](https://nodejs.org/) 20 or newer (LTS is fine).

```bash
npm install
npm run dev
```

Then open http://localhost:5173. Vite hot-reloads, so saving a file updates the game
immediately — including the numbers in `src/content/balance.ts`.

```bash
npm run typecheck   # check the types without building
npm run build       # typecheck + production build into dist/
```

## Where things live

```
src/
  content/     the game's design, as data. No engine knowledge needed.
    balance.ts   every number that decides how the game feels
    cells.ts     immune cells: size, speed, vision, what eating pays, upkeep
    pathogens.ts the pathogens and their colours
    levels.ts    tissue layouts, vessel openings, pathogen entry points
  sim/         the simulation. Plain TypeScript — never imports Phaser.
    world.ts     the fixed-timestep tick
    tissue.ts    grows the body cells into blobs with channels between them
    pathogens.ts bacteria: hunt by sight, eat body cells, split in two
    immuneCells.ts  your cells: wander, hunt, swallow, clear up debris
    economy.ts   energy: income, costs, starvation
    openings.ts  turns "a vessel on the left, 30% down" into coordinates
    rng.ts       seeded randomness, so a level always builds the same
  render/      Phaser. Draws what the simulation reports.
    LevelScene.ts  the tissue, the bacteria and the immune cells
    HudScene.ts    energy, cell counts, clock, speed and recruit controls
    shapes.ts      the cell outlines, shared by the map and the HUD
    icons.ts       little pictures of a cell, a macrophage and a bacterium
    palette.ts     colours
```

Two rules keep this tidy as it grows:

1. **`sim/` never imports Phaser.** The simulation can be reasoned about, tested and replayed
   without any rendering. Rendering changes cannot break the game.
2. **The simulation always ticks at a fixed 60Hz.** Speeding up runs more ticks per frame; it
   never makes a tick bigger. So the game behaves identically at 0.5x and 3x.

## Controls

- **Click a macrophage** to pick it up — it gets a ring round it
- **Click the ground** to send it there. It walks there ignoring everything, then goes back
  to hunting on its own
- **+** in the bottom bar opens the recruit menu. Pick a cell, then **click a vessel** — it
  arrives there and has to walk to the fight itself. The energy is only spent once you've
  picked the vessel
- **Escape** — put the cell down, or call off the recruit
- **Space** — pause / unpause
- **1 2 3 4** — pause, 0.5x, 1x, 3x
- Or click the buttons in the bottom right

## Where it's up to

Day 1 of the plan in GAME_DESIGN.md §10 is done — a losable game with no immune
system:

- [x] Vite + TypeScript + Phaser, fixed-timestep loop, pause / slow / fast
- [x] Tissue: ~50 body cells in blobs, vessel openings, the wound
- [x] Energy income ticking from living body cells
- [x] Body cells taking damage, sickening and dying, with the energy hit
- [x] Blue bacteria: arrive in waves through the cut, hunt by sight, eat body
      cells, split in two
- [x] Losing — energy hits zero and the tissue is lost

Day 2 has started. The macrophage is in:

- [x] Macrophages: wander, hunt by sight, swallow a bacterium whole and digest
      it for two seconds, clear away the outlines dead body cells leave behind,
      and pay you for both
- [x] Squeezing through tissue at 40% speed, so the channels are worth using
- [x] Upkeep per cell, and starvation at zero energy — you lose when the energy
      is gone *and* the last cell has starved, or when every body cell is dead
- [x] Click a macrophage to select it, click the ground to send it there
- [x] Starving cells wither away visibly, with a warning and a countdown, rather
      than disappearing without explanation
- [x] Recruiting: pay energy, pick a vessel, the cell walks in from there
- [ ] Click a bacterium to send a cell after that one specifically
- [ ] Neutrophils
- [ ] Waves, reproduction and mutation
- [ ] Narrow vessels as bottlenecks — recruits queue instead of arriving at once
