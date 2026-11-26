# CyberNet

Interactive 3D explainers for networking and cybersecurity in the age of AI: a 28-day course, one concept a day, with a weekly review quiz. Static site, no build step. See [PLAN.md](PLAN.md) for the curriculum, scene concepts, visual system and architecture.

## Run it locally

ES modules need a web server (opening `index.html` as a file won't work):

```bash
python3 -m http.server 8743 --directory .
```

Then open http://localhost:8743.

## Layout

- `index.html`: the shell, with a strict CSP and no third-party requests.
- `css/site.css`: tokens (dark plus Daylight) and layout.
- `js/engine.js`: the scene registry, routing, nav, renderer, controls, readout and theme.
- `js/glow.js`: neon line, halo, bloom, grid and trail helpers.
- `js/progress.js` and `js/glossary.js` (with `data/glossary.json`): progress stored only in localStorage, and tappable glossary terms.
- `scenes/catalog.js`: metadata for all 28 days.
- `scenes/week1.js`: built scenes.
- `scenes/reviews.js`: the quizzes.
- `vendor/three/`: Three.js r187 (ES module) plus the `lines` addons. They're pinned, with checksums in `SHA256SUMS`.
- `fonts/`: self-hosted WOFF2 files (Chakra Petch, Inter, JetBrains Mono, all under the OFL).

## Adding a day's scene

In a week file, call `CN.register({ id, prompt, mount(ctx), body, deeper })` with the id that `catalog.js` already declares. The engine merges it in. `scenes/week1.js` (Packets) is the reference scene.

## After editing the importmap

```bash
sh tools/csp-hash.sh
```
