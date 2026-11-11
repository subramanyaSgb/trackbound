# Trackbound — 3D endless runner

Three.js + TypeScript + Vite. Mobile-first, installable (PWA), playable offline after the first load.

## Run locally
```bash
npm install
npm run dev        # dev server; prints a LAN URL you can open on your phone
npm run build      # type-check + production build into dist/ (also writes dist/sw.js)
npm run preview    # serve the production build (service worker active here)
```
## Tests
```bash
npm test                              # unit tests: track fairness, missions, power-ups
npm run build && npm run test:e2e     # headless-Chrome end-to-end run (set CHROME=/path/to/chrome)
```
The end-to-end run is slow under software rendering (15–20 minutes); it is quick on a machine with a GPU.

## Deploy
`dist/` is a static site with relative paths: upload it to any static host (Netlify, Vercel,
GitHub Pages, S3, nginx). Installing as an app and offline play need HTTPS (or localhost).

## Controls
Swipe left/right/up/down · Arrow keys or WASD · Space = jump · Esc/P = pause.
Swiping down in mid-air drops into a roll; a jump pressed just before landing is buffered.
In the menu, drag to turn your runner.

## Layout
```
src/core      Game (state machine, frame order, quality tiers), Assets, Input, Save (IndexedDB), config
src/player    Player controller + skeletal animation state machine
src/camera    FollowCamera (menu / run / results poses, shake, speed FOV)
src/world     generator (pure, validated), Spawner (pooled), ObstacleFactory, TrainFactory,
              Environment (baked city chunks), Sky, StaticBatch, textures
src/systems   Collision, Coins (instanced), PowerUps, Missions, Particles
src/audio     AudioManager (synthesised SFX + music, unlocks on first tap)
src/ui        HUD, menus, sheets, design system (style.css)
tools/        build-assets.mjs (asset pipeline), make-icons.mjs, e2e.mjs
tests/        generator fairness, missions, power-ups
```
## Rebuilding the 3D assets
`public/models/*.glb` are produced from the source packs by `node tools/build-assets.mjs <packs dir>`
(strips unused animation clips and weapon props, merges props into bundles, compresses textures).
Clone the packs listed in ASSETS.md into one folder and pass that folder.

See ASSETS.md for licences and REDESIGN.md for the audit, design system and known gaps.
