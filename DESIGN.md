# DESIGN — The psychology of an *honest* dopamine generator

This document is the research-and-evaluation half of the project. It answers:
**what actually makes hyper-casual games feel good, which of those levers are
honest, which are predatory — and what game we should build as a result.**

The product is a **persiflage** (loving parody) of heavily-advertised
hyper-casual games: all of the cheesy dopamine, **none** of the dark patterns,
monetization, or gambling. A game that delivers exactly what its honest ad
promises, and *winks* at the genre's manipulations instead of using them.

---

## 1. What triggers the dopamine (the research)

Pulling from game-feel research, hyper-casual design write-ups, and the
behavioral-psychology literature on compulsion loops, the satisfaction in these
games comes from a small set of levers:

1. **Juice / game feel.** "Juice" is non-functional, exaggerated audio-visual-
   haptic feedback layered on top of a mechanic. It doesn't change the rules; it
   changes the *experience*. Every well-timed action releases dopamine, and the
   more immediate and gratifying the feedback, the stronger the response.
   Screenshake, particles, squash-and-stretch, rising audio pitch, floating
   numbers — this is the single biggest honest lever.

2. **Anticipation > gratification.** Neurologically, dopamine peaks during
   *anticipation* of a reward, not at the moment of receiving it. Games exploit
   this by stretching the "almost there" moment with animations and build-up.

3. **Variable-ratio reward (the powerful, dangerous one).** Random rewards on an
   unpredictable schedule are the most engagement-maximizing reinforcement known
   — and they are the same mechanism as gambling. Loot boxes, random drops,
   "spin to win." **This is the predatory lever. We deliberately do not use it.**

4. **The core loop: PLAY → GET → UPGRADE → next try is bigger.** Numbers go up,
   upgrades make the next run more powerful, progression is always visible.

5. **Flow.** Difficulty tuned to sit just above current skill — not so easy it
   bores, not so hard it frustrates. A light skill/timing element keeps the
   player in the zone and turns mindless tapping into mastery.

6. **Order from chaos / completion.** Bringing order to a mess, completing a
   set, watching a meter fill — closure is intrinsically satisfying.

