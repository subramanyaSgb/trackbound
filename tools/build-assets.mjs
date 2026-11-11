// Asset pipeline: turns the CC0 source packs into small, game-ready GLBs.
//   node tools/build-assets.mjs <dir containing the cloned packs>
// Characters: unused animation clips and weapon props are stripped, tracks resampled.
// City/nature props: many glTF files are merged into one GLB sharing one texture.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, mergeDocuments, prune, quantize, resample, textureCompress, unpartition } from '@gltf-transform/functions';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const src = process.argv[2] ?? '../assets';
const out = 'public/models';
fs.mkdirSync(out, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

const KEEP = ['Idle', 'Running_A', 'Running_Strafe_Left', 'Running_Strafe_Right', 'Jump_Start', 'Jump_Idle', 'Jump_Land', 'Dodge_Forward', 'Hit_A', 'Death_A', 'Cheer', 'Use_Item'];
const DROP_NODE = /Knife|Crossbow|Throwable|Spellbook|Wand|Staff|Sword|Shield|Axe|Mug/;
const chars = { ash: 'Rogue_Hooded', vex: 'Rogue', mira: 'Mage', bolt: 'Knight', grom: 'Barbarian' };
const charDir = path.join(src, 'KayKit-Character-Pack-Adventures-1.0/addons/kaykit_character_pack_adventures/Characters/gltf');
for (const [id, file] of Object.entries(chars)) {
  const doc = await io.read(path.join(charDir, file + '.glb'));
  const root = doc.getRoot();
  for (const a of root.listAnimations()) if (!KEEP.includes(a.getName())) a.dispose();
  for (const n of root.listNodes()) if (DROP_NODE.test(n.getName())) n.dispose();
  const missing = KEEP.filter((k) => !root.listAnimations().some((a) => a.getName() === k));
  if (missing.length) throw new Error(`${file} is missing clips: ${missing}`);
  await doc.transform(prune(), dedup(), resample({ tolerance: 0.001 }), quantize(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 90 }));
  const p = path.join(out, `runner-${id}.glb`);
  await io.write(p, doc);
  console.log(p, (fs.statSync(p).size / 1024).toFixed(0) + ' KB', root.listAnimations().length + ' clips');
}

async function bundle(name, files) {
  let master = null;
  for (const [label, file] of files) {
    if (!fs.existsSync(file)) throw new Error('missing asset ' + file);
    const doc = await io.read(file);
    const scene = doc.getRoot().listScenes()[0];
    const holder = doc.createNode(label);
    for (const c of scene.listChildren()) holder.addChild(c);
    scene.addChild(holder);
    if (!master) master = doc;
    else {
      mergeDocuments(master, doc);
      const [first, ...rest] = master.getRoot().listScenes();
      for (const s of rest) { for (const c of s.listChildren()) first.addChild(c); s.dispose(); }
    }
  }
  await master.transform(dedup(), prune(), unpartition(), textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 92 }));
  const p = path.join(out, name + '.glb');
  await io.write(p, master);
  console.log(p, (fs.statSync(p).size / 1024).toFixed(0) + ' KB', files.length + ' models');
}

const city = path.join(src, 'KayKit-City-Builder-Bits-1.0/addons/kaykit_city_builder_bits/Assets/gltf');
const cityNames = ['building_A_withoutBase', 'building_B_withoutBase', 'building_C_withoutBase', 'building_D_withoutBase', 'building_E_withoutBase', 'building_F_withoutBase', 'building_G_withoutBase', 'building_H_withoutBase',
  'streetlight', 'bench', 'bush', 'box_A', 'box_B', 'dumpster', 'watertower', 'trash_A', 'trash_B', 'firehydrant', 'trafficlight_A', 'car_taxi', 'car_sedan', 'car_hatchback', 'car_police', 'car_stationwagon'];
await bundle('city', cityNames.map((n) => [n.replace('_withoutBase', ''), path.join(city, n + '.gltf')]));
await bundle('nature', [
  ['trees', path.join(src, 'Starter-Kit-City-Builder/models/grass-trees.glb')],
  ['trees_tall', path.join(src, 'Starter-Kit-City-Builder/models/grass-trees-tall.glb')],
  ['cloud', path.join(src, 'Starter-Kit-3D-Platformer/models/cloud.glb')],
  ['coin', path.join(src, 'Starter-Kit-3D-Platformer/models/coin.glb')],
]);
