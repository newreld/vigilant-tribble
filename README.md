# MEGA TAP DELUXE™

A **loving parody of heavily-advertised hyper-casual games** — all of the cheesy
dopamine, **none** of the dark patterns. It delivers exactly what an honest ad
would show (tap → numbers explode), and it *winks* at the genre's manipulations
instead of using them. The whole thing is rigged **in the player's favor**.

This is a research-driven prototype. The "what makes it feel good and why we
stripped the predatory parts" write-up lives in [DESIGN.md](DESIGN.md).

## What it is

**Design principle: it's a *game* with a joke on top — not a joke pretending to
be a game.** The parody is differentiation and marketing; the reason to keep
playing is the underlying loop. A juicy tap/clicker built only from the *honest*
dopamine levers:

- **Game feel / juice** — screenshake, particles, squash-and-stretch, floating
  numbers, and rising audio pitch, all scaled to your combo.
- **Combos** — a light timing/skill layer (deterministic, no luck).
- **Frenzy meter** — fills as you tap toward a **guaranteed** jackpot.
- **Prestige / Ascension** — reset a run for permanent **Stardust** multipliers;
  the honest long-arc progression that gives a reason to return.
- **Milestones** + **persistent progression** + **idle "welcome back" earnings**
  + a no-guilt **daily bonus**.
- **Local analytics** — sessions/taps/playtime tracked on-device so retention is
  measurable (no servers, no tracking, nothing leaves your browser).

### The persiflage (parody of dark patterns)

Everything is free and earned by play. Specifically:

- 🎁 **"Legendary Loot Box"** — full slot-machine fanfare that **always** lands
  on 7-7-7. No gambling; the reward is deterministic.
- 🚫 **"Remove Ads — $0.00"** — there were never any ads.
- ⏩ **"Skip Timer (Premium)"** — instant and free; there was no timer.
- 💎 Gems and ❤️ lives both just read **∞**.
- 🎁 A "SPECIAL LIMITED OFFER" that simply *gives* you coins, forever.

**No monetization. No real-money anything. No variable-ratio (gambling) rewards.**

## Run it

It's a static site — open `index.html` in a browser, or serve it:

```bash
npm start     # serves on http://localhost:8080
```

## Test it

A headless smoke test loads the real game into a simulated DOM and exercises the
core loop (earning, combos, the deterministic golden tap, frenzy/jackpot,
number formatting, the shop, persistence, offline earnings, and milestones).
It also asserts the **ethical guarantees** (parody items cost 0; identical play
yields identical coins — i.e. earning is deterministic, not a gamble).

```bash
npm install   # installs jsdom (dev only)
npm test
```

## Files

| File                  | Purpose                                            |
| --------------------- | -------------------------------------------------- |
| `index.html`          | Structure / UI                                     |
| `style.css`           | Cheesy hyper-casual styling + animations           |
| `game.js`             | Game logic, juice, procedural audio, parody shop   |
| `DESIGN.md`           | The psychology research + design rationale + log   |
| `test/smoke.test.js`  | Headless smoke test (jsdom)                         |
