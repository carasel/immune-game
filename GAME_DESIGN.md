# Immune — game design

A 2D game about the immune system. Pathogens invade a cross-section of living tissue;
you command real immune cells to stop them before the tissue dies.

Somewhere between tower defense and real-time strategy: immune cells are **not** towers.
They are autonomous units that hunt on their own, and the player intervenes when it matters.

**Tone:** cute, bright, flat shapes. Inspired by the Kurzgesagt immune system videos.
**Immune cells are real and behave realistically.** Bacteria and viruses are generic.
Parasites are real and named (threadworm, hookworm).

---

## 1. Core loop

1. A level starts with a small tissue, a few immune cells already in place, and an entry
   point where pathogens get in (a cut, a lung surface, the gut wall).
2. Pathogens arrive in waves, and reproduce between waves if they aren't killed.
3. Immune cells wander, spot pathogens within their vision range, and attack on their own.
4. The player selects cells and directs them, spends energy to recruit more, and later
   triggers inflammation and calls in the adaptive immune system.
5. Body cells die. Energy drains. You lose when energy runs out and you have no cells left,
   or when the last body cell dies.
6. You **win** by killing every pathogen once every wave has arrived. The score is how much
   tissue you saved, and how long it took.

The game is a fight against a **death spiral**: dying tissue costs you energy directly *and*
reduces your income, so falling behind accelerates. Recovering means killing pathogens fast
enough that macrophage feeding outpaces tissue loss.

---

## 2. Energy — the heart of the game

Energy is both your currency and your health. It represents the tissue's metabolic budget:
glucose and oxygen delivered by blood to keep cells alive and fight infection.

### Income

| Source | Effect |
| --- | --- |
| Living body cells | steady trickle, proportional to how many are alive |
| Macrophage eats a pathogen | one-off bonus |
| Macrophage eats a dead body cell / debris | smaller one-off bonus |

### Drain

| Source | Effect |
| --- | --- |
| **A body cell dies** | **large one-off hit — this is the main way you lose energy** |
| Living immune cells | small per-second upkeep each (secondary) |
| Inflammation (later) | per-second cost while active in a zone |

A body cell dying therefore hits you three times: the one-off cost, the permanent loss of
its income, and the tissue hole it leaves behind. This is deliberate.

### Starting numbers

The global ones live in `src/content/balance.ts`; each immune cell's own costs and
earnings live beside its other stats in `src/content/cells.ts`. They are the first thing to
tune, and all of them are guesses.

```
startingEnergy            100
incomePerBodyCellPerSec   0.1     # 50 body cells = +5/sec
energyLostPerBodyCellDeath 15     # = 3 seconds of full income
upkeepNeutrophilPerSec    0.2
upkeepMacrophagePerSec    0.4
macrophageEatsPathogen    +10
macrophageEatsDebris      +5
costNeutrophil            30
costMacrophage            60
```

### Running out

Hitting zero is not instant death. At zero energy your immune cells begin **starving** — one
dies every few seconds, visibly, the shortest-lived first. You lose only when energy is at
zero *and* no immune cells remain. This gives a panicky comeback window instead of a sudden game over, and makes the
spiral legible.

**Winning** is clearing the infection: every wave the level had has arrived, and nothing from
them is still alive. Killing the last bacterium on screen while a wave is still to come is a
lull, not a victory — so a level with no waves at all cannot be won, because there was never
an infection to clear. The tissue you have left when it ends is the score.

**Losing all your tissue is the other way to lose**, and that one is immediate. With every
body cell dead there is nothing left to defend and nothing left earning, so the level is over
whatever your energy says. Without this rule a couple of macrophages can farm the bacteria on
a field of corpses forever, banking energy in a game that can no longer be won.

---

## 3. The tissue

- Roughly **50 individual body cells** per level to start, added incrementally later.
- Clustered into natural-looking blobs, not a visible grid.
- Each one can be damaged, infected, and killed independently.
- One fixed screen. No scrolling, no camera controls.
- **Every level has a different layout**, with openings at the sides.

