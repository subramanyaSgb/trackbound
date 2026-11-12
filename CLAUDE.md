# Trackbound: Pursuit

Story-driven 3D police chase for mobile browsers. Three.js + TypeScript + Vite, installable PWA.
Repo: `subramanyaSgb/trackbound`. **`main` auto-deploys to Vercel**, so a push publishes to players.

README.md covers how to play and how to add content. REDESIGN.md has the audit of the old endless
runner and the honest gap list against the original brief. ASSETS.md has licences. Read those rather
than re-deriving; this file is what is not obvious from them.

## Commands
```bash
npm run dev                             # dev server (prints a LAN URL for phones)
npm test                                # unit tests (vitest): generator, pursuit, abilities, capture, data, save
npm run build                           # tsc --noEmit + vite build -> dist/ (also sw.js, version.json)
npm run build && npm run test:e2e       # 61 checks in a real browser against the production build
npm run build && node tools/update-test.mjs   # proves the PWA update path across two real builds
node tools/build-assets.mjs             # rebuild public/models from the packs in ../assets
node tools/shots.mjs <outDir> <scenario.mjs> [w] [h]   # scripted screenshots against the dev server
```
Before saying something works: `npx tsc --noEmit`, `npm test`, then build + e2e. For anything visual,
take screenshots with `tools/shots.mjs` and look at them.

## Working agreements
- **Ask before committing or pushing.** The owner usually says "push to main" per change; that approval
  covers that change only.
- Commit as the repo owner; end commit messages with the Co-Authored-By line the session provides.
- The owner tests on the live Vercel site, mostly on a phone. Check phone portrait (about 414x860) as
  well as desktop for any UI change.
- Be straight about limits. The art is a free low-poly pack repainted in code; do not call it
  realistic or bespoke. Keep REDESIGN.md section 4 (known gaps) current when scope changes.

## Architecture in one screen
```
src/data/       ALL content: abilities, characters + criminals, missions (cases), seasons
src/core/       Game (state machine, run flow, frame order), Assets, Bend, Updates, Save, Input, config
src/player/     Rig (skinned character + procedural layers), Player (controller + poses)
src/pursuit/    Pursuit (gap, hearts, stamina; pure), Criminal (suspect AI), Capture (finale; pure)
src/abilities/  Abilities (charge / activate / cooldown; pure)
src/world/      generator (pure, fairness-validated), Spawner, ObstacleFactory, World, themes, textures
src/ui/         Ui.ts (DOM overlay) + style.css; markup lives in index.html
tools/          build-assets, e2e, update-test, shots, viewer.html
```
- **Game states:** `loading | menu | intro | running | paused | takedown | failing | over`.
- **Pure logic is kept pure** (Pursuit, Capture, Abilities, generator, data helpers) so it is unit-tested
  without a browser. Keep rendering out of those files.
- **Content is data.** A new case, hero, criminal, season or ability number is an edit in `src/data`.
  Only a new ability *effect* needs code (`Game.power`, `Game.onHit`, `Game.abilityFx`).
- `window.__game` is the debug/test hook. `__game.autopilot = true` plays with real inputs;
  `__game.startPursuit(seed, skipIntro)` starts a run; set `save.data.story.<id> = { zone, gap, done, best }`
  first to start from a later zone.

## Design decisions (and why)
- **Hearts and checkpoints, not one-hit death.** Each zone start is a checkpoint: hearts refill, coins
  are banked, a failed run resumes there. Three hits in a zone, gap reaching `loseGap`, or running out
  of capture attempts fails the case.
- **The gap is simulated.** Clean running closes it down to the zone's `minGap`; a stumble lets the
  suspect pull away by the real speed difference; abilities close it faster.
- **Early capture (suspect stamina).** The owner found 50,000 m too long but chose to keep the route
  length. From `pursuit.early.from`, staying within 4 m of the zone floor at full pace drains stamina
  over `pursuit.early.hold` seconds; a crash gives 12% back; a suspect on a motorcycle tires at half
  rate. Empty stamina starts the capture immediately. So route length is an upper bound. The owner
  then found the catch still too slow, so `from`/`hold` were cut (case 1: 1,500 m and 75 s): a clean
  case 1 now ends near 3,600 m (about 2.7 min), case 2 near 5,300 m, the boss near 8,900 m.
- **Coaching, because "not clear what to do".** `Game.tip(id, text)` shows a one-sentence card the
  first time each thing happens (ids: move, gap, hit, power, stamina, final, lock), tracked in
  `save.data.tips`. The `?` button on the home screen opens the `help` sheet. Use plain words in
  player-facing text ("thief", "the red bar"), not system terms.
- **Capture is never automatic.** Close to range, be in the suspect's lane, press the action button
  inside the timing window. Types: taser, net, tackle (per case).
- **Ability charge is separate from the wallet.** Each coin adds to both; activating empties the
  charge and never spends coins; no charging while the power is active.
- **Restart case** (menu and pause) drops the checkpoint after a confirmation; banked coins stay.
- **Free Patrol** is the old endless mode kept as a `patrol: true` mission (no suspect).
- **Original characters only.** Season 1 is superhero-themed with original heroes; no DC or other
  licensed names, logos or likenesses.

## Rendering and animation gotchas
- **Curved world is a shader trick** (`src/core/Bend.ts`). The simulation is a straight track along -Z;
  `project_vertex` and `worldpos_vertex` are patched and `Material.prototype.onBeforeCompile` supplies
  the uniform. Consequences: set `frustumCulled = false` on world meshes; hand-written ShaderMaterials
  do not bend unless they use `BEND_GLSL`; there are no real turns or branching routes.
- **Pitch sign:** on a Rig, positive `pitch.rotation.x` leans the character **back** (slide is +0.5),
  negative pitches forward (flight is -1.2). Models face +Z and are rotated by pi to run toward -Z.
  Vehicles also face +Z in their files.
