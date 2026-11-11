# Redesign notes

## 1. Audit of the previous build
| Area | Finding |
|---|---|
| Character | One CC0 robot; no roll or strafe clips, so the slide was a tilted sitting pose |
| Environment | Boxes with generated window textures; one repeating skyline; dusk lighting hid detail |
| Trains | Textured boxes |
| Obstacles | Simple box barriers |
| Rendering | No environment lighting or reflections; single shadow setting |
| UI | System font, two volume sliders, no navigation |
| Systems missing | Power-ups, missions, shop, character selection, levels, settings, PWA |
| Kept as-is | Lane/jump/slide physics, validated track generator, pooling, collision, IndexedDB save |

## 2. Visual direction
Bright, saturated, toy-like city on a sunny day. Chunky navy outlines and candy buttons in the UI.
Palette: navy `#0f1440`, royal `#2337c6`, sky `#49c6ff`, gold `#ffc928`, amber `#ff9d1a`,
coral `#ff5a5f`, mint `#2fe0a6`. Display type: Lilita One; body: Nunito 700/800.

## 3. What changed
- **Characters:** five rigged human characters with face, hair/hood and clothing; animation state
  machine with cross-fades: idle, run, strafe on lane change, take-off, airborne, landing, roll,
  death, cheer.
- **World:** city of modelled buildings (two depth rows), street lamps, benches, trees, bins,
  parked cars, billboards with original artwork, station name boards, catenary portals; profiled
  rails, sleepers with clips, ballast; gradient sky with sun glow and drifting clouds.
- **Trains:** original metro car from real geometry — rounded shell, inset glass, doors, cab
  windscreen, destination display, lights, roof units, pantograph, bogies and wheels; five liveries.
- **Rendering:** image-based ambient light and reflections, ACES tone mapping, soft shadows,
  distance fog; Low / Medium / High / Auto quality (resolution, shadows, clouds, particles).
- **Gameplay added:** Coin Magnet, Shield, Double Coins (pickups, timers, upgrades); 14 missions
  dealt three at a time with rewards; XP levels; five unlockable runners; shop upgrades.
- **Feel:** particles for coins, landings, rolls, pickups and crashes; shield bubble; knock-back on
  crash; results camera; score count-up.
- **UI:** splash, main menu with level, coins and navigation, bottom sheets for Runners, Missions,
  Upgrades and Settings, HUD with power-up timers and mission toasts, pause, results, reset dialog.
- **PWA:** manifest, icons, generated service worker that precaches the build.

## 4. Known gaps against the brief
- One world. The other five worlds are not built.
- No jetpack, super sneakers or speed boost; no outfits/cosmetics beyond the five runners; no
  achievements list, daily/weekly rotation or language options.
- The characters are a fantasy-adventurer pack recast as city runners, not bespoke designs.
- Track, trains and obstacles are generated in code rather than sculpted in a modelling tool;
  no normal maps.
- Audio is synthesised, not recorded.
- Not yet run on a physical phone: frame rate on mid-range Android and touch feel are unverified.
