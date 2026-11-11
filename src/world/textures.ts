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
