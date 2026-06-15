# 🌌 COSMIC MERGE

A physics **merge game** (the *Suika / watermelon-game* lineage), themed in space:
drop and merge celestial bodies — **asteroid → comet → moon → planet → ringed
planet → dwarf star → star → galaxy → black hole** — and merge two black holes
to trigger a **BIG BANG** that clears the board for a huge bonus.

> **No ads. No in-app purchases. No energy/lives timers. No loot-box gambling.
> No catch. Just merge.**

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
| `test/`               | Headless core test + jsdom render test                   |
| `GOAL.md`             | The project's goal and concept (the "why")               |
| `DESIGN.md`           | Research, the design rationale, and the iteration log    |
| `archive/tap-clicker` | An earlier experiment, kept for reference                |

---

*What this game is trying to be, and why, lives in [GOAL.md](GOAL.md); the
full research and design log is in [DESIGN.md](DESIGN.md).*