### Openings — where immune cells come from

Each level has **openings at the edges of the screen** through which immune cells enter the
tissue. These are blood vessels: in reality white blood cells squeeze out of the vessel wall
into tissue, which is called extravasation.

- Openings are **generally fairly wide, but some are narrow**, and their number, width and
  placement change per level.
- Recruited cells do **not** appear where you want them. **The player chooses which opening**
  a recruited cell arrives at, and it then has to walk to the fight.
- So a fight far from any opening is much harder to reinforce, and the position of the
  openings relative to the pathogen entry point is a core part of level design.
- Opening width limits **throughput** — how many cells can pour through at once. A narrow
  opening is a bottleneck under pressure.

Pathogen entry is separate from the openings — a cut in the skin, a lung surface, the gut
wall — and is defined per level. **Pathogens do not normally use the side openings.**

*Parked idea:* a late-game level where bacteria arrive through the openings themselves, in the
blood. That is what sepsis is, and it would invert the whole map — the places reinforcements
come from become the threat.

### The gap problem — needs a decision

Two decisions collide here:

- Body cells and immune cells **can't overlap** (bacteria can overlap anything).
- The tissue is a blob of ~50 body cells filling one screen.

Taken literally, immune cells would have almost nowhere to walk. The tissue would be a
solid wall.

**Proposed fix, which is also what really happens:** tissue is not a solid mass. There is
interstitial space between cells, and white blood cells crawl through it by deforming
themselves. So:

- Body cells cluster into blobs with **channels of open space between them**. This is the
  walkable area, and it's also what tissue actually looks like in cross-section.
- Immune cells move freely in the channels.
- Immune cells **can** squeeze through tissue, but at roughly 40% speed.

Squeezing matters for a second reason: because cells are never hard-blocked, "walk toward
the nearest pathogen" can be simple steering. **No pathfinding required**, which saves a
large amount of work.

Open sub-question: should immune cells also block *each other*? Currently assumed yes. It's
a one-line change either way.

---

## 4. Immune cells

### How they behave

Every immune cell is autonomous by default:

- **Wander** randomly when nothing is in range.
- **Seek and attack** the nearest pathogen within vision range. Vision range differs per
  cell type.

### How the player intervenes

- **Click a cell** to select it.
- **Click empty ground** → walk there, **ignoring everything on the way**, until the
  destination is close enough to see. From there a pathogen in sight ends the order and the
  cell goes for it instead. Either way it **resumes wandering** and hunting once the order is
  done with.
- **Click a pathogen** → chase and attack *that specific target*, ignoring closer ones.

A move order ignoring bacteria is what makes it an order rather than a suggestion. If a cell
broke off for anything it passed, a move order would almost never finish while a fight was
on — which is exactly when you need to reposition. Chasing one specific pathogen is the other
order, for when what you want is "kill *that* one".

But an order that stays absolute right up to the last pixel is worse: you send a cell into a
fight and it stands on the spot you clicked with a bacterium under its nose. So the order
holds while the cell is travelling and lets go once it has essentially arrived. "Within vision
range of where it was sent" is the line, which needs no new numbers — a cell that can see its
destination is there as far as the player is concerned.

So a player order is a temporary override, not a permanent mode. Cells always drift back to
doing their own thing.

### Where new cells come from

Recruiting is not placing. You pay energy, and the cell **arrives at one of the level's side
openings** and walks in under its own steam. There is a real travel delay, and it's longer if
the fight is far from an opening.

This means energy is not the only cost of reinforcement — distance is too. It also gives
inflammation a clear job (see §7) and sets up the mast cell perfectly when it lands.

### Roster

Real cells, real behaviour. Unlocked gradually across the campaign so level 1 is simple.

