import type { Quality } from '../core/Save';
import type { PowerKind } from '../systems/PowerUps';
import { POWER_KINDS } from '../systems/PowerUps';
import { POWER_COLORS } from '../world/ObstacleFactory';

const $ = (id: string) => document.getElementById(id)!;
const icon = (name: string) => `<svg><use href="#i-${name}"/></svg>`;
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const AVATAR: Record<string, string> = { ash: '#5d6bff', vex: '#19b98a', mira: '#b65bff', bolt: '#9aa7b8', grom: '#ff7a3c' };

export type Screen = 'splash' | 'menu' | 'hud' | 'pause' | 'over';
export type SheetName = 'runners' | 'missions' | 'shop' | 'settings';
export interface MissionRow { id: string; text: string; progress: number; target: number; reward: number; done: boolean }
export interface MenuModel {
  coins: number; best: number; level: number; xpFrac: number; claimable: number; preview: string; canInstall: boolean;
  chars: { id: string; name: string; blurb: string; cost: number; owned: boolean; selected: boolean }[];
  upgrades: { kind: PowerKind; name: string; desc: string; level: number; max: number; duration: number; cost: number }[];
  missions: MissionRow[];
  settings: { music: number; sfx: number; quality: Quality; sensitivity: number; haptics: boolean };
}
export interface OverModel { score: number; distance: number; coins: number; best: number; record: boolean; level: number; levelUp: boolean; xpFrac: number; missions: MissionRow[] }
export interface UiHandlers {
  play(): void; pause(): void; resume(): void; home(): void; retry(): void; click(): void;
  sheet(s: SheetName | null): void; previewChar(id: string): void; chooseChar(id: string): void;
  buyUpgrade(k: PowerKind): void; claim(id: string): void; setting(key: string, value: number | string | boolean): void;
  resetProgress(): void; install(): void;
}
const TITLES: Record<SheetName, string> = { runners: 'RUNNERS', missions: 'MISSIONS', shop: 'UPGRADES', settings: 'SETTINGS' };

/** DOM overlay: menus, sheets, HUD and results. Only touches the DOM when values change. */
export class Ui {
  private cache: Record<string, string> = {};
  private toastT = 0;
  private countT = 0;
  private powerEls = {} as Record<PowerKind, { root: HTMLElement; bar: HTMLElement }>;

