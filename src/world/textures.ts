import * as THREE from 'three';

export function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = false) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const speckle = (g: CanvasRenderingContext2D, n: number, size: number, tone: (r: number) => string) => {
  for (let i = 0; i < n; i++) {
    g.fillStyle = tone(Math.random());
    g.beginPath();
    g.ellipse(Math.random() * 256, Math.random() * 256, 1 + Math.random() * size, 1 + Math.random() * size * 0.7, Math.random() * 3, 0, 7);
    g.fill();
  }
};

/** Crushed-stone track ballast. */
export const ballastTexture = () =>
  canvasTex(256, 256, (g) => {
    g.fillStyle = '#8a8178';
    g.fillRect(0, 0, 256, 256);
    speckle(g, 1500, 4, (r) => `hsl(${24 + r * 14},${8 + r * 8}%,${34 + r * 34}%)`);
    speckle(g, 500, 2, (r) => `rgba(40,34,30,${0.2 + r * 0.3})`);
  }, true);

/** Paved platform / street slabs. */
export const pavingTexture = () =>
  canvasTex(256, 256, (g) => {
    g.fillStyle = '#c9c2b6';
    g.fillRect(0, 0, 256, 256);
    speckle(g, 500, 3, (r) => `rgba(${r > 0.5 ? '255,255,255' : '80,70,60'},${0.05 + r * 0.06})`);
    g.strokeStyle = 'rgba(70,62,54,.55)';
    g.lineWidth = 3;
    for (let i = 0; i <= 256; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); }
  }, true);

export const hazardTexture = (a: string, b: string) =>
  canvasTex(256, 64, (g) => {
    g.fillStyle = a;
    g.fillRect(0, 0, 256, 64);
    g.fillStyle = b;
    for (let x = -64; x < 256; x += 64) {
      g.beginPath();
      g.moveTo(x, 64); g.lineTo(x + 32, 64); g.lineTo(x + 64, 0); g.lineTo(x + 32, 0);
      g.fill();
    }
  });

