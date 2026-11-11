import type { Quality, UpgradeKind } from '../core/Save';
import type { AbilityDef } from '../data/abilities';
import type { CaptureType } from '../data/missions';
import { CAPTURE_TEXT } from '../pursuit/Capture';
import type { PowerKind } from '../systems/PowerUps';
import { POWER_KINDS } from '../systems/PowerUps';
import { POWER_COLORS } from '../world/ObstacleFactory';

const $ = (id: string) => document.getElementById(id)!;
const icon = (name: string) => `<svg><use href="#i-${name}"/></svg>`;
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const pct = (f: number) => `${Math.round(Math.min(1, Math.max(0, f)) * 100)}%`;

export type Screen = 'splash' | 'menu' | 'hud' | 'pause' | 'over' | 'cine';
export type SheetName = 'heroes' | 'missions' | 'bounties' | 'shop' | 'seasons' | 'settings';
export interface BountyRow { id: string; text: string; progress: number; target: number; reward: number; done: boolean }
export interface MenuModel {
  coins: number; level: number; xpFrac: number; claimable: number; preview: string; canInstall: boolean;
  totalDistance: number; arrests: number; patrolBest: number;
  chars: { id: string; name: string; title: string; blurb: string; color: string; cost: number; owned: boolean; selected: boolean;
    ability: { name: string; desc: string; icon: string; color: string; cost: number; duration: number; cooldown: number } }[];
  upgrades: { kind: UpgradeKind; name: string; desc: string; color: string; icon: string; level: number; max: number; cost: number }[];
  bounties: BountyRow[];
  mission: { id: string; title: string; brief: string; criminal: string; length: number; checkpoint: string; at: number; patrol: boolean };
  missions: { id: string; title: string; brief: string; criminal: string; length: number; boss: boolean; patrol: boolean; state: 'locked' | 'open' | 'done'; selected: boolean; lock: string; checkpoint: string; reward: number }[];
  seasons: { id: string; number: number; name: string; tagline: string; colors: [string, string]; status: 'live' | 'upcoming' | 'ended'; preview: string[]; xp: number; heroes: string[];
    rewards: { xp: number; coins: number; label: string; state: 'claimed' | 'ready' | 'locked' }[] }[];
  settings: { music: number; sfx: number; quality: Quality; sensitivity: number; haptics: boolean };
}
export interface HudSetup { title: string; length: number; zones: number[]; patrol: boolean; hearts: number; suspect: string; ability: AbilityDef; touch: boolean }
export interface HudModel {
  distance: number; score: number; coins: number; gap: number; closeness: number; danger: boolean; hearts: number; zone: string;
  ability: { fill: number; ready: boolean; active: boolean; cooling: boolean; charge: number; cost: number; left: number };
}
export interface CaptureModel { phase: 'approach' | 'lock'; type: CaptureType; meter: number; windowAt: number; window: number; hits: number; need: number; tries: number; aligned: boolean; range: number; gap: number }
export interface ResultModel {
  won: boolean; title: string; detail: string; mission: string; distance: number; length: number; coins: number; avoided: number; abilityUses: number; hits: number;
  pursuit: number; reward: number; xp: number; level: number; levelUp: boolean; xpFrac: number; checkpoint: string; next: string; patrol: boolean; hasNext?: boolean;
}
export interface UiHandlers {
  play(): void; pause(): void; resume(): void; home(): void; retry(): void; next(): void; click(): void;
  sheet(s: SheetName | null): void; previewChar(id: string): void; chooseChar(id: string): void;
  buyUpgrade(k: UpgradeKind): void; claim(id: string): void; claimSeason(id: string): void; selectMission(id: string): void;
  setting(key: string, value: number | string | boolean): void;
  resetProgress(): void; install(): void; power(): void; skip(): void;
}
const TITLES: Record<SheetName, string> = { heroes: 'HEROES', missions: 'CASE FILES', bounties: 'BOUNTIES', shop: 'UPGRADES', seasons: 'SEASONS', settings: 'SETTINGS' };

