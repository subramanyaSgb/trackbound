# Pursuit redesign notes

## 1. Audit of the endless-runner build (what was wrong, and why)
| Area | Finding | Cause |
|---|---|---|
| Jump and slide did not read | From the chase camera only a hood and a cape were visible | Every character wore a cape that covered arms and legs |
| Slide looked like a tilt | No slide clip existed; a dodge-roll was played in slow motion | Asset pipeline kept 12 of the pack's 75 clips |
| Train sides were blank slabs | Windows, doors and stripes were never visible | The shell's bevel pushed its skin 6 cm outside those parts, burying them |
| Jump felt weightless | No anticipation or landing weight | Launch was instant; landing had no squash, shake or heavy-landing sound |
| Gameplay | Endless, one world, one hit ended the run | By design of the previous build |
| Kept as-is | Lane/jump/slide physics, validated track generator, pooling, IndexedDB save, quality tiers, PWA | Solid and reused |

## 2. What was built
**Characters and animation**
- Capes hidden; five bodies, one shared 35-clip animation set; looks are data (recolour rules + accessories).
- Jump: 55 ms crouch (squash) before the feet leave the ground, stretch on launch, airborne pose, landing
  squash with dust, camera kick and a heavier sound for hard landings.
- Slide: seated feet-first pose, body leaned back, camera drops; cross-fades back to the run.
- Also: lane strafes, stumble on collision, ability activation, motorcycle riding (with wheelie), flight
  (body horizontal, cape out), taser/net aim-and-fire, tackle, arrest, cheer, death.
- Per-character movement: run clip, cadence, torso lean and arm sweep come from `MoveStyle`.

**Pursuit**
- Suspect AI on the same track: follows the open lane, jumps, slides, swerves round traffic, glances
  back, trips (you gain ground), throws debris into your lane, rides a getaway motorcycle in some zones,
  weaves when cornered. A marker keeps them visible in traffic.
- Gap is simulation, not decoration: see `src/pursuit/Pursuit.ts` and its tests.
- Six cases plus Free Patrol; the boss case unlocks at 100,000 m of lifetime distance.
- Checkpoints at every zone; hearts instead of one-hit death.
- Early capture: staying on the suspect's heels drains their stamina and opens the finale before the
  end of the route. 50,000 m is the longest case 1 can last, not how long it must last: an
  unhit autopilot run makes the arrest at about 10,300 m (6.8 minutes).
- Playable finale (taser, net launcher or tackle depending on the case) and an arrest cinematic.
- Intro cinematic per case: robbery, suspect bolts, dispatch call, go.

**World**
- Eight environments with their own scenery, lighting, fog, sky, soundscape and obstacle sets:
  city streets (with intersections), railway, tunnel, back alley, industrial yard, expressway and
  suspension bridge, night roadworks, night docks.
- Traffic: parked vehicles, same-direction traffic you catch up with, oncoming vehicles, pedestrians.
- Curved-world rendering: the road bends, climbs and dips on screen while the simulation stays on a
  straight track (see `src/core/Bend.ts`).

**Powers**
- Six abilities, one per hero: police motorcycle, flight, speed dash, shield, tactical scan, wrecking charge.
  Coin-charged, with duration, cooldown and HUD ring. Pickups (magnet, shield, double coins) remain.

**Structure**
- Content is data (`src/data`); seasons, heroes, cases and abilities are added without engine changes.
- Save migrates endless-runner saves (coins, XP and upgrades carry over).

## 3. Verified
- `npm test`: 25 unit tests.
- `npm run test:e2e`: 61 checks in a real browser against the production build, desktop and phone-sized touch.
- Autopilot soak of the full 50,000 m first case: completes in about 27.5 minutes of game time.
- Desktop frame rate at High quality: 144 fps (display-capped), 220–330 draw calls.

## 4. Known gaps against the brief (read this before promising anything to players)
- **Art style is stylised low-poly, not realistic.** The characters are a free CC0 pack repainted and
  accessorised in code. Bespoke, professionally modelled heroes with unique animation sets need an artist
  or a purchased pack; the character system is ready to take them.
- **Per-character animation is partly procedural.** There are two run clips; heroes differ by cadence, lean
  and arm sweep layered on top, not by fully unique mocap.
- **Roads curve visually only.** There are no true 90-degree turns, branching side streets or route choices;
  the simulation is a straight three-lane track. Intersections, tunnels and bridges are scenery.
- **Audio is synthesised.** No recorded footsteps, engines, sirens or music.
- **No bus model** (none in the free packs); trucks, vans, cars, trains and a motorcycle are used.
- **Seasons 2 and 3 are placeholders** shown as "coming soon"; only Season 1 has content. Season dates are
  fixed in `src/data/seasons.ts`; there is no server, so new content ships with a new build.
- **No costumes, equipment shop or character upgrades** beyond the four shop upgrades and hero unlocks.
- **Not yet run on a physical phone.** Frame rate on mid-range Android and touch feel are unverified.
- **Balance is a first pass.** Case 1 runs from about 7 minutes (clean play, early capture) up to about
  28 minutes (the full 50,000 m); gap, heart, stamina and economy numbers have only been tuned against
  the autopilot. Players who capture early do not see the later environments of that case.
