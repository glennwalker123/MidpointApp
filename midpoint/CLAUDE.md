# CLAUDE.md

Context for Claude Code working on this repo.

## What this is

**two.** is a small, calm, meditative mobile game about colour perception. The player finds the perceptual midpoint between two colours by dragging a candidate band between them. After locking in, the screen reveals the truth, scores the attempt, then settles into a reflection screen with the colour's name and a short evocative fact — like a digital companion to Kassia St Clair's *The Secret Lives of Colour*.

The whole app is one React component (`src/App.jsx`), about 1,900 lines, no router, no state library, no backend.

## Design philosophy

This is the part that matters most. Hold this voice and these constraints in everything.

**Calm over clever.** Every animation slow, every easing curve soft (`cubic-bezier(0.22, 1, 0.36, 1)` or `(0.65, 0, 0.35, 1)`). Nothing snaps or bounces. Default transition is 700ms–1.8s. The whole app should feel like reading a book slowly.

**Colour is the design.** The bulk of the screen at any time should be filled with the colour the player is working with. Chrome is minimal — no top bars, no tab bars, no persistent navigation. The colour itself is the interface.

**No spoilers.** Round descriptions, intros, and the home grid never name the specific colours that appear in that round. Players discover names only on the reflection screen after locking in. This is a hard rule. If asked to write copy for a round, do not name the answer colours.

**Premium, never gamified.** No points totals, achievements, streaks, badges, levels-unlocked-by-XP, daily challenges. The closest thing to a reward is the small dot that appears on a tile after completion.

**Science quietly embedded.** Real perception research underpins the design (MacAdam ellipses, V4 cortical specialization, L:M cone ratio variability, linguistic relativity, binaural beats at theta frequency, 0.1 Hz resonant breathing rate). When relevant, science can be referenced — but always woven into prose, never as bullets or footnotes.

**Voice.** Literary, evocative, never academic. Short sentences. Concrete imagery. Trust the reader. Compare to: Robert Macfarlane's nature writing, Kassia St Clair's colour essays, the Calm app's introductions. Never to: marketing copy, productivity-app onboarding, gamified explainers.

## Code architecture

- **`src/App.jsx`** — everything lives here:
  - `AudioEngine` class — Web Audio API, ambient bed + touch tone + lock/truth tones + pad + button events. Binaural beats and resonant-breath LFO baked in.
  - Colour helpers — `lerpOklch`, `oklchStr`, `labelOn` (returns text colour that contrasts with a given OKLCH background), `chromeBg` (dark tinted variant), `roundColor` (average midpoint of a round)
  - `LEVELS` — array of 12 rounds, each with 5 challenges. Each challenge has `a`, `b`, `midpointName`, `fact`.
  - `CALMING_MESSAGES` — variants shown on the complete screen
  - Components: `App`, `Onboarding`, `Home`, `About`, `Settings`, `Level`, `IntroScreen`, `ChallengeView`, `Reflection`, `LevelComplete`, `MuteToggle`, `ActionButton`
  - Onboarding: 3–4 slides shown on first visit. Skippable. Tracked via `localStorage["midpoint:onboarded"]`. Only persistent state in the app — everything else is in-memory.
- **All colour values are OKLCH** for perceptual uniformity. The midpoint is always at `t = 0.5` along the gradient between `a` and `b`.

## Audio

The audio is part of the design, not decoration. Five layers:

1. **Ambient bed** — filtered brown noise + sub drone, starts on first level entry, persists across home/level navigation. Plays a "room" the rest of the sounds live inside.
2. **Touch tone** — a deep ambient pad (90–260 Hz, three detuned sines + sub-octave + lowpass) that plays only while the finger is on a candidate band. Pitch glides slowly with the candidate colour's lightness. Includes a 7 Hz binaural offset between L and R channels (theta-range, headphone-only effect) and a 0.1 Hz "resonant breath" LFO (the rate at which heart-rate variability peaks).
3. **Lock-in tone** — pentatonic note based on candidate lightness, plays on lock.
4. **Truth tone** — same family, plays 0.7s later for the truth colour.
5. **Pad** — sustained warm 3-osc pad on the reflection screen.

Plus button events: `buttonArrival` (G3, slow attack) when a button fades in, `buttonTap` (G4, brief) on press.

If asked to change volumes, the current balance (set carefully): ambient noise is quiet (~0.06 noise, ~0.04 sub offset) so the touch tone is the felt sound, touch tone peaks at ~0.06 with a ~0.022 resonant-breath LFO depth, button events soft (~0.14–0.20), lock-in is the loudest discrete event (~0.35).

## UI patterns to keep consistent