| Cell | Role in the game | Reality it's based on |
| --- | --- | --- |
| **Neutrophil** | cheap, fast, short-lived, and deliberately bad at eating. Its weapons are **degranulation** — spraying poison that hurts pathogens *and* nearby body cells — and, when ordered to die, a **NET** that does the same across a zone | most abundant white blood cell, lives hours. Its granules really are full of poison: defensins, elastase, and myeloperoxidase, which makes bleach. Extracellular traps genuinely harm host tissue |
| **Macrophage** | slow, tanky, long-lived. Eats pathogens and debris — your **income engine**. Later: presents antigen to unlock adaptive immunity | big eater, cleans up dead cells, bridges innate and adaptive immunity |
| **Mast cell** | *deferred — must be accurate when it lands* | releases histamine, makes vessels leaky so immune cells flood in faster; also anti-parasite |
| **Dendritic cell** | samples a pathogen and carries its signature off to learn it — the unit that **triggers adaptive immunity** | the professional antigen-presenting cell |
| **Natural killer cell** | kills infected body cells with no training needed | innate; detects stressed cells |
| **Killer T cell** | kills infected body cells, but only ones matching a **learned colour** | cytotoxic T lymphocyte, needs antigen presentation |
| **Helper T cell** | boosts nearby cells, speeds learning | coordinates the whole response |
| **B cell / plasma cell** | produces **antibodies** — many small entities that tag pathogens so they're easier to eat | antibody factory |
| **Complement** | many tiny always-present entities that punch holes in bacteria and tag them | innate protein cascade |
| **Eosinophil** | anti-parasite specialist — one of the few things that hurts worms | degranulates onto parasites too big to eat |

Cell counts: **2–5 at level start, 10–15 on the battlefield** for the big cells. Antibodies
and complement are deliberately different — hundreds of small cheap entities, rendered as
particles rather than units.

---

## 5. Pathogens

Three families — bacteria, viruses, parasites — that play fundamentally differently, not
just look different.

### Colour

Each family has **6 colours**. Colour is a single axis meaning all of these at once:

- how hard the pathogen is to kill,
- which powers it has,
- and its **antigen signature** — what the adaptive immune system learns.

Colour 1 is easy and simple; colour 6 is nasty with several powers.

*Note:* tier also drives size and spikiness in the placeholder sprites, so difficulty reads at
a glance and isn't lost on a colourblind player. This is a default, not a rule — any pathogen
can override its own size and shape in `pathogens.ts`, so hand-drawn sprites win over the
formula.

### How each family works

**Bacteria** — live in the tissue and multiply in place. Kill body cells directly by contact.
Higher colours get capsules (resist being eaten), toxins (damage at range), biofilms (tougher
when clustered), flagella (fast). Bacteria can overlap each other and swarm.

**Viruses** — cannot do anything alone. A virus enters a body cell, replicates inside, and
after a delay the cell **bursts**, releasing several new viruses. The player's counterplay is
to kill the infected cell *before* it bursts — deliberately destroying your own tissue and
eating the energy cost, to stop something worse. Free-floating virus particles are stopped by
antibodies; infected cells are killed by natural killer cells and killer T cells.

**Parasites** — real ones: **threadworm** and **hookworm**. Big, multicellular, and far too
large to be eaten. They can't be phagocytosed at all — they need eosinophils and antibody
coating. Hookworm attaches to the gut wall and feeds on blood, which **drains energy
directly** — a perfect fit for the energy system.

### Reproduction and mutation

Pathogens left alive between waves reproduce. Each new one has a small chance to **mutate**
to a different colour.

**Proposed rule:** mutation only drifts to an *adjacent* colour, and memory cells give
partial protection against neighbouring colours. This means your hard-won memory degrades
gracefully instead of switching off, and it accidentally models antigenic drift — the reason
the flu vaccine is a yearly guess.

---

## 6. Adaptive immunity

The immune system can **learn a specific colour**.

- **Within a level:** a dendritic cell (later, a macrophage) samples a pathogen and carries
  its signature away. After a delay, cells that need training — killer T cells, B cells
  producing antibodies — become available *against that colour only*.
