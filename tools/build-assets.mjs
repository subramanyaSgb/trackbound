// Asset pipeline: turns the CC0 source packs into small, game-ready GLBs.
//   node tools/build-assets.mjs <dir containing the cloned packs>   (default ../assets)
// Characters: weapon props are stripped; the shared animation set (one rig for every
// body) is stored once, in char-knight.glb. Props: many glTF files are merged into
// one GLB per bundle, sharing textures.
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

// ---------------------------------------------------------------- characters
const KEEP = [
  'Idle', 'Unarmed_Idle', 'Walking_A', 'Running_A', 'Running_B', 'Running_Strafe_Left', 'Running_Strafe_Right',
  'Jump_Start', 'Jump_Idle', 'Jump_Land', 'Dodge_Forward', 'Dodge_Left', 'Dodge_Right',
  'Hit_A', 'Hit_B', 'Death_A', 'Death_B', 'Cheer', 'Use_Item', 'Interact', 'PickUp', 'Throw',
  'Sit_Chair_Idle', 'Sit_Floor_Idle', 'Sit_Floor_Down', 'Lie_Down', 'Lie_Idle',
  '1H_Ranged_Aiming', '1H_Ranged_Shoot', 'Spellcast_Raise', 'Spellcast_Shoot', 'Block', 'Blocking',
  'Unarmed_Melee_Attack_Punch_A', 'Unarmed_Melee_Attack_Kick',
];
const DROP_NODE = /Knife|Crossbow|Throwable|Spellbook|Wand|Staff|Sword|Shield|Axe|Mug/;
const chars = { knight: 'Knight', rogue: 'Rogue', hooded: 'Rogue_Hooded', mage: 'Mage', barbarian: 'Barbarian' };
const charDir = path.join(src, 'KayKit-Character-Pack-Adventures-1.0/addons/kaykit_character_pack_adventures/Characters/gltf');
for (const [id, file] of Object.entries(chars)) {
  const doc = await io.read(path.join(charDir, file + '.glb'));
  const root = doc.getRoot();
  const keepClips = id === 'knight';
  for (const a of root.listAnimations()) if (!keepClips || !KEEP.includes(a.getName())) { for (const c of a.listChannels()) c.dispose(); for (const sm of a.listSamplers()) sm.dispose(); a.dispose(); }
  for (const n of root.listNodes()) if (DROP_NODE.test(n.getName())) n.dispose();
  if (keepClips) {
    const missing = KEEP.filter((k) => !root.listAnimations().some((a) => a.getName() === k));
    if (missing.length) throw new Error(`${file} is missing clips: ${missing}`);
  }
  await doc.transform(prune({ keepLeaves: true }), dedup(), resample({ tolerance: 0.001 }), quantize(), textureCompress({ encoder: sharp, targetFormat: 'png', resize: [512, 512] }));
  const p = path.join(out, `char-${id}.glb`);
  await io.write(p, doc);
  console.log(p, (fs.statSync(p).size / 1024).toFixed(0) + ' KB', root.listAnimations().length + ' clips');
}

// ---------------------------------------------------------------- prop bundles
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
const from = (dir, names, ext = '.gltf', rename = (n) => n) => names.map((n) => [rename(n), path.join(dir, n + ext)]);

const city = path.join(src, 'KayKit-City-Builder-Bits-1.0/addons/kaykit_city_builder_bits/Assets/gltf');
const space = path.join(src, 'KayKit-Space-Base-Bits-1.0/addons/kaykit_space_base_bits/Assets/gltf');
const proto = path.join(src, 'KayKit-Prototype-Bits-1.0/addons/kaykit_prototype_bits/Assets/gltf');
const food = path.join(src, 'KayKit-Restaurant-Bits-1.0/addons/kaykit_restaurant_bits/Assets/gltf');
const racing = path.join(src, 'Starter-Kit-Racing/models');

await bundle('city', [
  ...from(city, ['building_A_withoutBase', 'building_B_withoutBase', 'building_C_withoutBase', 'building_D_withoutBase', 'building_E_withoutBase', 'building_F_withoutBase', 'building_G_withoutBase', 'building_H_withoutBase'], '.gltf', (n) => n.replace('_withoutBase', '')),
  ...from(city, ['streetlight', 'bench', 'bush', 'box_A', 'box_B', 'dumpster', 'watertower', 'trash_A', 'trash_B', 'firehydrant', 'trafficlight_A', 'trafficlight_B', 'trafficlight_C']),
]);
await bundle('vehicles', [
  ...from(city, ['car_taxi', 'car_sedan', 'car_hatchback', 'car_police', 'car_stationwagon']),
  ...from(space, ['spacetruck', 'spacetruck_large'], '.gltf', (n) => n.replace('spacetruck', 'van')),
  ...from(racing, ['vehicle-motorcycle', 'vehicle-truck-green', 'vehicle-truck-purple', 'vehicle-truck-red', 'vehicle-truck-yellow'], '.glb', (n) => n.replace('vehicle-', '').replace('-', '_')),
]);
await bundle('props', [
  ...from(space, ['containers_A', 'containers_B', 'containers_C', 'containers_D', 'cargo_A', 'cargo_A_packed', 'cargo_A_stacked', 'cargo_B', 'cargo_B_packed', 'cargo_B_stacked', 'cargodepot_A', 'cargodepot_B', 'cargodepot_C', 'structure_low', 'structure_tall', 'lights', 'basemodule_garage', 'roofmodule_cargo_A']),
  ...from(proto, ['Barrel_A', 'Barrel_B', 'Barrel_C', 'Pallet_Large', 'Pallet_Small', 'Pallet_Small_Decorated_A', 'Pallet_Small_Decorated_B', 'Box_A', 'Box_B', 'Box_C', 'Coin_A']),
  ...from(food, ['table_round_A_decorated', 'table_round_A_small_decorated', 'chair_A', 'chair_stool', 'crate_tomatoes', 'crate_carrots', 'crate_cheese', 'crate_lettuce', 'crate_buns', 'menu', 'kitchentable_A_large_decorated', 'wall_orderwindow_decorated']),
]);
await bundle('nature', [
  ['trees', path.join(src, 'Starter-Kit-City-Builder/models/grass-trees.glb')],
  ['trees_tall', path.join(src, 'Starter-Kit-City-Builder/models/grass-trees-tall.glb')],
  ['cloud', path.join(src, 'Starter-Kit-3D-Platformer/models/cloud.glb')],
  ['coin', path.join(src, 'Starter-Kit-3D-Platformer/models/coin.glb')],
]);