### Sources
- [The "Juice" Factor: Designing Game Feel — hackread](https://hackread.com/the-juice-factor-designing-game-feel/)
- [Designing Game Feel: A Survey (arXiv)](https://arxiv.org/pdf/2011.09201)
- [Compulsion loop — Wikipedia](https://en.wikipedia.org/wiki/Compulsion_loop)
- [Skinner Box Mechanics and Variable Reward Systems — Medium](https://medium.com/@milijanakomad/product-design-and-psychology-the-mechanism-of-skinner-box-techniques-in-video-game-design-5b7315e2d7b4)
- [Creating Addictive Game Loops — Gametion](https://blog.gametion.com/2024/10/creating-addictive-game-loops-for-engaging-gaming-experiences/)
- [The flow theory applied to game design](https://thinkgamedesign.com/flow-theory-game-design/)

---

## 2. The ethical inversion (what makes this a persiflage, not a clone)

For every predatory pattern, we keep the *feeling* and remove the *exploitation*.
The joke is that the game is rigged **in the player's favor**.

| Predatory pattern (the real genre)        | Our honest parody                                         |
| ----------------------------------------- | --------------------------------------------------------- |
| Loot box / gacha (variable-ratio gamble)  | "Loot box" with full slot-machine fanfare that **always** lands on the jackpot — deterministic, guaranteed |
| Energy / lives that gate play             | A lives counter that just reads **∞**                     |
| "Remove Ads — $4.99"                      | A **"Remove Ads — $0.00 (FREE)"** button; there were never any ads |
| Pay-to-skip timers                        | An instant, free **"Skip (Premium)"** that resolves in 0.2s |
| Premium currency you must buy             | Gems you are **drowning** in, earned by simply playing    |
| FOMO "limited offer"                      | A "SPECIAL OFFER" that just *gives* you things, forever   |
| Manufactured difficulty to sell boosters  | Difficulty tuned for flow, not for frustration-selling    |

**Honesty rule:** everything is earnable by play, instantly, for free. The
core loop is genuinely satisfying on its own (levers 1, 2, 4, 5, 6). We never
use lever 3 (variable-ratio gambling).

---

## 3. The concept we chose

**Working title: `MEGA TAP DELUXE™`** — a cheesy tap/clicker built entirely from
the *honest* dopamine levers.

Why this mechanic survives the screening gates from the planning phase:
- **3-second test:** tap → numbers explode. Instantly legible.
- **Honest-ad test:** real footage *is* the satisfying thing. No lie needed.
- **"One more" test:** combo decay + a near-full Frenzy meter create pull.
- **Solo/AI-buildable:** one self-contained web page, no art/audio assets
  (procedural WebAudio + canvas particles).
- **Parody-able:** the clicker/idle/gacha genre is the most parody-rich corner
  of the whole market.

### Core loop
- A big central **TAP** target. Each tap grants `tapPower × comboMult × goldenBonus`.
- **Combo:** keep tapping within a short window to ramp a combo multiplier; it
  decays if you stop. (Lever 5 — light skill/flow, and lever 2 — anticipation.)
- **Frenzy meter:** fills as you tap. When full it triggers a guaranteed
  **JACKPOT/FRENZY** with full slot-machine spectacle that *always* pays out
  (lever 2's anticipation, with lever 3's gambling removed).
- **Juice everywhere** (lever 1): screenshake scaled to combo, particle bursts,
  floating `+N`, rising audio pitch, squash-and-stretch, color shifts.
- **Store** (lever 4): spend overflowing currency on upgrades that make numbers
  bigger and the juice louder — plus the parody/joke items from the table above.

---

## 4. Test & iteration log

Filled in as we build, self-evaluate against the levers above, and improve.

- **v0.1** — initial build: core tap loop, combos, frenzy/jackpot, parody shop,
  juice (particles/shake/audio/floaters). Headless smoke test added (jsdom).
- **v0.1 — test caught a real bug:** `lastTap` initialized to `0`, so the very
  first tap within ~1.1s of page load (when `performance.now()` is still small)
  wrongly counted as a combo. Fixed by initializing to `-Infinity`.
- **v0.2 — self-evaluation against the research → improvements.** The research
  flags the core weakness of pure clickers: *"addictive but repetitive… lack of
  any additional features or motivations."* My prototype had exactly that gap, so
  as owner I added three principled fixes (not gold-plating):
  1. **Persistence** (localStorage) — progression is now real, not wiped on
     refresh. Strengthens the PLAY→GET→UPGRADE loop (lever 4).
  2. **Offline idle earnings** — a bounded (≤2h), deterministic "welcome back,
     your robots earned X" payout. A reason to return (lever 2) and an on-theme
     parody of idle games. Capped so there's no exploit and no FOMO pressure.
  3. **Milestone celebrations** — legible long-arc goals (levers 4 + 6).
  Test suite expanded to 28 checks, all green, including assertions of the
  ethical guarantees (parody items cost 0; earning is deterministic).
- **v0.3 — game first, joke second (a deliberate philosophy correction).**
  Principle: *there must be a real game, with the parody as seasoning — not a
  parody standing in for a game.* A joke is a first-session delight, never a
  retention mechanic. So this iteration invests in genuine game depth:
  1. **Prestige / Ascension** — reset a run for permanent **Stardust**, which
     grants a deterministic global multiplier (+3% each). This is the proven,
     fully honest long-arc progression engine that clickers retain on.
  2. **Unfolding parody as *content*, not a one-off gag** — new parody items
     (Battle Pass, VIP, Whale Package) **unlock as you ascend**, so the humor
     keeps giving rather than expiring after session one. The jokes now ride on
     top of real progression instead of substituting for it.
  3. **Honest return hooks** — a transparent daily bonus (cooldown-gated, no
     streak guilt, no FOMO).
  4. **Local, privacy-respecting analytics** — sessions/taps/jackpots/prestiges/
     playtime/max-progress stored locally, so retention is *measurable* the
     moment the game reaches real players (validation-ready).
  Test suite now 45 checks, all green.

## 6. THE PIVOT — from clicker to COSMIC MERGE (v0.4)

**Owner's decision.** Goal raised to *top-100 App Store potential*: a genuinely
good, return-to-it game; cheesy/honest take on the over-advertised genres; "too
good to be true" — scratches the itch the ads promise, with no monetization or
dark side. The tap-clicker (now in `archive/tap-clicker/`) is too shallow to
clear that bar: its only real verb is "tap," and prestige deepens *progression*
but not *play*. A clicker doesn't reach the top of the charts on merit.

So the core was pivoted to a **physics merge game** (the Suika lineage), themed
in space (a recurring thread in our discussion).

**Why merge wins for this goal (research-backed):**
- **Accessible + deep** — "understand in seconds, master in hours." Real skill
  and planning, not autopilot. (This is the bar the user set: a game you *play*.)
- **Loop, not arc** — procedurally endless; no hand-authored level treadmill.
  "Games that lean on loops scale; games that lean on arcs burn out studios."
- **Streaming-friendly → organic virality.** Suika blew up on streams with *zero*
  ad spend. For a solo dev who can't outspend studios on user acquisition, this
  is the only realistic route to the charts — and it fits the "honest" thesis:
  the game spreads because it's good, not because of a manipulative funnel.
- **Honest by construction.** Turn-paced, no clock, no energy, no IAP. The only
  randomness is the next-piece (fair game variety, like Tetris) — never sold,
  never gated. Tests assert this: deterministic per seed; only low tiers spawn,
  so a win is always *built*, never handed to you.

The cheesy/parody tone now rides *on top of* a real game (taglines, the cute
emoji bodies, the "no ads, no kidding" game-over screen) instead of *being* the
game — exactly the "game with a joke, not a joke" correction.

### Sources (pivot)
- [Suika Game — Wikipedia](https://en.wikipedia.org/wiki/Suika_Game)
- [History of Suika Game — viral phenomenon](https://fruitmerge.one/game-history)
- [Casual Game Loops Explained — GDevelop](https://gdevelop.io/blog/casual-game-loops)

### Build/test/review log (COSMIC MERGE)
- **v0.4** — built the engine: seedable deterministic physics core (gravity,
  iterative collision solver, contact-merge, scoring, combos, BIG BANG, game-over)
  + a render/input/audio layer. Headless core test (18 checks).
- **review caught two real bugs:** (1) the collision solver separated same-tier
  bodies to *exactly touching* before the merge check, so with a 0.90 overlap
  threshold **nothing ever merged** — fixed to merge on contact (1.02);
  (2) an operator-precedence bug made the drop sound `blip(0,…)` every drop —
  fixed. Also cleaned up best-score persistence (was reading localStorage twice
  per frame).
- **added a jsdom render test (10 checks)** that boots the full DOM/canvas/loop
  and simulates input — this is the layer that hid the drop-sound bug. All 28
  checks green.

## 5. Open question the owner is still chasing

Is the underlying *game* — tap → combo → frenzy → upgrade → ascend — actually
fun enough on its own that someone returns tomorrow **without** the joke? The
joke is differentiation and marketing; it is not the reason to keep playing.
The next real work is validating (and, if needed, deepening) the core loop so it
stands on its own. See README's "Test it" for the instrumentation that makes
that measurable.