- **Across levels:** finishing a level can award **memory cells** as a prize. Those persist,
  so a colour you fought before is easier next time. This needs a save file and a metagame
  screen, so it comes late.

The delay is the point. Adaptive immunity is slow, and the innate cells have to hold the
line while it spins up.

---

## 7. Inflammation

A player-ordered ability targeting an area, unlocked after level 1. Costs energy per second
while active. Speeds up immune cells arriving in that zone and slows pathogens.

Because reinforcements now have to walk in from the side openings (§3), inflammation has an
obvious second job: **inflaming an opening widens it**, letting more cells through faster.
That is genuinely what histamine does — it makes vessels leaky so white blood cells can pour
out. It also means the mast cell has a clear, accurate role waiting for it.

Inflammation also happens **automatically** where body cells die, whether the player wants
it or not.

---

## 8. Levels

Each level defines its own tissue shape, **side openings**, pathogen entry point, wave
schedule, and which cells are unlocked. Every level looks different.

Tissue blobs are **placed by hand** per level (`blobs` in `levels.ts`), as fractions of the
area, each with its own size. That's the main level-design tool: putting tissue next to the
wound makes the threat immediate, putting it far from a vessel makes it hard to defend. Leave
`blobs` out and blobs get scattered randomly instead, which is useful for roughing a level out.

- **Level 1 — a cut in the skin.** Bacteria get in through the wound. Neutrophils and
  macrophages only. Wide openings, close to the cut, so reinforcement is forgiving.
- Later levels add colours, then viruses, then both at once (**pneumonia in the lungs** —
  bacteria and viruses together), then the parasite levels.

Difficulty comes from: number of colours in play, wave size and pacing, how much tissue you
start with, which cells you're allowed, and — a lever the openings give us for free — **how
far and how narrow the route from an opening to the fight is**.

---

## 9. Technical architecture

**Stack:** TypeScript + Phaser 3 + Vite.

Three rules that keep this tinkerable for months:

**1. The simulation never imports Phaser.** Game logic is plain TypeScript. Phaser only
draws what the sim reports. Rebalancing and adding pathogens never touches rendering, and
rendering changes can't break the game.

**2. Fixed timestep.** The sim runs at a fixed 60 ticks/second, decoupled from the render
frame. Pause, slow and fast-forward are then just `stepsPerFrame = 0 / 0.5 / 1 / 3`, and
behaviour is identical at every speed. This is much easier to do now than to retrofit.

**3. All content is data.** Every number, cell, pathogen and wave lives in `src/content/`
as commented TypeScript. Adding a pathogen is filling in a data file, not writing code.

```
immune-game/
  src/
    content/           <- design lives here; no engine knowledge needed
      cells.ts           immune cell stats, costs, upkeep, vision, behaviour
      pathogens.ts       families, the 6 colours, powers
      levels.ts          tissue shape, entry points, waves, unlocks
      balance.ts         global dials: energy rates, starvation, speeds
    sim/               <- pure TypeScript, no Phaser
      World.ts           the tick loop
      Tissue.ts          body cells, infection, death
      Actor.ts           immune cells and pathogens
      behaviours/        wander, seekNearest, chaseTarget, infect, ...
      Economy.ts         energy, upkeep, starvation
    render/            <- Phaser only
      LevelScene.ts
      HudScene.ts        separate scene, so UI never fights the game camera
  assets/sprites/      <- drop PNGs here; filename matches the content id
```

### Art pipeline

Everything is drawn as **procedural circles and blobs** to begin with, so the game is
playable with no art at all. Dropping `macrophage.png` into `assets/sprites/` replaces the
placeholder automatically. Art and code never block each other.

---

## 10. Build order

### Weekend prototype

One level: a cut in the skin, one bacterium, two colours. The goal is to find out whether
the core loop is **fun**, not to be complete.