/** DOM overlay: menus, sheets, HUD, cinematic captions and results. Only touches the DOM when values change. */
export class Ui {
  private cache: Record<string, string> = {};
  private toastT = 0;
  private bannerT = 0;
  private radioT = 0;
  private countT = 0;
  private powerEls = {} as Record<PowerKind, { root: HTMLElement; bar: HTMLElement }>;
  private setup: HudSetup | null = null;
  private wonNext = false;
  private capType: CaptureType | null = null;

  constructor(h: UiHandlers) {
    const bind = (id: string, fn: () => void) => $(id).addEventListener('click', () => { h.click(); fn(); });
    bind('btn-play', h.play); bind('btn-pause', h.pause); bind('btn-resume', h.resume);
    bind('btn-quit', h.home); bind('btn-home', h.home);
    bind('btn-retry', () => (this.wonNext ? h.next() : h.retry()));
    bind('sheet-close', () => h.sheet(null));
    bind('btn-reset-no', () => $('confirm').classList.remove('show'));
    bind('btn-reset-yes', () => { $('confirm').classList.remove('show'); h.resetProgress(); });
    document.querySelectorAll<HTMLElement>('#menu [data-sheet]').forEach((b) => b.addEventListener('click', () => { h.click(); h.sheet(b.dataset.sheet as SheetName); }));
    // the action button responds on press, not release, so it is as fast as a key
    $('btn-power').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); h.power(); });
    $('btn-skip').addEventListener('click', () => h.skip());
    $('cine').addEventListener('pointerdown', () => h.skip());

    // one delegated listener for everything rendered inside a sheet
    const body = $('sheet-body');
    body.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (!t || t.hasAttribute('disabled')) return;
      h.click();
      const { act, id } = t.dataset;
      if (act === 'preview') h.previewChar(id!);
      else if (act === 'choose') h.chooseChar(id!);
      else if (act === 'upgrade') h.buyUpgrade(id as UpgradeKind);
      else if (act === 'claim') h.claim(id!);
      else if (act === 'season') h.claimSeason(id!);
      else if (act === 'mission') h.selectMission(id!);
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
    $('hint').textContent = touch ? 'Swipe to dodge, jump and slide · tap the badge button to use your power' : 'Arrows / WASD to move · Space jump · E or Enter for your power · Esc pause';
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
  private style(id: string, prop: string, v: string) {
    const key = id + ':' + prop;
    if (this.cache[key] === v) return;
    this.cache[key] = v;
    $(id).style.setProperty(prop, v);
  }
  private cls(id: string, name: string, on: boolean) {
    const key = id + '.' + name;
    if (this.cache[key] === String(on)) return;
    this.cache[key] = String(on);
    $(id).classList.toggle(name, on);
  }

  show(s: Screen) {
    for (const id of ['splash', 'menu', 'hud', 'pause', 'over', 'cine']) $(id).classList.toggle('show', id === s || (id === 'hud' && s === 'pause'));
    if (s !== 'menu') { $('sheet').classList.remove('show'); $('menu').classList.remove('sheet-open'); }
    if (s !== 'hud' && s !== 'pause') { $('banner').classList.remove('show'); $('radio').classList.remove('show'); this.capture(null); }
  }

  loading(f: number) { ($('loadbar') as HTMLElement).style.width = `${Math.round(f * 100)}%`; }

  toast(text: string) {
    const t = $('toast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(this.toastT);
    this.toastT = window.setTimeout(() => t.classList.remove('show'), 2200);
  }

  /** Big centre-screen announcement (zone changes, GO!, capture prompts). */
  banner(title: string, sub: string, ms = 2000) {
    $('banner-title').textContent = title;
    $('banner-sub').textContent = sub;
    const b = $('banner');
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
    clearTimeout(this.bannerT);
    this.bannerT = window.setTimeout(() => b.classList.remove('show'), ms);
  }

  /** Radio call from dispatch (zone briefings). */
  radio(text: string) {
    $('radio-text').textContent = text;
    $('radio').classList.add('show');
    clearTimeout(this.radioT);
    this.radioT = window.setTimeout(() => $('radio').classList.remove('show'), 5200);
  }

  /** Cinematic lower-third caption; null hides it. */
  caption(head: string | null, text = '') {
    $('caption').classList.toggle('show', head !== null);
    if (head === null) return;
    $('cap-head').textContent = head;
    $('cap-text').textContent = text;
  }

  // ---------------------------------------------------------------- menu and sheets
  menu(m: MenuModel, sheet: SheetName | null) {
    this.set('m-coins', fmt(m.coins)); this.set('s-coins', fmt(m.coins));
    this.set('m-level', String(m.level)); this.set('m-level2', String(m.level));
    ($('m-xp') as HTMLElement).style.width = pct(m.xpFrac);
    const badge = $('badge');
    badge.textContent = String(m.claimable);
    badge.classList.toggle('on', m.claimable > 0);
    const ready = m.seasons.reduce((n, s) => n + s.rewards.filter((r) => r.state === 'ready').length, 0);
    $('badge-season').textContent = String(ready);
    $('badge-season').classList.toggle('on', ready > 0);
    const c = m.mission;
    this.set('c-kind', c.patrol ? 'SCORE ATTACK' : c.checkpoint ? 'CASE IN PROGRESS' : 'CURRENT CASE');
    this.set('c-title', c.title);
    this.set('c-brief', c.brief);
    this.set('c-meta', c.patrol ? `Best score ${fmt(m.patrolBest)}` : c.checkpoint ? `Resume at ${c.checkpoint} · ${fmt(c.at)} / ${fmt(c.length)} m` : `Suspect: ${c.criminal} · ${fmt(c.length)} m pursuit`);
    this.set('play-label', c.patrol ? 'START PATROL' : c.checkpoint ? 'RESUME PURSUIT' : 'START PURSUIT');
    $('sheet').classList.toggle('show', !!sheet);
    $('menu').classList.toggle('sheet-open', !!sheet);
    if (!sheet) return;
    $('sheet-title').textContent = TITLES[sheet];
    const body = $('sheet-body');
    const scroll = body.querySelector('.chars')?.scrollLeft ?? 0;
    const top = body.dataset.sheet === sheet ? body.scrollTop : 0;
    body.dataset.sheet = sheet;
    body.innerHTML = sheet === 'heroes' ? this.heroes(m) : sheet === 'missions' ? this.cases(m) : sheet === 'bounties' ? this.bounties(m) : sheet === 'shop' ? this.shop(m) : sheet === 'seasons' ? this.seasons(m) : this.settings(m);
    const row = body.querySelector('.chars');
    if (row) row.scrollLeft = scroll;
    body.scrollTop = top;
  }

  private heroes(m: MenuModel) {
    const cur = m.chars.find((c) => c.id === m.preview) ?? m.chars[0];
    const cards = m.chars.map((c) => `<button data-act="preview" data-id="${c.id}" class="${c.id === cur.id ? 'on' : ''}">
      <span class="av" style="background:${c.color}">${icon(c.ability.icon)}</span>${c.name.replace('Officer ', '')}
      <small>${c.selected ? icon('check') + 'In use' : c.owned ? 'Owned' : icon('lock') + fmt(c.cost)}</small></button>`).join('');
    const action = cur.selected ? `<button class="btn small mint" disabled>${icon('check')}SELECTED</button>`
      : cur.owned ? `<button class="btn small gold" data-act="choose" data-id="${cur.id}">SELECT</button>`
      : `<button class="btn small gold" data-act="choose" data-id="${cur.id}" ${m.coins < cur.cost ? 'disabled' : ''}><span class="cost">${icon('coin')}${fmt(cur.cost)}</span></button>`;
    const a = cur.ability;
    return `<div class="who"><div class="txt"><h3>${cur.name}</h3><em>${cur.title}${cur.owned ? '' : ' · locked'}</em><p>${cur.blurb}</p></div>${action}</div>
      <div class="card"><div class="ico" style="background:${a.color}">${icon(a.icon)}</div><div class="txt"><h3>${a.name}</h3><p>${a.desc}</p>
      <div class="facts"><span>${icon('coin')}${a.cost} coins to charge</span><span>Lasts ${a.duration} s</span><span>Cooldown ${a.cooldown} s</span></div></div></div>
      <div class="chars">${cards}</div><p class="hint">Drag the hero to turn them around.</p>`;
  }

  private cases(m: MenuModel) {
    return `<p class="hint">Lifetime pursuit: ${fmt(m.totalDistance)} m · Arrests: ${m.arrests}</p>` + m.missions.map((x) => {
      const ico = x.state === 'locked' ? 'lock' : x.state === 'done' ? 'check' : x.patrol ? 'flag' : 'badge';
      const bg = x.state === 'locked' ? '#3a3f66' : x.state === 'done' ? '#1fc48e' : x.boss ? '#e8343a' : x.patrol ? '#2a9dff' : '#ff9d1a';
      const btn = x.state === 'locked' ? '' : x.selected ? `<button class="btn small mint" disabled>${icon('check')}ACTIVE</button>` : `<button class="btn small gold" data-act="mission" data-id="${x.id}">${x.state === 'done' ? 'REPLAY' : 'SELECT'}</button>`;
      const meta = x.patrol ? `Endless · best score ${fmt(m.patrolBest)}` : `${fmt(x.length)} m · ${icon('coin')}${fmt(x.reward)}${x.state === 'done' ? ' · solved' : ''}`;
      return `<div class="card file ${x.state} ${x.boss ? 'boss' : ''}"><div class="ico" style="background:${bg}">${icon(ico)}</div>
        <div class="txt"><h3>${x.boss ? 'BOSS · ' : ''}${x.title}</h3>${x.criminal ? `<em>${x.criminal}</em>` : ''}<p>${x.state === 'locked' ? x.lock : x.brief}</p>
        <div class="facts"><span>${meta}</span>${x.checkpoint ? `<span>${x.checkpoint}</span>` : ''}</div></div>${btn}</div>`;
    }).join('');
  }

  private bounties(m: MenuModel) {
    return m.bounties.map((x) => `<div class="card"><div class="ico" style="background:${x.done ? '#1fc48e' : '#2a9dff'}">${icon(x.done ? 'check' : 'target')}</div>
      <div class="txt"><h3>${x.text}</h3><div class="prog ${x.done ? 'done' : ''}"><i style="width:${Math.round((x.progress / x.target) * 100)}%"></i></div><p>${fmt(x.progress)} / ${fmt(x.target)}</p></div>
      <button class="btn small ${x.done ? 'mint' : ''}" data-act="claim" data-id="${x.id}" ${x.done ? '' : 'disabled'}><span class="cost">${icon('coin')}${fmt(x.reward)}</span></button></div>`).join('')
      + '<p class="hint">Claim a bounty to get the next one.</p>';
  }

  private shop(m: MenuModel) {
    return m.upgrades.map((u) => `<div class="card"><div class="ico" style="background:${u.color}">${icon(u.icon)}</div>
      <div class="txt"><h3>${u.name}</h3><p>${u.desc}</p><div class="pips">${Array.from({ length: u.max }, (_, i) => `<i class="${i < u.level ? 'on' : ''}"></i>`).join('')}</div></div>
      ${u.level >= u.max ? `<button class="btn small mint" disabled>MAX</button>` : `<button class="btn small gold" data-act="upgrade" data-id="${u.kind}" ${m.coins < u.cost ? 'disabled' : ''}><span class="cost">${icon('coin')}${fmt(u.cost)}</span></button>`}</div>`).join('')
      + '<p class="hint">Unlock new heroes in the Heroes tab.</p>';
  }

  private seasons(m: MenuModel) {
    return m.seasons.map((s) => {
      const head = `<div class="season-art" style="background:linear-gradient(120deg,${s.colors[0]},${s.colors[1]})"><small>SEASON ${s.number} · ${s.status === 'live' ? 'LIVE NOW' : s.status === 'upcoming' ? 'COMING SOON' : 'ENDED'}</small><b>${s.name}</b><span>${s.tagline}</span></div>`;
      if (s.status !== 'live') return `<div class="season dim">${head}<ul>${s.preview.map((p) => `<li>${p}</li>`).join('')}</ul></div>`;
      const rewards = s.rewards.map((r) => `<div class="tier ${r.state}"><span>${r.label}<small>${fmt(r.xp)} season XP</small></span>
        ${r.state === 'claimed' ? `<em>${icon('check')}Claimed</em>` : `<button class="btn small ${r.state === 'ready' ? 'mint' : ''}" data-act="season" data-id="${s.id}" ${r.state === 'ready' ? '' : 'disabled'}><span class="cost">${icon('coin')}${fmt(r.coins)}</span></button>`}</div>`).join('');
      const nextXp = s.rewards.find((r) => r.state !== 'claimed')?.xp ?? s.xp;
      return `<div class="season">${head}<p class="hint">Heroes: ${s.heroes.join(' · ')}</p>
        <div class="prog"><i style="width:${pct(s.xp / Math.max(1, nextXp))}"></i></div><p class="hint">${fmt(s.xp)} season XP — earned from every pursuit</p>${rewards}</div>`;
    }).join('');
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

  // ---------------------------------------------------------------- HUD
  hudSetup(s: HudSetup) {
    this.setup = s;
    this.capType = null;
    $('hud').classList.toggle('patrol', s.patrol);
    $('h-ticks').innerHTML = s.patrol ? '' : s.zones.slice(1).map((z) => `<u style="left:${(z * 100).toFixed(2)}%"></u>`).join('');
    this.set('h-len', s.patrol ? 'm' : `/ ${fmt(s.length)} m`);
    this.set('h-suspect', s.suspect);
    $('pw-icon').innerHTML = `<use href="#i-${s.ability.icon}"/>`;
    $('btn-power').style.setProperty('--c', s.ability.color);
    $('btn-power').classList.remove('fire');
    this.set('pw-key', s.touch ? '' : 'E');
    this.cache = Object.fromEntries(Object.entries(this.cache).filter(([k]) => !k.startsWith('h-') && !k.startsWith('pw-') && !k.startsWith('btn-power') && !k.startsWith('cap')));
  }

  hud(h: HudModel) {
    const s = this.setup!;
    this.set('h-dist', fmt(h.distance));
    if (this.set('h-coins', fmt(h.coins)) && h.coins > 0) {
      const p = $('h-coinchip');
      p.classList.remove('pop');
      void p.offsetWidth;
      p.classList.add('pop');
    }
    const hearts = Array.from({ length: s.hearts }, (_, i) => (i < h.hearts ? '1' : '0')).join('');
    if (this.cache['hearts'] !== hearts) {
      this.cache['hearts'] = hearts;
      $('h-hearts').innerHTML = [...hearts].map((v) => `<svg class="${v === '1' ? '' : 'lost'}"><use href="#i-heart"/></svg>`).join('');
    }
    this.set('h-zone', h.zone);
    if (s.patrol) this.set('h-gap', fmt(h.score));
    else {
      this.set('h-gap', String(Math.max(0, Math.round(h.gap))));
      this.style('h-close', 'width', pct(h.closeness));
      this.style('h-crim', 'left', pct(1 - h.closeness));
      this.cls('h-chase', 'danger', h.danger);
      this.style('h-prog', 'width', pct(h.distance / s.length));
    }
    // ability button: ring = charge, or time left while active
    const a = h.ability;
    this.style('btn-power', '--fill', `${Math.round(a.fill * 360)}deg`);
    if (!this.capType) {
      this.cls('btn-power', 'ready', a.ready);
      this.cls('btn-power', 'active', a.active);
      this.cls('btn-power', 'cooling', a.cooling);
      this.set('pw-label', a.active ? `${Math.ceil(a.left)}s` : a.ready ? 'GO!' : `${a.charge}/${a.cost}`);
    }
  }

  /** The capture tool: timing meter, hits landed, attempts left. null hides it. */
  capture(c: CaptureModel | null) {
    this.cls('capture', 'show', !!c);
    const type = c && c.phase === 'lock' ? c.type : null;
    if (type !== this.capType) {
      this.capType = type;
      const btn = $('btn-power');
      btn.classList.toggle('fire', !!type);
      btn.classList.remove('ready', 'active', 'cooling');
      delete this.cache['btn-power.ready']; delete this.cache['btn-power.active']; delete this.cache['btn-power.cooling'];
      $('pw-icon').innerHTML = `<use href="#i-${type ? 'zap' : this.setup?.ability.icon ?? 'bolt'}"/>`;
      if (type) this.set('pw-label', CAPTURE_TEXT[type].verb);
    }
    if (!c) return;
    const t = CAPTURE_TEXT[c.type];
    this.cls('capture', 'locking', c.phase === 'lock');
    this.set('cap-title', c.phase === 'lock' ? `${t.tool} — ${t.verb} IN THE GREEN` : `CLOSE IN: ${Math.max(0, Math.round(c.gap - c.range))} m TO ${t.tool} RANGE`);
    this.style('cap-window', 'left', pct(c.windowAt - c.window / 2));
    this.style('cap-window', 'width', pct(c.window));
    this.set('cap-hits', `Hits ${c.hits} / ${c.need}`);
    this.set('cap-tries', `${c.tries} ${c.tries === 1 ? 'try' : 'tries'} left`);
    this.captureMeter(c.meter, c.aligned);
  }

  /** Per-frame part of the capture meter. */
  captureMeter(meter: number, aligned: boolean) {
    ($('cap-marker') as HTMLElement).style.left = `${(meter * 100).toFixed(1)}%`;
    this.set('cap-lane', aligned ? 'LINED UP' : 'WRONG LANE');
    this.cls('cap-lane', 'bad', !aligned);
  }

  powers(left: Record<PowerKind, number>, total: Record<PowerKind, number>) {
    for (const k of POWER_KINDS) {
      const el = this.powerEls[k];
      const on = left[k] > 0;
      if ((el.root.style.display !== 'none') !== on) el.root.style.display = on ? '' : 'none';
      if (on) el.bar.style.width = `${Math.round((left[k] / total[k]) * 100)}%`;
    }
  }

  // ---------------------------------------------------------------- results
  results(o: ResultModel) {
    this.wonNext = o.won && !!o.hasNext;
    $('over').classList.toggle('won', o.won);
    this.set('o-title', o.title);
    this.set('o-detail', o.detail);
    const rib = $('o-ribbon');
    rib.textContent = o.won ? 'CASE CLOSED' : o.patrol ? '' : o.mission.toUpperCase();
    rib.classList.toggle('on', !!rib.textContent);
    this.set('o-dist', `${fmt(o.distance)} m`); this.set('o-coins', fmt(o.coins)); this.set('o-avoid', fmt(o.avoided));
    this.set('o-abil', String(o.abilityUses)); this.set('o-hits', String(o.hits));
    this.set('o-pursuit', o.pursuit < 0 ? '—' : `${o.pursuit}%`);
    this.set('o-pursuit-l', o.won ? 'Captured' : 'Pursuit');
    $('o-reward').innerHTML = o.won ? `<span>${icon('coin')}+${fmt(o.reward)} reward</span><span>${icon('star')}+${fmt(o.xp)} XP</span>` : `<span>${icon('star')}+${fmt(o.xp)} XP</span>${o.patrol ? '' : `<span>${icon('flag')}${Math.floor((o.distance / o.length) * 100)}% of the route</span>`}`;
    this.set('o-level', o.levelUp ? `PROMOTED! RANK ${o.level}` : `RANK ${o.level}`);
    this.set('o-next', o.won ? (o.hasNext ? `Next case: ${o.next}` : o.next) : o.checkpoint ? `You will restart from the ${o.checkpoint} checkpoint.` : '');
    this.set('retry-label', o.won ? (o.hasNext ? 'NEXT CASE' : 'REPLAY') : o.patrol ? 'PATROL AGAIN' : 'RETRY');
    const xp = $('o-xp') as HTMLElement;
    xp.style.width = '0%';
    requestAnimationFrame(() => requestAnimationFrame(() => { xp.style.width = pct(o.xpFrac); }));
    // headline number counts up: distance for a pursuit, score for a patrol
    const el = $('o-score');
    const value = o.patrol ? o.distance + o.coins * 10 : o.distance;
    const unit = o.patrol ? '' : ' m';
    const t0 = performance.now();
    clearInterval(this.countT);
    this.countT = window.setInterval(() => {
      const f = Math.min(1, (performance.now() - t0) / 900);
      el.textContent = fmt(value * (1 - Math.pow(1 - f, 3))) + unit;
      if (f >= 1) clearInterval(this.countT);
    }, 30);
  }
}
