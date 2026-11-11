# Assets and licences

Every third-party model is CC0 (public domain): free for commercial use, no attribution required.

| File | Source | Author | Licence |
|---|---|---|---|
| `public/models/char-*.glb` (5 rigged bodies; `char-knight.glb` also carries the shared 35-clip animation set) | KayKit Adventurers Character Pack 1.0 — github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 | Kay Lousberg | CC0 1.0 |
| `public/models/city.glb` (8 buildings, street lamp, bench, bush, bins, crates, dumpster, hydrant, traffic lights) | KayKit City Builder Bits 1.0 — github.com/KayKit-Game-Assets/KayKit-City-Builder-Bits-1.0 | Kay Lousberg | CC0 1.0 |
| `public/models/vehicles.glb` — 5 cars (incl. police car) | KayKit City Builder Bits 1.0 | Kay Lousberg | CC0 1.0 |
| `public/models/vehicles.glb` — 2 vans | KayKit Space Base Bits 1.0 — github.com/KayKit-Game-Assets/KayKit-Space-Base-Bits-1.0 | Kay Lousberg | CC0 1.0 |
| `public/models/vehicles.glb` — motorcycle, 4 trucks | Kenney Starter Kit Racing — github.com/KenneyNL/Starter-Kit-Racing | Kenney | CC0 models, MIT repository |
| `public/models/props.glb` — containers, cargo stacks, depots, gantry, floodlights | KayKit Space Base Bits 1.0 | Kay Lousberg | CC0 1.0 |
| `public/models/props.glb` — barrels, pallets, boxes | KayKit Prototype Bits 1.0 — github.com/KayKit-Game-Assets/KayKit-Prototype-Bits-1.0 | Kay Lousberg | CC0 1.0 |
| `public/models/props.glb` — market tables, chairs, produce crates, menu board | KayKit Restaurant Bits 1.0 — github.com/KayKit-Game-Assets/KayKit-Restaurant-Bits-1.0 | Kay Lousberg | CC0 1.0 |
| `public/models/nature.glb` (trees, cloud, coin) | Kenney Starter Kits — github.com/KenneyNL/Starter-Kit-City-Builder, Starter-Kit-3D-Platformer | Kenney | CC0 models, MIT repositories |
| Fonts: Lilita One, Nunito | @fontsource packages | Juan Montoreano; Vernon Adams et al. | SIL Open Font License 1.1 |

## Made for this game (original)
- All characters as they appear: names, backstories, colour schemes (the pack bodies are repainted at load
  time from the rules in `src/data/characters.ts`), and worn accessories (police cap, bandana, loot sack,
  visor, headband, beanie).
- The metro train, rails, platforms, gantries; roads, kerbs, tunnel, alley, warehouse, bridge, roadworks
  and dock structures; all barriers, gates, scaffolds and signage; billboard artwork and brands.
- Sky, particles, logo, icons, UI, and all audio (synthesised at run time; there are no audio files).

## No licensed likenesses
Season 1 is superhero-themed with **original** heroes (Skylark, Blur, Bastion, Cipher, Ram). No DC or other
third-party character names, logos, models, voices or branding are used.

## Models that were considered and not used
- "Indian Police Cop 3D Model Rigged" (Sketchfab, LegendKanwar): licence is **CC BY-NC 4.0 — no commercial
  use**, so it cannot ship in a commercial game. It also has a single animation clip (the game needs about
  35) and a download that requires a signed-in Sketchfab account. `LookDef.body` in
  `src/data/characters.ts` is the hook for adding another body model once a suitably licensed, fully
  animated one is available.
