// Renders public/icon.svg into the PNG icons the web app manifest needs.
import sharp from 'sharp';
import fs from 'node:fs';
const svg = fs.readFileSync('public/icon.svg');
await sharp(svg).resize(192, 192).png().toFile('public/icon-192.png');
await sharp(svg).resize(512, 512).png().toFile('public/icon-512.png');
// maskable: full-bleed background with the artwork inside the safe zone
const inner = await sharp(svg).resize(400, 400).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#2337c6' } }).composite([{ input: inner, left: 56, top: 56 }]).png().toFile('public/icon-maskable-512.png');
console.log('icons written');