  constructor(h: UiHandlers) {
    const bind = (id: string, fn: () => void) => $(id).addEventListener('click', () => { h.click(); fn(); });
    bind('btn-play', h.play); bind('btn-pause', h.pause); bind('btn-resume', h.resume);
    bind('btn-quit', h.home); bind('btn-home', h.home); bind('btn-retry', h.retry);
    bind('sheet-close', () => h.sheet(null));
    bind('btn-reset-no', () => $('confirm').classList.remove('show'));
    bind('btn-reset-yes', () => { $('confirm').classList.remove('show'); h.resetProgress(); });
    document.querySelectorAll<HTMLElement>('nav [data-sheet]').forEach((b) => b.addEventListener('click', () => { h.click(); h.sheet(b.dataset.sheet as SheetName); }));

    // one delegated listener for everything rendered inside a sheet
    const body = $('sheet-body');
    body.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (!t || t.hasAttribute('disabled')) return;
      h.click();
      const { act, id } = t.dataset;
      if (act === 'preview') h.previewChar(id!);
      else if (act === 'choose') h.chooseChar(id!);
      else if (act === 'upgrade') h.buyUpgrade(id as PowerKind);
      else if (act === 'claim') h.claim(id!);
      else if (act === 'quality') { h.setting('quality', id!); body.querySelectorAll('.seg button').forEach((b) => b.classList.toggle('on', b === t)); }
      else if (act === 'haptics') { const on = !t.classList.contains('on'); t.classList.toggle('on', on); h.setting('haptics', on); if (on) navigator.vibrate?.(40); }
      else if (act === 'reset') $('confirm').classList.add('show');
      else if (act === 'install') h.install();
    });
    body.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.dataset.set) h.setting(t.dataset.set, +t.value);
    });
    body.addEventListener('change', (e) => { if ((e.target as HTMLInputElement).dataset.set === 'sfx') h.click(); });

    const touch = matchMedia('(pointer: coarse)').matches;
    $('hint').textContent = touch ? 'Swipe to dodge, jump and slide · drag to turn your runner' : 'Arrow keys / WASD · Space to jump · Esc to pause';
    for (const k of POWER_KINDS) {
      const root = document.createElement('div');
      root.className = 'pw';
      root.innerHTML = `<div class="ico" style="background:${POWER_COLORS[k]}">${icon(k)}</div><div class="t"><i></i></div>`;
      root.style.display = 'none';
      $('powers').appendChild(root);
      this.powerEls[k] = { root, bar: root.querySelector('i')! };
    }
  }

  private set(id: string, v: string) {
    if (this.cache[id] === v) return false;
    this.cache[id] = v;
    $(id).textContent = v;
    return true;
  }

  show(s: Screen) {
    for (const id of ['splash', 'menu', 'hud', 'pause', 'over']) $(id).classList.toggle('show', id === s || (id === 'hud' && s === 'pause'));
    if (s !== 'menu') { $('sheet').classList.remove('show'); $('menu').classList.remove('sheet-open'); }
  }

  loading(f: number) { ($('loadbar') as HTMLElement).style.width = `${Math.round(f * 100)}%`; }

  toast(text: string) {
    const t = $('toast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(this.toastT);
    this.toastT = window.setTimeout(() => t.classList.remove('show'), 2400);
  }

  menu(m: MenuModel, sheet: SheetName | null) {
    this.set('m-coins', fmt(m.coins)); this.set('s-coins', fmt(m.coins)); this.set('m-best', fmt(m.best));
    this.set('m-level', String(m.level)); this.set('m-level2', String(m.level));
    ($('m-xp') as HTMLElement).style.width = `${Math.round(m.xpFrac * 100)}%`;
    const badge = $('badge');
    badge.textContent = String(m.claimable);
    badge.classList.toggle('on', m.claimable > 0);
    $('sheet').classList.toggle('show', !!sheet);
    $('menu').classList.toggle('sheet-open', !!sheet);
    if (!sheet) return;
    $('sheet-title').textContent = TITLES[sheet];
    const body = $('sheet-body');
    const scroll = body.querySelector('.chars')?.scrollLeft ?? 0;
    body.innerHTML = sheet === 'runners' ? this.runners(m) : sheet === 'missions' ? this.missionList(m) : sheet === 'shop' ? this.shop(m) : this.settings(m);
    const row = body.querySelector('.chars');
    if (row) row.scrollLeft = scroll;
  }

  private runners(m: MenuModel) {
    const cur = m.chars.find((c) => c.id === m.preview) ?? m.chars[0];
    const cards = m.chars.map((c) => `<button data-act="preview" data-id="${c.id}" class="${c.id === cur.id ? 'on' : ''}">
      <span class="av" style="background:${AVATAR[c.id]}">${c.name[0]}</span>${c.name}
      <small>${c.selected ? icon('check') + 'In use' : c.owned ? 'Owned' : icon('lock') + fmt(c.cost)}</small></button>`).join('');
    const action = cur.selected ? `<button class="btn small mint" disabled>${icon('check')}SELECTED</button>`
      : cur.owned ? `<button class="btn small gold" data-act="choose" data-id="${cur.id}">SELECT</button>`
      : `<button class="btn small gold" data-act="choose" data-id="${cur.id}" ${m.coins < cur.cost ? 'disabled' : ''}><span class="cost">${icon('coin')}${fmt(cur.cost)}</span></button>`;
    return `<div class="who"><div class="txt"><h3>${cur.name}</h3><p>${cur.blurb}</p></div>${action}</div><div class="chars">${cards}</div>`;
  }

  private missionList(m: MenuModel) {
    return m.missions.map((x) => `<div class="card"><div class="ico" style="background:${x.done ? '#1fc48e' : '#2a9dff'}">${icon(x.done ? 'check' : 'target')}</div>
      <div class="txt"><h3>${x.text}</h3><div class="prog ${x.done ? 'done' : ''}"><i style="width:${Math.round((x.progress / x.target) * 100)}%"></i></div><p>${fmt(x.progress)} / ${fmt(x.target)}</p></div>
      <button class="btn small ${x.done ? 'mint' : ''}" data-act="claim" data-id="${x.id}" ${x.done ? '' : 'disabled'}><span class="cost">${icon('coin')}${fmt(x.reward)}</span></button></div>`).join('')
      + '<p class="hint">Claim a mission to get the next one.</p>';
  }

  private shop(m: MenuModel) {
    return m.upgrades.map((u) => `<div class="card"><div class="ico" style="background:${POWER_COLORS[u.kind]}">${icon(u.kind)}</div>
      <div class="txt"><h3>${u.name}</h3><p>${u.desc} · lasts ${u.duration.toFixed(1).replace('.0', '')} s</p><div class="pips">${Array.from({ length: u.max }, (_, i) => `<i class="${i < u.level ? 'on' : ''}"></i>`).join('')}</div></div>
      ${u.level >= u.max ? `<button class="btn small mint" disabled>MAX</button>` : `<button class="btn small gold" data-act="upgrade" data-id="${u.kind}" ${m.coins < u.cost ? 'disabled' : ''}><span class="cost">${icon('coin')}${fmt(u.cost)}</span></button>`}</div>`).join('');
  }

  private settings(m: MenuModel) {
    const s = m.settings;
    const q = (['auto', 'low', 'medium', 'high'] as Quality[]).map((v) => `<button data-act="quality" data-id="${v}" class="${s.quality === v ? 'on' : ''}">${v === 'medium' ? 'Med' : v}</button>`).join('');
    return `<label class="set">Music<input type="range" min="0" max="1" step="0.05" value="${s.music}" data-set="music"></label>
      <label class="set">Sound<input type="range" min="0" max="1" step="0.05" value="${s.sfx}" data-set="sfx"></label>
      <div class="set">Graphics<div class="seg">${q}</div></div>
      <label class="set">Swipe sensitivity<input type="range" min="0.6" max="1.8" step="0.1" value="${s.sensitivity}" data-set="sensitivity"></label>
      <div class="set">Vibration<button class="toggle ${s.haptics ? 'on' : ''}" data-act="haptics" aria-label="Vibration"></button></div>
      ${m.canInstall ? `<div class="set">Install as app<button class="btn small gold" data-act="install">INSTALL</button></div>` : ''}
      <div class="set">Reset progress<button class="btn small red" data-act="reset">RESET</button></div>`;
  }

  hud(score: number, coins: number, dist: number) {
    this.set('h-score', fmt(score));
    this.set('h-dist', fmt(dist));
    if (this.set('h-coins', fmt(coins)) && coins > 0) {
      const p = $('h-coinchip');
      p.classList.remove('pop');
      void p.offsetWidth;
      p.classList.add('pop');
    }
  }

  powers(left: Record<PowerKind, number>, total: Record<PowerKind, number>) {
    for (const k of POWER_KINDS) {
      const el = this.powerEls[k];
      const on = left[k] > 0;
      if ((el.root.style.display !== 'none') !== on) el.root.style.display = on ? '' : 'none';
      if (on) el.bar.style.width = `${Math.round((left[k] / total[k]) * 100)}%`;
    }
  }

  over(o: OverModel) {
    this.set('o-title', o.record ? 'WHAT A RUN!' : 'RUN OVER');
    this.set('o-dist', `${fmt(o.distance)} m`); this.set('o-coins', fmt(o.coins)); this.set('o-best', fmt(o.best));
    this.set('o-level', o.levelUp ? `LEVEL UP! ${o.level}` : `LEVEL ${o.level}`);
    $('o-record').classList.toggle('on', o.record);
    const xp = $('o-xp') as HTMLElement;
    xp.style.width = '0%';
    requestAnimationFrame(() => requestAnimationFrame(() => { xp.style.width = `${Math.round(o.xpFrac * 100)}%`; }));
    $('o-missions').innerHTML = o.missions.map((x) => `<div>${x.done ? icon('check') : ''}<span>${x.text}</span><div class="prog ${x.done ? 'done' : ''}"><i style="width:${Math.round((x.progress / x.target) * 100)}%"></i></div></div>`).join('');
    // score count-up
    const el = $('o-score');
    const t0 = performance.now();
    clearInterval(this.countT);
    this.countT = window.setInterval(() => {
      const f = Math.min(1, (performance.now() - t0) / 900);
      el.textContent = fmt(o.score * (1 - Math.pow(1 - f, 3)));
      if (f >= 1) clearInterval(this.countT);
    }, 30);
  }
}