**Day 1 — tissue and economy**
1. Scaffold Vite + TypeScript + Phaser. Fixed-timestep sim loop. Pause / slow / fast buttons.
2. Tissue: ~50 body cells in blobs with channels, plus the side openings, damageable and
   visibly dying.
3. Energy: income from living cells, one-off cost per death, upkeep, starvation, HUD bar.
4. One bacterium: enters through the cut, wanders, kills body cells, reproduces on a timer.

*Milestone: a losable game with no immune system. You sit and watch your tissue rot. If the
death spiral is already tense, the design works.*

**Day 2 — the immune system**
5. Neutrophil and macrophage: wander, seek, attack, die realistically. Macrophages pay.
6. Click-to-select, click-to-move, click-to-attack, with the resume-wandering rule.
7. Recruit panel: choose a cell type, pay energy, cell walks in from a side opening.
8. Waves, reproduction, and mutation.
9. Tune the numbers in `balance.ts` until it feels right. This is most of the fun.

### After that, roughly in order

Inflammation → remaining bacteria colours → **degranulation and NETs** → viruses and infected
cells → natural killer cells → dendritic cells and adaptive immunity within a level →
antibodies and complement as particle swarms → mast cell (accurately) → memory cells, save
file and campaign → eosinophils → threadworm and hookworm levels.

Degranulation and NETs are the same idea at two scales, and they are what the neutrophil is
*for* — it is bad at eating on purpose so that these carry it. Both hurt your own tissue,
which is the interesting part: a player who panics and blankets a fight in poison pays for it
in dead body cells, and that is exactly what happens in a real infection.

---

## 11. Open questions

- Do bacteria collide with anything at all, or pass through everything?
- Does a wave arrive on a timer, or when the previous wave is cleared?
- What does the mast cell do mechanically? Must be biologically accurate. (Inflaming an
  opening to widen it is the obvious accurate fit — see §7.)
- Is there a lymph node / off-screen space where adaptive immunity spins up, or does it all
  happen on the visible tissue?

---

## 12. Decisions made

*2026-08-05*

- Immune cells are autonomous units, not towers. Player orders are temporary overrides.
- Energy is currency and health. **Body cell death is the main energy drain**, with small
  per-cell upkeep as a secondary drain.
- Running out of energy starves cells gradually rather than ending the game instantly.
- Colour is one single axis: difficulty, powers, and antigen signature are the same thing.
- 6 colours × 3 families, added incrementally rather than up front.
- One fixed screen, ~50 body cells, added incrementally.
- Bacteria overlap freely; immune cells and body cells are solid.
- Mutation drifts only to an **adjacent** colour; memory partially covers neighbours.
- Tier drives placeholder sprite size and spikiness, **overridable per pathogen** once real
  sprites are drawn.
- Every level has a different layout with **openings at the sides** — blood vessels — that
  recruited immune cells walk in through. Mostly wide, some narrow. Reinforcement costs
  distance as well as energy.
- **The player picks which opening** a recruited cell arrives at.
- Pathogens don't normally use the openings; the sepsis level is parked as a later idea.
- Mast cell deferred until it fits naturally.
- Simulation is separate from Phaser; fixed timestep; all content in data files.

*2026-08-08*

- Macrophages are **large and yellow**, always pointing their narrow end where they are
  going. That is what a crawling white blood cell really looks like: it reaches forward with
  a thin edge and drags its bulk along behind. Closer to an egg than a pear in the end, which
  is the look we were after — `nose` and `belly` in `cells.ts` tune it.
- **Eating takes time.** A macrophage swallows a bacterium whole — it stops being a threat
  immediately — then spends two seconds digesting, unable to move or hunt, with the meal
  visible inside it. So a swarm can walk straight past a macrophage that is busy, and that is
  the macrophage's whole weakness.
