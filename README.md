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
npm run check       # types + tests. The one to run constantly
npm run verify      # types + tests + production build. The one to run before committing
```

Those two are the whole verification story — if `verify` passes, everything is fine. The
pieces are still there on their own if you want them:

```bash
npm test            # run the tests once
npm run test:watch  # re-run them as you edit
npm run typecheck   # check the types without building
npm run build       # typecheck + production build into dist/
```

To poke at the simulation — how long a level lasts, what a number does, whether an idea
works — write it in `scratch/explore.ts` and run it. It can import from `src/` exactly the
way the game does, there is no browser involved, and the folder is gitignored:

```bash
npm run explore
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
    granules.ts  the poison neutrophils throw, and what it lands on
    nets.ts      the webs they leave behind when they tear themselves apart
    economy.ts   energy: income, costs, starvation
    openings.ts  turns "a vessel on the left, 30% down" into coordinates
    rng.ts       seeded randomness, so a level always builds the same
  render/      Phaser. Draws what the simulation reports.
    MenuScene.ts   the level select: one card per level, with a little map
    LevelScene.ts  the tissue, the bacteria and the immune cells, and how it ends
    HudScene.ts    energy, cell counts, clock, speed and recruit controls
    levelMap.ts    shrinks a level's real layout down for the select screen
    shapes.ts      the cell outlines, shared by the map and the HUD
    icons.ts       little pictures of a cell, a macrophage and a bacterium
    palette.ts     colours
tests/           run with `npm run check`. No Phaser, no browser — just the rules.
  helpers.ts       building a world to test, and running it for a few seconds
  economy.ts       … and one file per thing worth not breaking
tools/
  explore.mjs      runs scratch/explore.ts through Vite, so it can import from src/
scratch/         gitignored. Throwaway scripts for `npm run explore`
```

Two rules keep this tidy as it grows:

1. **`sim/` never imports Phaser.** The simulation can be reasoned about, tested and replayed
   without any rendering. Rendering changes cannot break the game.
2. **The simulation always ticks at a fixed 60Hz.** Speeding up runs more ticks per frame; it
   never makes a tick bigger. So the game behaves identically at 0.5x and 3x.

Rule 1 is what makes the tests easy: they build a world, run it for a few seconds and check
what happened, with no browser anywhere. Two of them play level 1 all the way through and
bracket it: left alone it should lose the tissue, and sending everything to the cut should win
it. They are canaries for balance, since a change that has nothing to do with balance can
still quietly make the game easier or harder.

## Controls

- **Pick a level** on the first screen. Each card shows the level's real layout, shrunk —
  where the tissue is, where the vessels are, where the wound is
- When a level ends, **Try again** or **Choose level**
- **Click a macrophage** to pick it up — it gets a ring round it
- **Click the ground** to send it there. It ignores everything on the way, but once it is
  nearly there it will break off for any bacterium it can see, then go back to hunting on
  its own
- **Click a bacterium** to send it after that one specifically. It gets a red ring, and the
  cell walks past easier targets until it has eaten it
- **Double-click a neutrophil** to set off a NET. It tears itself apart into a sticky web that
  holds bacteria still and poisons them — and takes most of the health off your own body cells
  underneath. The neutrophil does not survive it
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
- [x] Neutrophils: small, orange, spiky and fast, dead of old age in 90 seconds
- [x] Degranulation: neutrophils throw purple poison that kills bacteria and
      hurts your own tissue when it misses
- [x] NETs: right-click a neutrophil and it dies to leave a web that traps and
      poisons everything in it, yours included
- [x] Winning — clear every wave and the tissue is saved
- [x] Click a bacterium to send a cell after that one specifically
- [x] Mutation: a dividing bacterium can come out one colour along the ladder,
      which is the only way yellow and red ever appear
- [x] Cocci: clumps of balls stuck together, taken apart one ball at a time —
      slow, tough, and as many balls as their colour is far up the ladder
- [x] Level 2, the graze: two shallow scratches instead of one deep cut, both
      vessels far from both of them, and cocci coming in through them
- [x] The rest of the colour ladder — green runs away from immune cells, orange
      is faster again, purple hits harder again, in both shapes. A green rod
      drops its dinner to run and no macrophage can catch it; a green clump is
      too slow for that and stays to eat instead

Left on the Day 2 list:

- [ ] Tuning the numbers until it feels right — the last and best bit
- [ ] Deciding how a player is ever supposed to *meet* green. Mutation drifts
      one step at a time, up as often as down, at 1 division in 10 — so blue to
      green is about 90 divisions of one unbroken lineage. Half an hour of
      fighting. Either `mutationChance` goes up, or a level sends something
      other than blue

After that, and not part of Day 2:

- [ ] Narrow vessels as bottlenecks — recruits queue instead of arriving at once
