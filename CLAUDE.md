# CLAUDE.md — working notes for any Claude session on this repo

This file is shared context for **both** ways this project is developed:
- a **local** Claude Code session (has a real browser / Playwright / MCP), and
- a **web/mobile** Claude Code session (ephemeral container, no browser).

Read it at the start of every session. Keep it updated when conventions change.

## What this is
**COSMIC MERGE** — a physics merge game (Suika lineage) themed in space. Plain
static web app: `index.html` + `merge.css` + `merge.js`. No build step, no
framework. Deployed to GitHub Pages on every push to `main`.

- Goal & concept: [GOAL.md](GOAL.md)
- Research / iteration log: [DESIGN.md](DESIGN.md)
- **Visual design rules (READ before touching UI/art): [docs/DESIGN-TELLS.md](docs/DESIGN-TELLS.md)**

## Commands
- `npm test` — physics-core tests + jsdom render smoke test (keep green).
- `npm run play` — headless bot plays N rounds; prints balance stats.
- `npm run preview` — renders the body shader to `tools/preview.png` (offline art check).
- `npm run scene` — renders an in-game field to `tools/scene.png`.
- `npm start` — serve at http://localhost:8080.

## Architecture (one file: merge.js)
- **Headless core** (top of file, DOM-free, deterministic per seed): physics,
  merges, scoring, game-over, BIG BANG. Exported on `window.__cosmic` / module.
- **Procedural art**: `shadeBody(tier, nx, ny)` — a PURE pixel shader shared by
  the in-game sprite baker AND the offline preview/scene tools, so previews are
  faithful. Bodies are baked to sprites once and blitted. No emoji.
- **Presentation** (after `if (typeof document === 'undefined') return;`):
  sprite baking, render loop, input, audio, juice. Guarded so headless tests pass.

## "Eyes" (how to see the result)
- **Local session:** use the real browser (Playwright/MCP) — fullest fidelity, incl. motion.
- **Web/mobile session:** offline renders (`preview`/`scene`) for art; the
  **Screenshots** CI (`.github/workflows/shots.yml`) renders the REAL page in
  headless Chromium and commits PNGs to `screenshots/` — `git pull` then read them.
- For motion/feel, a human screen-recording is still the ground truth.

## Two-session sync (IMPORTANT)
Git is the ONLY shared state — there is no live shared filesystem.
- **Start of every session: `git pull` (or for web, it clones fresh — already latest).**
- Commit small and often; **push before you stop.** The web container is
  ephemeral — unpushed work is lost when it's reclaimed.
- Don't edit the same files from both sessions at once. Finish + push one side
  before switching. For larger parallel work, use a feature branch + PR.
- Default branch: `main`. Develop on `main` for fast solo iteration.

## House rules
- Keep `npm test` green; add a test when you add core behavior.
- Don't reintroduce emoji as game/UI iconography (see DESIGN-TELLS).
- `tools/*.png` is gitignored; `screenshots/*.png` is committed by CI on purpose.