- The energy for a meal arrives when the meal is **finished**, not when it starts.
- **Debris is the outline a dead body cell leaves behind.** A dying cell fades away but its
  outline stays, and a macrophage has to come and clear it up for a smaller bonus. Nothing
  new to draw, and the mess is visible until someone deals with it.
- **Pathogens first, debris second.** An infection won't wait; the mess will.
- Level 1 starts with **2 macrophages**, placed in the open channels.
- **Energy floors at zero** rather than going negative. Zero is a state you fight your way
  out of — cells starving one at a time — not a hole to refill before anything good can
  happen.
- Losing is now **zero energy AND no immune cells left**, with one cell starving every 4
  seconds until then.
- **Losing every body cell is also a loss**, and an immediate one. Otherwise macrophages farm
  the bacteria on dead tissue forever and the level never ends.
- **A move order is absolute while the cell is travelling**, and lets go once the destination
  is within vision range: from there, a pathogen in sight ends the order. Crossing the map is
  still one decision rather than a series of distractions, but a cell sent into a fight fights
  instead of standing on its spot.
- *Why it works that way:* the first version held the order right to the last pixel, and
  **fiddling lost you the game**. Ordering everything to the cut once won the level, but
  re-ordering them to that same spot every few seconds lost it, because each new order
  stopped them eating. A 9-year-old poking at his macrophages during a fight would have lost
  and never known why. With the new rule all three ways of playing it win within two seconds
  of each other, and leaving the level alone still loses. Both are tests now.
- **One cell selected at a time**, for now. Box selection can come when there are enough cells
  on screen to need it.
- **The only mouse controls are left-click and double-click.** The right button does nothing,
  and the browser menu is switched off over the game so a mis-click doesn't cover it.
- **You win by clearing the infection** — all waves arrived, nothing left alive — and the
  banner says how much tissue you saved. Losing is checked first, because tissue with nothing
  alive left in it has not been saved by the infection also being over.
- **Level 1 is winnable on the cells you start with, but only if you play it.** Send all three
  to the cut at the start and they meet each wave as it arrives: won at 2:14 with 43 of 50
  body cells, nothing recruited. Left alone the tissue is gone by 1:56. That gap between the
  two is the level doing its job.
- **Starting cells can be placed by hand** (`at` in a level's `startingCells`, as fractions of
  the area, like the blobs). Level 1 puts its neutrophil in the far corner by the narrow
  vessel, 562px from the wound against the macrophages' 280 and 402. The fastest cell starts
  furthest from the trouble, so you have to notice it and send it, and it spends a fifth of
  its 90-second life just walking. Moving it there cost about 4 body cells in a good game and
  cut the do-nothing loss from 3:44 to 1:56 — early kills matter enormously when the thing
  you are killing doubles every 20 seconds.
- **Camping the wound is the strong move**, because bacteria are at their most killable in the
  second they arrive, before they have spread out and started dividing. Worth knowing when
  designing later levels: an entry point the player can physically cover is a much softer
  level than one they cannot.
- **Recruiting is two clicks: pick the cell, then pick the vessel.** The energy is spent on
  the second one, so changing your mind costs nothing, and you have to look at the map before
  you can reinforce. Every vessel lights up while you choose.
- A recruit **is not given an order** when it arrives — it hunts and wanders like any other
  cell. Walking it in automatically would mean walking it past bacteria, because a move order
  ignores everything.
- **Vessel width does nothing yet.** Recruits arrive at once rather than queueing. Making a
  narrow vessel a real bottleneck is worth doing once we know the fights need it.
- The HUD is **one line of symbols**: a lightning bolt for energy, and little pictures of a
  body cell, a macrophage and a bacterium instead of their names. The pictures are drawn by
  the same code and content as the real things (`render/shapes.ts`, `render/icons.ts`), so
  they can't drift apart. Recruiting is a single **+** button that opens a floating menu,
  which is where the names and costs live — words cost height, pictures don't.
- **Neutrophils are small, orange and spiky**, and fast enough (34) to run a bacterium (24)
  down, which a macrophage (16) never can.