- **Primary buttons** — `ActionButton` component. Full-width, 56px tall (`h-14`), uppercase, `0.3em` letter-spacing, 11px. Border in `labelOn(bg)` colour, text in `labelOn(bg, true)`. Plays `buttonArrival` on appearance, `buttonTap` on click. Always rendered in the layout from mount (use `disabled` prop to gate clicks), so content above never jumps.
- **Edge padding** — `px-8 py-14` on every full-screen screen (Home, About, Intro, Reflection, Complete). Game screen is full-bleed colour.
- **Type scale** — modular at ratio ~1.25. Body 14–17px, ui labels 11px, ui titles 27px, hero display 60–96px with `clamp()`.
- **Display type** — Newsreader italic. Body — DM Sans. Both with `font-optical-sizing: auto`.
- **Cream neutral screens** (Home, About, Complete) — `HOME_BG` (warm unbleached cotton). Text colours from `CREAM_TEXT` palette.
- **Coloured screens** (Intro, Reflection, Game) — background derived from the round/colour. Text via `labelOn(color, strong?)` which adapts to background lightness.

## Things not to do

- Don't add Tailwind plugins or component libraries. The styling is custom and intentional.
- Don't introduce a state library, router, or fetch layer. Single component, in-memory state.
- Don't add gamification (XP, streaks, leaderboards).
- Settings screen contains only the mute toggle. Don't grow it into a preferences dashboard — if a new pref is genuinely needed, push back first.
- Levels are gated: round N is locked until round N-1 is completed. Don't surface a "play any round" override.
- Don't replace OKLCH with HSL or sRGB. Perceptual uniformity is the whole point.
- Don't import icon libraries. The mute icon is a hand-drawn SVG.
- Don't shorten the animation durations to feel "snappier." The slowness is the design.
- Don't name the answer colours in level descriptions, intros, or the home grid.

## Common requests and how to handle them

- **"Add a new round"** — extend the `LEVELS` array. Pick a theme that's distinct from the existing 12 (Earth, Sea, Bloom, Stone, Night, Light, Dusk, Made, Beast, Forbidden, Garden, Empire). Write 5 challenges with real colour history. Write the intro paragraph without naming any of the round's answer colours. Add a `description` (one line, no answer names) and a `bg` tint.
- **"Change the typography"** — be cautious. The current Newsreader/DM Sans pairing was chosen carefully for calm reading. Suggest alternatives before changing.
- **"Make the sound …"** — touch `AudioEngine` methods. Test on headphones for the binaural layer.
- **"Tune the colour palette"** — adjust the OKLCH triples in the `LEVELS` array. Keep `l` between 0.20 and 0.95 for legibility, `c` reasonable for the hue (greens cap around 0.20, blues can go higher).

## tincture — the colour-mixing game (separate)

A second, standalone game lives alongside the midpoint app and must stay
independent of it. **Do not entangle the two.**

- **Own URL** — `mix.html` is a second Vite entry point (see `vite.config.js`
  `rollupOptions.input`). Served at `/MidpointApp/mix.html`; `index.html` stays
  the midpoint game.
- **Own files** — everything is under `src/mix/`: `MixApp.jsx` (UI),
  `mixing.js` (subtractive paint model + CIELAB matching), `levels.js`,
  `audio.js`. Nothing here imports from `App.jsx`, and `App.jsx` imports nothing
  from here.
- **The game** — skeuomorphic glass test tubes of paint. You're given a target
  tube and mix from a shelf of pigment tubes (tap to add a drop) until your glass
  matches. Win condition is *exact recipe*: the target is generated from a hidden
  pigment ratio, and you match by landing within ΔE 3.5 of it (equivalent ratios
  like 2:1 and 4:2 both count). 12 levels, two pigments up to four, gated
  sequentially. Progress in `localStorage["tincture:solved"]`.
- **Mixing model** — real subtractive pigment behaviour (blue + yellow → green,
  ratio shifts the hue) via a coarse 6-band reflectance spectrum mixed as a
  weighted geometric mean, then mapped to RGB. Not OKLCH averaging — this game
  wants paint, not perceptual blends. If you retune pigments, re-run the kind of
  sanity check used to author them (mix the primaries/secondaries and eyeball the
  RGB) before committing.
- **Name** — "tincture." is a working title; easy to change (title in `mix.html`,
  heading in `Home`).

## Deployment

Two targets share one codebase:

- **Web (GitHub Pages)** — `npm run build` outputs `dist/` with base `/MidpointApp/`. The repo's `.github/workflows/deploy.yml` builds + deploys to `https://glennwalker123.github.io/MidpointApp/` on every push.
- **Native (Capacitor)** — wrapped as iOS/Android apps. `npm run cap:sync` runs `vite build --mode native` (root base) and copies into the native projects. `npm run cap:open:android` opens Android Studio. iOS not yet scaffolded.

App identity (in `capacitor.config.json`): appId `com.glennwalker.midpoint`, appName `midpoint`. Both can be changed before first store submission.

## File map

```
midpoint/
├── src/
│   ├── App.jsx       ← the whole app
│   ├── main.jsx
│   └── index.css
├── index.html         ← mobile-tuned shell
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
└── README.md
```
