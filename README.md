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
    levels.ts    tissue layouts, vessel openings, pathogen entry points
  sim/         the simulation. Plain TypeScript — never imports Phaser.
    world.ts     the fixed-timestep tick
    tissue.ts    grows the body cells into blobs with channels between them
    economy.ts   energy: income, costs, starvation
    openings.ts  turns "a vessel on the left, 30% down" into coordinates
    rng.ts       seeded randomness, so a level always builds the same
  render/      Phaser. Draws what the simulation reports.
    LevelScene.ts  the tissue
    HudScene.ts    energy, tissue count, clock, speed controls
    palette.ts     colours
```

Two rules keep this tidy as it grows:

1. **`sim/` never imports Phaser.** The simulation can be reasoned about, tested and replayed
   without any rendering. Rendering changes cannot break the game.
2. **The simulation always ticks at a fixed 60Hz.** Speeding up runs more ticks per frame; it
   never makes a tick bigger. So the game behaves identically at 0.5x and 3x.

## Controls

- **Space** — pause / unpause
- **1 2 3 4** — pause, 0.5x, 1x, 3x
- Or click the buttons in the bottom right

## Where it's up to

Day 1, steps 1–2 of the plan in GAME_DESIGN.md §10:

- [x] Vite + TypeScript + Phaser, fixed-timestep loop, pause / slow / fast
- [x] Tissue: ~50 body cells in blobs, vessel openings, the wound
- [x] Energy income ticking from living body cells
- [x] Body cells taking damage, sickening and dying, with the energy hit
- [x] Blue bacteria: arrive in waves through the cut, hunt by sight, eat body
      cells, split in two
- [x] Losing — energy hits zero and the tissue is lost

Day 1 is done: a losable game with no immune system. Next is Day 2.

- [ ] Neutrophils and macrophages
- [ ] Click to select, click to command
- [ ] The recruit panel