export const signTexture = (text: string, bg: string, fg: string, sub = '') =>
  canvasTex(512, 128, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, 512, 128);
    g.fillStyle = fg;
    g.fillRect(0, 0, 512, 10);
    g.fillRect(0, 118, 512, 10);
    g.font = `400 ${sub ? 58 : 68}px "Lilita One", system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 256, sub ? 52 : 66);
    if (sub) { g.font = '800 22px Nunito, system-ui, sans-serif'; g.fillText(sub, 256, 98); }
  });

/** Original fictional advertising posters for billboards. */
const ADS: [string, string, string, string][] = [
  ['FIZZ UP!', 'citrus soda', '#ff7a1a', '#fff4c2'],
  ['KITE AIR', 'fly somewhere new', '#1f8fff', '#e6f6ff'],
  ['MOON BUN', 'bakery · open late', '#7b4cff', '#ffe9f4'],
  ['GO SLOW', 'city bikes', '#16b47a', '#f2ffe6'],
  ['PIXEL PETS', 'adopt today', '#ff4f8b', '#fff0d6'],
  ['NOVA FM', '98.6 all night', '#16223f', '#ffd447'],
];
export const adTexture = (i: number) => {
  const [title, sub, bg, fg] = ADS[i % ADS.length];
  return canvasTex(512, 256, (g) => {
    const gr = g.createLinearGradient(0, 0, 512, 256);
    gr.addColorStop(0, bg);
    gr.addColorStop(1, '#000');
    g.fillStyle = bg;
    g.fillRect(0, 0, 512, 256);
    g.globalAlpha = 0.25;
    g.fillStyle = gr;
    g.fillRect(0, 0, 512, 256);
    g.globalAlpha = 0.18;
    g.fillStyle = fg;
    for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(420 - k * 14, 60 + k * 30, 150 - k * 26, 0, 7); g.fill(); }
    g.globalAlpha = 1;
    g.fillStyle = fg;
    g.font = '400 92px "Lilita One", system-ui, sans-serif';
    g.textBaseline = 'middle';
    g.fillText(title, 30, 110);
    g.font = '800 30px Nunito, system-ui, sans-serif';
    g.fillText(sub.toUpperCase(), 34, 188);
  });
};

/** Icon discs for power-up pickups (also reused by the HUD via toDataURL-free CSS icons). */
export const pickupTexture = (kind: 'magnet' | 'shield' | 'double', color: string) =>
  canvasTex(256, 256, (g) => {
    const gr = g.createRadialGradient(128, 110, 20, 128, 128, 128);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(0.35, color);
    gr.addColorStop(1, '#10122e');
    g.fillStyle = gr;
    g.beginPath(); g.arc(128, 128, 126, 0, 7); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 10;
    g.beginPath(); g.arc(128, 128, 112, 0, 7); g.stroke();
    g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round';
    if (kind === 'magnet') {
      g.lineWidth = 34;
      g.beginPath(); g.moveTo(84, 78); g.lineTo(84, 134); g.arc(128, 134, 44, Math.PI, 0, true); g.lineTo(172, 78); g.stroke();
      g.strokeStyle = '#ff4d5e'; g.lineCap = 'butt';
      g.beginPath(); g.moveTo(84, 62); g.lineTo(84, 92); g.moveTo(172, 62); g.lineTo(172, 92); g.stroke();
    } else if (kind === 'shield') {
      g.beginPath(); g.moveTo(128, 56); g.lineTo(186, 78); g.lineTo(186, 128); g.quadraticCurveTo(186, 180, 128, 204); g.quadraticCurveTo(70, 180, 70, 128); g.lineTo(70, 78); g.closePath(); g.fill();
      g.fillStyle = color; g.beginPath(); g.moveTo(128, 82); g.lineTo(164, 96); g.lineTo(164, 130); g.quadraticCurveTo(164, 164, 128, 180); g.closePath(); g.fill();
    } else {
      g.font = '400 120px "Lilita One", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('×2', 128, 136);
    }
  });

export const softDot = () =>
  canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.5, 'rgba(255,255,255,.6)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  });

// ---------------------------------------------------------------- pursuit environments
export type RoadKind = 'city' | 'highway' | 'tunnel' | 'yard' | 'night' | 'alley';
/** Three-lane road surface. One tile is the full road width by 12 m of length. */
export const roadTexture = (kind: RoadKind) =>
  canvasTex(256, 512, (g) => {
    const base = { city: '#4a4d57', highway: '#3f424b', tunnel: '#35373f', yard: '#8d8a84', night: '#2c2f3a', alley: '#5b5a5c' }[kind];
    g.fillStyle = base;
    g.fillRect(0, 0, 256, 512);
    for (let i = 0; i < 2600; i++) {
      const r = Math.random();
      g.fillStyle = `rgba(${r > 0.5 ? '255,255,255' : '0,0,0'},${0.03 + r * 0.05})`;
      g.fillRect(Math.random() * 256, Math.random() * 512, 1 + Math.random() * 2, 1 + Math.random() * 3);
    }
    // tyre wear down each lane
    for (const x of [43, 128, 213]) { const gr = g.createLinearGradient(x - 30, 0, x + 30, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(0,0,0,.12)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - 30, 0, 60, 512); }
    if (kind === 'alley') {
      g.strokeStyle = 'rgba(20,20,22,.5)'; g.lineWidth = 2;
      for (let i = 0; i < 9; i++) { g.beginPath(); let x = Math.random() * 256, y = Math.random() * 512; g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (Math.random() - 0.5) * 60; y += Math.random() * 40; g.lineTo(x, y); } g.stroke(); }
      for (let i = 0; i < 3; i++) { g.fillStyle = 'rgba(30,40,60,.35)'; g.beginPath(); g.ellipse(Math.random() * 256, Math.random() * 512, 24 + Math.random() * 30, 12 + Math.random() * 14, Math.random() * 3, 0, 7); g.fill(); }
      return;
    }
    const line = kind === 'yard' ? '#f2b705' : kind === 'night' ? '#ff9a2e' : '#f4f1e6';
    g.fillStyle = line;
    const dash = kind === 'highway' ? 300 : 210;
    for (const x of [85, 171]) { g.fillRect(x - 3, 20, 6, dash); }
    g.fillStyle = kind === 'yard' ? '#f2b705' : kind === 'tunnel' ? '#f2c230' : '#f4f1e6';
    g.fillRect(3, 0, 6, 512);
    g.fillRect(247, 0, 6, 512);
    if (kind === 'yard') { g.fillStyle = 'rgba(40,36,30,.25)'; for (let i = 0; i < 14; i++) g.fillRect(Math.random() * 256, Math.random() * 512, 30 + Math.random() * 40, 2); }
  }, true);

export const zebraTexture = () =>
  canvasTex(256, 64, (g) => {
    g.clearRect(0, 0, 256, 64);
    g.fillStyle = '#f4f1e6';
    for (let x = 6; x < 256; x += 28) g.fillRect(x, 4, 16, 56);
  });

export const brickTexture = (brick: string, mortar = '#3a3233') =>
  canvasTex(256, 256, (g) => {
    g.fillStyle = mortar;
    g.fillRect(0, 0, 256, 256);
    const c = new THREE.Color(brick);
    for (let row = 0; row < 16; row++) for (let col = -1; col < 8; col++) {
      const v = 0.82 + Math.random() * 0.3;
      g.fillStyle = `rgb(${Math.min(255, c.r * 255 * v) | 0},${Math.min(255, c.g * 255 * v) | 0},${Math.min(255, c.b * 255 * v) | 0})`;
      g.fillRect(col * 32 + (row % 2 ? 16 : 0) + 1, row * 16 + 1, 30, 14);
    }
    speckle(g, 160, 3, (r) => `rgba(0,0,0,${0.04 + r * 0.08})`);
  }, true);

export const concreteTexture = (tone = '#8c8f96', panels = true) =>
  canvasTex(256, 256, (g) => {
    g.fillStyle = tone;
    g.fillRect(0, 0, 256, 256);
    speckle(g, 700, 4, (r) => `rgba(${r > 0.5 ? '255,255,255' : '0,0,0'},${0.03 + r * 0.05})`);
    for (let i = 0; i < 6; i++) { const x = Math.random() * 256; const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, 'rgba(20,20,24,.28)'); gr.addColorStop(1, 'rgba(20,20,24,0)'); g.fillStyle = gr; g.fillRect(x, 0, 6 + Math.random() * 14, 256); }
    if (!panels) return;
    g.strokeStyle = 'rgba(30,30,36,.5)'; g.lineWidth = 3;
    g.strokeRect(1.5, 1.5, 253, 253);
    g.fillStyle = 'rgba(30,30,36,.5)';
    for (const [x, y] of [[20, 20], [236, 20], [20, 236], [236, 236]]) { g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); }
  }, true);

export const corrugatedTexture = (color: string) =>
  canvasTex(128, 128, (g) => {
    g.fillStyle = color;
    g.fillRect(0, 0, 128, 128);
    for (let x = 0; x < 128; x += 16) { const gr = g.createLinearGradient(x, 0, x + 16, 0); gr.addColorStop(0, 'rgba(255,255,255,.16)'); gr.addColorStop(0.5, 'rgba(0,0,0,.2)'); gr.addColorStop(1, 'rgba(255,255,255,.16)'); g.fillStyle = gr; g.fillRect(x, 0, 16, 128); }
    speckle(g, 60, 3, (r) => `rgba(60,30,10,${0.05 + r * 0.1})`);
  }, true);

export const waterTexture = (night: boolean) =>
  canvasTex(256, 256, (g) => {
    g.fillStyle = night ? '#0b1730' : '#2b7fb8';
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = night ? 'rgba(150,190,255,.22)' : 'rgba(255,255,255,.35)';
    g.lineWidth = 2; g.lineCap = 'round';
    for (let i = 0; i < 90; i++) { const x = Math.random() * 256, y = Math.random() * 256, w = 8 + Math.random() * 26; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + w / 2, y - 3, x + w, y); g.stroke(); }
  }, true);

/** Grid of windows for walls and distant night skylines; `lit` is the share that glow. */
export const windowsTexture = (wall: string, lit: number, glow = '#ffd98a') =>
  canvasTex(256, 256, (g) => {
    g.fillStyle = wall;
    g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      g.fillStyle = Math.random() < lit ? glow : 'rgba(10,14,26,.85)';
      g.fillRect(x * 32 + 8, y * 32 + 7, 16, 19);
    }
  }, true);

export const tapeTexture = (text: string, bg: string, fg: string) =>
  canvasTex(512, 64, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, 512, 64);
    g.fillStyle = fg;
    g.font = '400 40px "Lilita One", system-ui, sans-serif';
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    g.fillText(text, 128, 34);
    g.fillText(text, 384, 34);
  }, true);

/** Chevron painted on the road by the Tactical Scan ability. */
export const chevronTexture = () =>
  canvasTex(128, 128, (g) => {
    g.clearRect(0, 0, 128, 128);
    g.strokeStyle = '#fff'; g.lineWidth = 15; g.lineJoin = 'round'; g.lineCap = 'round';
    for (const y of [120, 82, 44]) { g.beginPath(); g.moveTo(14, y); g.lineTo(64, y - 30); g.lineTo(114, y); g.stroke(); }
  });

/** Overhead highway direction sign. */
export const gantryTexture = (left: string, right: string) =>
  canvasTex(512, 128, (g) => {
    g.fillStyle = '#0d6b3f';
    g.fillRect(0, 0, 512, 128);
    g.strokeStyle = '#fff'; g.lineWidth = 6;
    g.strokeRect(6, 6, 244, 116); g.strokeRect(262, 6, 244, 116);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '400 40px "Lilita One", system-ui, sans-serif';
    g.fillText(left, 128, 52); g.fillText(right, 384, 52);
    g.font = '800 26px Nunito, system-ui, sans-serif';
    g.fillText('^  ^', 128, 96); g.fillText('^', 384, 96);
  });