- **A neutrophil lives 90 seconds** and then dies of old age wherever it stands. That single
  number is what makes it a different cell from the macrophage rather than a cheap one.
- It earns **4** for a bacterium against the macrophage's 10, and does **no clearing up** —
  leave a cell's debris stats out in `cells.ts` and it walks past the mess. So a neutrophil
  never pays for itself: it is what you spend energy on to win a fight now.
- It is also **twice as slow to digest** (4 seconds against 2). It catches things a macrophage
  never could and then stands there useless while it deals with them. Eating is deliberately
  the thing a neutrophil is worst at, because its real weapons are still to come.
- Dead neutrophils **fade away** rather than leaving a husk. Pus really is mostly dead
  neutrophils and macrophages really do clear them up, so this is worth revisiting.
- **Degranulation.** A neutrophil throws a purple granule at the nearest thing it can see,
  one every 5 seconds, out to its vision range. It kills a blue bacterium outright and hurts
  one of your own body cells by a sixth — six strays and you have killed it yourself, and it
  costs you the death charge like any other. Aim is not the point; being near the fight is.
- **It is a reflex, not an action:** granules keep coming while the cell is digesting, under
  orders, anything. That is what makes a neutrophil's four slow seconds of eating bearable,
  and it is why the cell is allowed to be bad at eating.
- **Poisoning something pays nothing.** Only eating pays. So degranulation kills without
  feeding you, which keeps the macrophage the income engine even when the neutrophil is doing
  the killing.
- **NETs.** Double-click a neutrophil and it tears itself apart, throwing its own DNA out as a
  web 90px across that lasts 8 seconds. The two clicks have to be on the same cell and within
  a third of a second: a click here and a click there never add up to killing one, and a
  hesitant double-click just selects it twice. Bacteria in it are **held still** — they can neither
  swim nor eat — and poisoned at 1.5 a second, so a blue one dies in about two. The cell does
  not survive it. That is not a game-balance compromise either: it is called NETosis and the
  cell really does destroy itself doing it.
- **The web costs your tissue 80% of a body cell, once, as it lands.** A healthy cell survives
  on a sliver; one already being chewed on dies. Deliberately a single hit rather than a drain,
  so a NET wrecks the place it lands on without dissolving it — and it leaves a ring of cells
  on 20% health that the next bacterium will finish off.
- *Measured on level 1:* a NET dropped into 8 bacteria killed all 8 and cost one body cell.
  Dropped into a swarm of 20 it killed 16 and cost about three cells' worth of damage. That is
  the shape we want — a swarm-breaker you pay real tissue for, not a free button.
- *Measured on level 1:* a neutrophil throws about 9 granules in its 90-second life, kills
  4 or 5 bacteria with them, and hits your own tissue twice — a third of one body cell. Adding
  it made the level faster to win and cheaper in tissue (2:14 and 43 cells → 1:56 and 45).
  The friendly fire is currently a warning shot rather than a real cost; `everySeconds` is the
  dial if it should bite harder.
- Level 1 starts with **2 macrophages and 1 neutrophil**, and the neutrophil dies of old age
  before the third wave — which is how you learn what it is.
- **Starvation takes whoever has least life left**, so neutrophils go before macrophages, and
  the nearly-spent neutrophil before the fresh one. Between cells that would both have lived
  for ever it is still the oldest. Taking your income engine first was backwards in both
  directions: neutrophils are the disposable ones, and losing the expensive cell first while
  bankrupt is the cruellest possible order.
- **Starving has to be seen to happen.** A cell dying at zero energy withers away over a
  second instead of vanishing, and the HUD blinks a warning with a countdown to the next one
  while it is happening. Playtested as a bug — a macrophage disappearing with no explanation
  reads as the game taking one off you, not as the price of going broke.
- Immune cells **do** block each other (`immuneCellsBlockEachOther` in balance.ts, so it
  really was a one-line change).
