# 🌌 COSMIC MERGE

A physics **merge game** (the *Suika / watermelon-game* lineage), themed in space:
drop and merge celestial bodies — **asteroid → comet → moon → planet → ringed
planet → dwarf star → star → galaxy → black hole** — and merge two black holes
to trigger a **BIG BANG** that clears the board for a huge bonus.

It's the **"too good to be true"** version of the games whose ads overpromise:
it actually delivers the satisfying thing (chunky physics merges, the "one more
run" pull, a high-score chase) and there is **no catch** —

> **No ads. No in-app purchases. No energy/lives timers. No loot-box gambling.
> No catch. Just merge.**

## Why this game

Picked deliberately for *top-100 potential as a solo build*. Suika Game proved
the formula: **"understand in seconds, master in hours,"** physics-satisfying,
low-pressure, cute and non-threatening — and it went viral on streams with
**zero ad spend**, which is the only realistic path to the charts without a
marketing budget. It's also loop-based, not content-based, so it doesn't need
hundreds of hand-authored levels to stay fresh. Full rationale and the
psychology research are in [DESIGN.md](DESIGN.md).

## How to play

- **Move** your piece with the mouse / finger (or ← →).
- **Drop** it by clicking / tapping (or Space / ↓).
- Two of the **same** body that touch **merge** into the next one up.
- Don't let the pile rest above the **danger line** for too long.
- Chain merges for **combo** multipliers. Merge two black holes for the BIG BANG.

It's turn-paced and calm — no clock, no rush. Play a 5-minute round or chase a
new best.

## Run it

Static site — open `index.html`, or serve it:

```bash
npm start        # http://localhost:8080
```

## Test it

```bash
npm install      # jsdom (dev only)
npm test         # physics-core tests + DOM/render smoke test
```

- `test/cosmic.test.js` — drives the **DOM-free simulation core** deterministically:
  gravity, walls, merging, scoring, the max-tier rule, BIG BANG, game-over
  detection, and the fairness guarantees (deterministic per seed; you only ever
  spawn low tiers, so a win is always *built*, never handed to you).
- `test/render.test.js` — boots the **full game** (canvas/input/render loop) in
  jsdom and asserts input, frames, merges, the HUD, and the game-over overlay
  all run without throwing.

## Files

| File                  | Purpose                                                  |
| --------------------- | -------------------------------------------------------- |
| `index.html`          | Structure / HUD / game-over overlay                      |
| `merge.css`           | Calm space theme + UI                                    |
| `merge.js`            | Engine: testable physics core + render/input/audio layer |
| `DESIGN.md`           | Research, the pivot rationale, and the iteration log     |
| `test/`               | Headless core test + jsdom render test                   |
| `archive/tap-clicker` | An earlier experiment (an honest-dopamine *clicker*); kept for reference — too shallow for the top-100 goal, which is why we pivoted to merge. |
