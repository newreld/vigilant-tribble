# DESIGN TELLS — How to Not Look AI-Generated

A working brief for **COSMIC MERGE**. The owner called the current UI "stereotypical Claude design." This document is why that happens and exactly how to fix it. Skim it; use it.

> Reality check: our current `merge.css` is a textbook specimen. Space Grotesk (flagged as overused *even in Anthropic's own frontend cookbook*), glassmorphism HUD boxes (`backdrop-filter: blur`), neon cyan + gold on dark navy, glowing `text-shadow` everywhere, perfectly symmetric centered HUD, a glassy rounded-20px game-over modal, and a "Just merge" tagline footer. We are the cliché. The good news: it's all fixable.

---

## 1. THE TELLS — patterns that scream "AI-generated"

Each line: the tell, then *why* it reads as AI.

**Color**
- **Indigo/violet → blue gradients (`#6366f1`, `bg-indigo-500`, "purple-to-blue everything").** The single biggest tell. Tailwind shipped `indigo-500` as its default button color; every tutorial copied it; AI trained on the result. Adam Wathan (Tailwind's creator) literally apologized for it in 2025.
- **Purple/violet gradient on a white background.** Called out by name in Anthropic's cookbook as the thing to avoid.
- **Neon-on-dark-navy with one cyan + one magenta accent.** The "default dark mode." Reads as AI because it's the safe high-contrast pick with zero point of view. *(This is us.)*
- **Timid, evenly-distributed palettes** — slate gray + off-white + one accent, all at similar saturation. No dominant color, no commitment.
- **Gradient-filled text on numbers/metrics** ("gradient pipeline bars," glowing stat values). Decoration faking sophistication.

**Type**
- **Inter / Roboto / Open Sans / system-ui on everything.** The statistical center of "modern sans." Invisible because it's everywhere.
- **Space Grotesk as the "I tried" font.** It's the *first* font the model reaches for when told to be distinctive — which makes it the new tell. *(This is us.)*
- **No real hierarchy:** body 16, heading 24 — a 1.5x jump. Looks flat and templated.
- **Uppercase eyebrow labels with wide letter-spacing** ("MARCH SNAPSHOT," "SCORE"). The default way AI fakes editorial polish. *(This is us — every HUD label.)*

**Layout / structure**
- **Centered single-column hero, perfect symmetry.** No tension, no focal asymmetry — the layout has no opinion.
- **Three-column feature-card grid** as the reflexive second section.
- **Bento grids / 2×2 metric-card layouts** as the first instinct for any dashboard.
- **Over-even spacing** — everything on a rigid 8px rhythm with identical gaps, so nothing has emphasis.
- **Rounded-2xl cards (16–32px radius) with soft drop shadows**, floating on the background. The "default card."

**Surface / effect**
- **Glassmorphism / `backdrop-filter: blur` panels** as the default visual language. Frosted glass to imply depth it didn't earn. *(This is us — HUD boxes + game-over modal.)*
- **Glow / `text-shadow` haze on text and borders.** Neon bloom standing in for craft. *(This is us.)*
- **Gradient-filled pill buttons** with full border-radius. The default CTA.
- **Big soft shadows** (`0 24px 80px`) — drama with no structural reason. *(This is us.)*

**Copy / chrome**
- **Emoji as iconography and bullets** (✨🚀🌟 in headings, ✓ as list markers). Instant "generated" signal.
- **"✨ tagline ✨" copy** — vague, breathless, value-free ("Just merge," "Reimagine your workflow").
- **Decorative copy explaining the UI** ("no watch-an-ad-to-continue…"). The interface narrating itself.

**Motion**
- **Bouncy/elastic easing on everything** (`cubic-bezier(...1.3)` overshoot), generic fade-up-on-load, scattered hover micro-interactions with no orchestration. *(Our game-over `pop` overshoots.)*

---

## 2. WHY IT HAPPENS

- **Training toward the popular and safe.** Models predict the *most probable* design, not the most *intentional* one. The probable center is Tailwind defaults + Dribbble trends. This is "distributional convergence" — regression to the mean of the internet.
- **The Tailwind indigo seed.** One default color (`indigo-500`) propagated through millions of tutorials and repos into training data, then back out into generated sites, then back into training data. A feedback loop tightening on itself.
- **No brand constraint = no decisions.** Given a vague prompt ("modern space game UI"), the model has nothing to anchor to, so it samples the high-probability defaults. Generic in, generic out.
- **Risk aversion / no point of view.** Safe choices never look *bad*, so they're the local optimum. But "not bad" and "memorable" are different targets. Distinctive design requires committing to something that could be wrong.
- **Speed over uniqueness.** Fast output needs few decisions; uniqueness *is* decisions. When you optimize for "ship a UI now," variety is the first casualty.

---

## 3. DO-INSTEAD BRIEFING

Principles that make a UI look authored, not generated.

1. **Pick a distinctive type pairing and commit.** High contrast wins: a display/character face for the wordmark + a clean workhorse for UI, or a serif/geometric-sans mix. Avoid Inter, Roboto, Open Sans, **and Space Grotesk**. Candidates worth auditioning: *Fraunces, Bricolage Grotesque, Clash Display, Cabinet Grotesk, Newsreader, IBM Plex, Instrument Serif.*
2. **Build a real type scale.** Use extremes — 100/200 weights against 800/900, size jumps of 3x+ (not 1.5x). One element should clearly dominate. Tabular numerals for scores.
3. **Derive the palette from a concrete real-world reference, not "purple."** Pick a *thing* and sample it: a specific NASA Hubble/JWST plate, a vintage sci-fi paperback cover, a Voyager Golden Record, a planetarium poster, a 1970s NASA mission patch. Commit to one dominant color + sharp accents — not three timid pastels.
4. **Use intentional asymmetry on a real grid.** Off-center focal points, deliberate negative space, varied (not uniform) spacing so emphasis exists. A grid you can break on purpose beats perfect symmetry.
5. **Have ONE signature motif and repeat it.** A single recurring idea — an orbital ring, a specific star-shape, a halftone-dot treatment, a custom corner cut — used consistently is what people remember. Pick one and make it the brand.
6. **Add texture: grain, noise, print artifacts.** A subtle film-grain/noise overlay, paper texture, or print-misregistration instantly de-digitizes a UI. Flat gradients read as AI; matter reads as human.
7. **Give motion a personality, and orchestrate it.** One well-staged page-load with staggered reveals beats scattered hovers. Pick an easing *character* (snappy and mechanical, or heavy and weighty) and apply it everywhere. Kill the default elastic overshoot.
8. **Practice restraint.** Drop glassmorphism, glow haze, and big soft shadows as decoration. Smaller radii (8–12px), 1px solid borders, shadows under `0 2px 8px`. Honesty (Linear/Stripe/Raycast) reads as taste; visual desperation reads as AI.
9. **Steal from a named real-world movement.** Anchor the look to something with history: Swiss/International Typographic, mid-century NASA, Soviet space-race constructivism, 70s sci-fi pulp, Memphis, brutalism, retro-futurism. A named reference gives the model (and you) constraints to honor.

---

## 4. GAME-SPECIFIC CHECKLIST — COSMIC MERGE

Pick **one** strong direction first. Recommended: **mid-century / 1970s NASA-poster space**, or **retro sci-fi pulp**. Both give a concrete, non-default palette and a motif. The checklist below assumes a committed direction.

### Color palette
- **AVOID:** the current neon cyan (`#6fe6ff`) + gold (`#ffd86b`) + hot-pink (`#ff5d8f`) on deep navy. That trio *is* the default-dark-mode space look.
- **DO:** derive from a real reference. E.g. a JWST/Hubble nebula gives deep aubergine + warm amber + dusty teal + soft coral — richer and stranger than neon-on-navy. Or go NASA-poster: cream paper, brick-red, ochre, deep teal. Commit to ONE dominant + 1–2 accents. Lower the saturation; let the canvas planets carry the color.

### Typography
- **AVOID:** Space Grotesk (current). It's the AI "distinctive" default.
- **DO:** wordmark in a face with character (e.g. a condensed display, a retro-futurist face, or a warm serif like Fraunces/Instrument Serif); UI/numbers in a clean neutral (IBM Plex Sans/Mono, or a grotesk that *isn't* Space Grotesk). Big weight + size contrast between the wordmark and HUD. Keep tabular numerals for SCORE/BEST.

### HUD layout
- **AVOID:** three identical glassmorphism pill-boxes (`backdrop-filter: blur`) evenly spaced across the top; uppercase wide-tracked labels on each. That's the templated metric-card row.
- **DO:** kill the blur. Use solid or near-solid panels, or no panels at all — let stats sit directly on the starfield with a clear hierarchy (score huge and dominant, best/next small and secondary). Break symmetry: anchor the wordmark hard-left, cluster stats right, vary their sizes. One label style, used sparingly.

### Celestial-body art style (the merge pieces)
- **AVOID:** generic glowing gradient circles with bloom — the default "planet." This is where the game lives or dies; make it the signature.
- **DO:** commit to ONE rendering language and scale it across the 11 bodies — e.g. flat mid-century vector planets with banded rings and grain; OR halftone/risograph-textured spheres; OR detailed pixel-art celestial bodies. Give each tier a distinct silhouette and color so they're readable at a glance, not just "bigger glowing ball." Texture (grain/banding/craters) is what stops them reading as CSS gradients. This is the #1 brand surface.

### Buttons
- **AVOID:** the gradient-filled cyan pill with neon glow and 13px radius (current `#restart`).
- **DO:** solid fill in a brand accent, 8–10px radius (not full pill), 1px border or a flat chunky drop (a hard offset shadow fits a retro/game feel better than a soft glow). One clear primary action. Snappy press, no elastic overshoot.

### Game-over screen
- **AVOID:** the frosted-glass blur backdrop + 20px-radius gradient card + giant soft shadow + glowing gold score + "★ NEW BEST ★" emoji-star + self-narrating "no watch-an-ad" note + bouncy `pop` animation. This is nearly every tell at once.
- **DO:** make it on-brand and quiet. Solid or grain-textured panel in the palette, smaller radius, a real shadow (`0 2px 8px`), no backdrop-blur. Lead with the signature motif (e.g. a final collapsed/merged super-body, or an orbital-ring frame). Title in the brand voice ("GALAXY FULL" is fine — drop the wide-tracked uppercase-as-decoration if it's the only thing carrying it). Replace ★ NEW BEST ★ with a designed badge, not emoji. Score dominant via the type scale, not via glow. Snappy, non-elastic entrance.

### Texture & motion (whole game)
- Add a subtle **grain/noise overlay** over the whole stage (one of the highest-impact, lowest-effort de-AI moves).
- Replace the symmetric twinkling `radial-gradient` starfield with a **parallax field that has depth and color variation** tied to the palette, or hand-placed star clusters — not the even default scatter.
- Give merges a motion **character** (a satisfying weighty settle / a snappy click), orchestrated and consistent. Drop generic glow pulses.

---

## Sources

- Shuffle — Why Do Most AI-Generated Websites Look the Same? https://shuffle.dev/blog/2026/01/why-do-most-ai-generated-websites-look-the-same/
- Anthropic / Claude Cookbook — Prompting for frontend aesthetics. https://platform.claude.com/cookbook/coding-prompting-for-frontend-aesthetics
- DEV Community (Alan West) — Why Every AI-Built Website Looks the Same (Blame Tailwind's Indigo-500). https://dev.to/alanwest/why-every-ai-built-website-looks-the-same-blame-tailwinds-indigo-500-3h2p
- prg.sh — Why Your AI Keeps Building the Same Purple Gradient Website. https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website
- chaiovercode — Why does AI keep making everything blue-purple? https://chaiovercode.substack.com/p/why-does-ai-make-everything-blue
- Uncodixfy SKILL.md (anti-pattern / do-instead list). https://github.com/cyxzdev/Uncodixfy/blob/main/SKILL.md
- 925 Studios — AI Slop Web Design Guide (2026). https://www.925studios.co/blog/ai-slop-web-design-guide
- Wheels Up Collective — We Don't Want a Beige Internet: The Homogeneity Problem with AI-Built Sites. https://www.wheelsupcollective.com/post/we-dont-want-a-beige-internet
- aidesigner.ai — How to Design Beautiful UIs With Claude Code (2026). https://www.aidesigner.ai/blog/claude-code-frontend-design
- DEV Community (Jaainil) — The AI Purple Problem: Make Your UI Unmistakable. https://dev.to/jaainil/ai-purple-problem-make-your-ui-unmistakable-3ono