- **Capes are hidden** (`look.hide`) because they covered the whole body from the chase camera, which
  is why jump and slide used to be unreadable. The flyer's cape shows only while flying.
- **One animation set drives every body.** Clips live in `char-knight.glb`; only quaternion tracks and
  the hips/root position are kept so other bodies keep their own proportions. Bone names are sanitised
  by three (`upperarm.l` becomes `upperarml`).
- **Slide has no clip in the pack.** It is `Sit_Floor_Idle` plus a backward pitch. Flight is
  `1H_Ranged_Aiming` pitched forward. Riding is `Sit_Chair_Idle`.
- **Looks are data:** `RecolorRule`s repaint the body's colour atlas at load (HSL ranges), and
  accessories (cap, mask, sack, visor, headband, beanie) are fitted to the measured head.
- **Train detail must sit outside the shell's bevel.** The old bug was side windows 6 cm inside it.
- **`Kit.std(key, () => params)` takes a factory** so textures are only built once. Passing an object
  rebuilt canvases on every chunk bake and caused 200-300 ms hitches at zone changes.
- **Obstacle models occupy local z in [-depth, 0]**; each `Variant` carries its own collision box.
  Same-direction traffic is positioned from the player's distance so it is caught exactly at its row.

## UI gotchas
- The play button has class `big`, which is also the results headline class. `.btn.big` resets the
  text stroke; do not reuse bare `.big` for new elements. Likewise the menu's `.case` card and the
  case list's `.card.file` are different things.
- The menu camera is in front of the hero looking back, so screen-right is world -X. Sheets open on
  the right in landscape, and the hero is shifted left while one is open.
- Ui only touches the DOM when a value changes (`set` / `style` / `cls` caches). `hudSetup` clears the
  HUD part of that cache at the start of each run.

## PWA and versions
- Each build is stamped with `package.json` version + git commit (`VERCEL_GIT_COMMIT_SHA` on Vercel) +
  build time, exposed as `__APP_VERSION__`, `__APP_COMMIT__`, `__APP_BUILT__` and written to
  `dist/version.json`. The home screen shows it top-right under the coins (`v0.2.0 (abc1234) · latest`); it was moved
  there because the owner could not find it at the bottom of the footer. Settings has a Version
  row with CHECK.
- `version.json` is never cached or precached. `src/core/Updates.ts` compares it with the running
  build on launch, on return to foreground and on CHECK.
- **A new service worker waits.** It does not `skipWaiting` on install; the page posts `SKIP_WAITING`
  when the player taps UPDATE, then reloads on `controllerchange`. A run is never interrupted.
- **Menus, pause and results render at about 30 fps** (`Game.frame`). A page rendering flat out starved
  the browser of the idle time it needs to fetch a new service worker, and `registration.update()`
  never resolved. Do not remove that cap without re-running `tools/update-test.mjs`.
- Bump `version` in `package.json` for a release players should recognise.

## Assets
- Source packs are cloned in `../assets` (sibling folder, not in the repo): KayKit Adventurers, City
  Builder Bits, Space Base Bits, Prototype Bits, Restaurant Bits; Kenney Starter Kits (City Builder,
  3D Platformer, Racing). All CC0. `tools/build-assets.mjs` turns them into `public/models/*.glb`.
- When stripping animations with gltf-transform, dispose the channels and samplers too, or the
  accessors stay and the file does not shrink.
- A model the owner suggested (Sketchfab "Indian Police Cop", LegendKanwar) was **not** used: licence
  is CC BY-NC (no commercial use), one animation clip, login-gated download. Any replacement body needs
  a commercial-friendly licence and a full clip set; `LookDef.body` is the hook.
- `tools/viewer.html` (dev server only) shows any bundle or character pose:
  `/tools/viewer.html?file=vehicles` or `?mode=chars&clip=Sit_Floor_Idle&yaw=1.2`.

## Testing notes
- `tools/shots.mjs` scenarios get `{ shot, step, sim, freeze, view, wait }`. Call `freeze()` first so only
  `step(seconds)` advances the game; otherwise the real-time loop also runs and frames are not repeatable.
  `view([x,y,z],[lookX,lookY,lookZ])` renders from a camera relative to the player (side views of poses).
- UI timers (toasts, banners) use real `setTimeout`, so they linger in frozen screenshots. That is a
  test artefact, not a bug.
- To reach the finale quickly in a test, start from the last zone and shorten the mission at run time:
  `__game.mission.length = 40400; __game.mission.limit = 42000`.
- Shell note for this Windows machine: long inline `node -e` or heredocs containing apostrophes break
  under Git Bash. Write a small `.mjs` patch or scenario file and run that instead.

## Not done / known gaps (see REDESIGN.md section 4 for the full list)
Stylised art rather than realistic; partly procedural per-character animation; visual-only road
curvature; synthesised audio; no bus model; Seasons 2 and 3 are placeholders; no costumes or equipment
shop; never run on a physical phone; balance tuned only against the autopilot.

## Trailer and README media
- `docs/media/` holds the 20 s launch trailer (`trackbound-pursuit.mp4`), a silent looping preview
  (`preview.webp`) and the poster. The README shows the preview and links it to the MP4; GitHub does
  not play repo-hosted video inline, so do not swap it for a `<video>` tag.
- The trailer was made with the `/brag` plugin (brag-slim method): `brag-output/work/capture.mjs`
  steps the real game frame by frame with a title overlay, `audio.mjs` synthesises the soundtrack, and
  FFmpeg (installed system-wide via winget, not on the Git Bash PATH) encodes it. `brag-output/` is
  git-ignored; re-run those two scripts to re-roll the video.
