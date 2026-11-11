# Trackbound: Pursuit — 3D story-driven police chase

Three.js + TypeScript + Vite. Mobile-first, installable (PWA), playable offline after the first load.

You are a police officer. Each case opens with a robbery, then a three-lane chase through changing
environments. The suspect is a real runner ahead of you: clean play closes the gap, collisions let
them pull away, and at the end of the route you have to make the arrest yourself.

## Run locally
```bash
npm install
npm run dev        # dev server; prints a LAN URL you can open on your phone
npm run build      # type-check + production build into dist/ (also writes dist/sw.js)
npm run preview    # serve the production build (service worker active here)
```
## Tests
```bash
npm test                              # unit tests: track fairness, pursuit gap, ability charge, capture, content data, save migration
npm run build && npm run test:e2e     # end-to-end run in a real browser (set CHROME=/path/to/browser if none is found)
```
`node tools/shots.mjs <outDir> <scenario.mjs> [width] [height]` runs a scripted scenario against the dev
server and saves screenshots; `tools/viewer.html` (dev server only) shows any model bundle or character pose.

## Deploy
`dist/` is a static site with relative paths: upload it to any static host (Netlify, Vercel,
GitHub Pages, S3, nginx). Installing as an app and offline play need HTTPS (or localhost).

## Versions and updates
Every build is stamped with the `package.json` version, the git commit and the build time. The menu shows
it (for example `v0.2.0 (54ccd7f)`), and Settings has a Version row with a CHECK button.

An installed copy runs from its cache, so it keeps playing the build it has until a newer one is
downloaded and accepted:
1. On launch, on returning to the app, and on CHECK, the game reads `version.json` from the server
   (never cached) and compares it with its own stamp.
2. If the server has a newer build, it is downloaded in the background and an UPDATE button appears on
   the menu and in Settings. A pursuit in progress is never interrupted.
3. Tapping UPDATE switches to the new build and reloads. Offline, the game still starts and says it
   could not check.

Bump `version` in `package.json` for a release you want players to recognise; the commit and build
time change on every deploy regardless. `npm run build && node tools/update-test.mjs` proves the
whole path against two real builds.

## Controls
| | Touch | Keyboard |
|---|---|---|
| Change lane | swipe left / right | arrows or A / D |
| Jump | swipe up | up, W or Space |
| Slide | swipe down | down or S |
| Ability / fire the capture tool | tap the round button | E, F, Enter or Shift |
| Pause | pause button | Esc or P |

Swiping down in mid-air drops into a slide; a jump pressed just before landing is buffered.
Tap anywhere to skip the intro. In the menu, drag to turn your hero.

## How a case plays
- **Route:** a case is a list of zones (for case 1: city streets, rail yard, tunnels and alleys, industrial
  yard, expressway and bridge, night roadworks, docks). Each zone start is a **checkpoint**: hearts refill,
  coins are banked, and a failed or abandoned pursuit resumes from there.
- **Gap:** shown at the top. It closes while you run clean (down to a floor set by the zone), opens when
  you hit something or the suspect pulls a trick, and closes faster while an ability is active.
- **Failing:** three collisions in one zone, letting the gap reach the limit, or running out of road or
  capture attempts.
- **Ability:** coins fill the charge ring; when full, activate it. Charging never spends your coins.
- **Early capture:** a few zones in, the suspect starts to tire. A stamina bar appears under the gap; it
  drains while you stay right on their heels at full pace and refills a little each time you crash. When
  it is empty the final capture starts there and then, so a clean run of case 1 ends near 10,000 m
  (about 7 minutes) instead of at 50,000 m. Tuned per case by `pursuit.early` in `src/data/missions.ts`.
- **Capture:** when the suspect is exhausted (or at the end of the route), close to range, line up in
  their lane and fire inside the green window of the timing meter. Enough hits starts the arrest;
  running out of attempts fails the case.
- **Free Patrol:** the original endless score-attack run, kept as a mode in the case list.

## Adding content (no engine changes)
| To add | Edit |
|---|---|
| A case (criminal, route, difficulty, capture rules, rewards, unlock gate) | `src/data/missions.ts` |
| A hero or criminal (body, recolour, accessories, movement style, ability) | `src/data/characters.ts` |
| An ability's numbers (cost, duration, cooldown, speed) | `src/data/abilities.ts` |
| A season (dates, heroes, featured cases, reward track) | `src/data/seasons.ts` |
| An environment (scenery builder, lighting, obstacle set) | `src/world/themes.ts` |
| An obstacle or vehicle model | `src/world/ObstacleFactory.ts` |

A new ability *effect* (as opposed to new numbers) also needs its behaviour in `Game.power` / `Game.onHit`.

## Layout
```
src/data       abilities, characters + criminals, missions (cases), seasons — all content lives here
src/core       Game (state machine, run flow, frame order), Assets (models, recolouring, accessories),
               Bend (curved-world shader), Input, Save (IndexedDB + migration), config
src/player     Rig (skinned character: clips, cross-fades, procedural layers), Player (controller + poses)
src/pursuit    Pursuit (gap/hearts, pure), Criminal (suspect AI), Capture (finale, pure)
src/abilities  Abilities (charge / activate / cooldown, pure)
src/camera     FollowCamera (menu, chase, flight, motorcycle, cinematic and results poses)
src/world      generator (pure, validated), Spawner (pooled obstacles + traffic), ObstacleFactory,
               TrainFactory, World (environment streaming), themes (eight environments), Sky, textures
src/systems    Collision, Coins (instanced), PowerUps (pickups), Missions (bounties), Particles
src/audio      AudioManager (synthesised SFX, loops, ambience, mood-driven music)
src/ui         HUD, menus, sheets, cinematic captions, results (Ui.ts + style.css)
tools/         build-assets.mjs (asset pipeline), e2e.mjs, shots.mjs, viewer.html, make-icons.mjs
tests/         generator fairness, pursuit/abilities/capture/content, bounties
```
## Rebuilding the 3D assets
`public/models/*.glb` are produced from the source packs by `node tools/build-assets.mjs <packs dir>`
(default `../assets`). Clone the packs listed in ASSETS.md into one folder and pass that folder.

See ASSETS.md for licences and REDESIGN.md for the audit, what was built, and the known gaps.
