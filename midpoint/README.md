# two.

A small game of colour. Find the midpoint between two colours, learn their names and stories, train your eye.

## Run locally

```bash
npm install
npm run dev
```

Vite will print a local URL (typically `http://localhost:5173`). Open on your phone if it's on the same network for a real touch test.

## Build for production

```bash
npm run build
```

Outputs to `dist/`. Drag-and-drop that folder onto Netlify Drop, or connect this repo to Vercel for automatic deploys.

## Project structure

- `src/App.jsx` — the entire app (audio engine, levels, screens, components)
- `src/main.jsx` — React entry
- `src/index.css` — Tailwind directives
- `index.html` — mobile-tuned shell with cream background and viewport lock

## Notes

- Uses OKLCH for perceptually uniform colour interpolation. Modern browsers only (Chrome 111+, Safari 15.4+).
- Web Audio API for ambient, touch, lock, and pad tones. Touch tone includes binaural beats (theta range) and a 0.1 Hz "resonant breath" LFO.
- Fonts loaded from Google Fonts at runtime: Newsreader + DM Sans.
- No persistence — completed-level state lives in memory only.

## Deploying for someone to play on their phone

Easiest path: push this repo to GitHub, connect to Vercel, get a `*.vercel.app` URL. Free.
