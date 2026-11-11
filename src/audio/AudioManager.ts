export type Ambience = 'street' | 'rail' | 'tunnel' | 'alley' | 'yard' | 'highway' | 'night' | 'docks';
export type Mood = 'chase' | 'tense' | 'finale';

interface Loop { src: AudioScheduledSourceNode; gain: GainNode; extra?: AudioNode[] }

const AMBIENCE: Record<Ambience, { freq: number; q: number; vol: number; type: BiquadFilterType }> = {
  street: { freq: 700, q: 0.4, vol: 0.1, type: 'bandpass' },
  rail: { freq: 320, q: 0.6, vol: 0.12, type: 'bandpass' },
  tunnel: { freq: 140, q: 1.2, vol: 0.2, type: 'lowpass' },
  alley: { freq: 420, q: 0.5, vol: 0.08, type: 'bandpass' },
  yard: { freq: 220, q: 0.8, vol: 0.13, type: 'bandpass' },
  highway: { freq: 900, q: 0.3, vol: 0.14, type: 'bandpass' },
  night: { freq: 260, q: 0.7, vol: 0.1, type: 'lowpass' },
  docks: { freq: 180, q: 0.9, vol: 0.12, type: 'lowpass' },
};
const MUSIC: Record<Mood, { bpm: number; bass: number[]; lead: number[] }> = {
  chase: { bpm: 132, bass: [110, 110, 131, 98], lead: [440, 0, 523, 659, 0, 523, 440, 392, 440, 0, 587, 523, 0, 392, 330, 392] },
  tense: { bpm: 144, bass: [98, 98, 117, 87], lead: [392, 0, 466, 0, 587, 466, 0, 392, 349, 0, 392, 466, 0, 349, 294, 0] },
  finale: { bpm: 160, bass: [82, 98, 110, 123], lead: [659, 659, 0, 784, 659, 0, 587, 659, 880, 0, 784, 659, 587, 0, 659, 784] },
};

/**
 * Fully synthesised audio (no external files): one-shot SFX, looping layers
 * (siren, motorcycle engine, flight wind, per-environment ambience) and a
 * music sequencer whose pattern and tempo follow the mood of the chase.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private sfxGain!: GainNode;
  private musicGain!: GainNode;
  private timer = 0;
  private seq = 0;
  private nextT = 0;
  private mood: Mood = 'chase';
  private loops = new Map<string, Loop>();
  private ambience: Ambience | null = null;
  private noiseBuf: AudioBuffer | null = null;
  sfxVol = 0.8;
  musicVol = 0.5;

  /** Must be called from a user gesture (mobile autoplay rules). */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.sfxGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.sfxGain.connect(this.ctx.destination);
      this.musicGain.connect(this.ctx.destination);
      this.setVolumes(this.musicVol, this.sfxVol);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setVolumes(music: number, sfx: number) {
    this.musicVol = music; this.sfxVol = sfx;
    if (!this.ctx) return;
    this.musicGain.gain.value = music * 0.35;
    this.sfxGain.gain.value = sfx;
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, out = this.sfxGain, at = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + at;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noiseBuffer() {
    if (!this.noiseBuf && this.ctx) {
      const n = this.ctx.sampleRate * 2;
      this.noiseBuf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const ch = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) ch[i] = Math.random() * 2 - 1;
    }
    return this.noiseBuf!;
  }

  private noise(dur: number, vol: number, freq: number, at = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + at;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfxGain);
    src.start(t, Math.random());
    src.stop(t + dur + 0.02);
  }

  // ---------------------------------------------------------------- one-shots
  coin() { this.tone('square', 988, 988, 0.06, 0.12); this.tone('square', 1319, 1319, 0.12, 0.12, this.sfxGain, 0.06); }
  jump() { this.tone('sine', 300, 720, 0.18, 0.25); }
  land(hard = false) { this.noise(hard ? 0.16 : 0.09, hard ? 0.5 : 0.28, 260); if (hard) this.tone('sine', 120, 50, 0.16, 0.4); }
  slide() { this.noise(0.5, 0.32, 1300); this.noise(0.5, 0.2, 400); }
  step() { this.noise(0.035, 0.08, 500); }
  lane() { this.noise(0.07, 0.12, 2400); }
  click() { this.tone('triangle', 660, 880, 0.07, 0.2); }
  powerup() { [523, 784, 1047, 1568].forEach((f, i) => this.tone('sine', f, f * 1.02, 0.14, 0.22, this.sfxGain, i * 0.05)); }
  shieldBreak() { this.noise(0.3, 0.5, 2600); this.tone('sine', 1400, 200, 0.3, 0.3); }
  mission() { [659, 784, 988, 1319].forEach((f, i) => this.tone('triangle', f, f, 0.18, 0.2, this.sfxGain, i * 0.09)); }
  buy() { this.tone('square', 784, 784, 0.07, 0.14); this.tone('square', 1175, 1175, 0.16, 0.14, this.sfxGain, 0.07); }
  deny() { this.tone('sawtooth', 160, 120, 0.16, 0.2); }
  crash() { this.noise(0.5, 0.8, 160); this.tone('sawtooth', 180, 40, 0.5, 0.4); }
  stumble() { this.noise(0.22, 0.6, 220); this.tone('square', 170, 70, 0.2, 0.25); }
  smash() { this.noise(0.28, 0.7, 900); this.noise(0.2, 0.4, 3000); this.tone('sine', 150, 50, 0.2, 0.35); }
  whoosh() { this.noise(0.5, 0.35, 1800); this.tone('sine', 200, 900, 0.35, 0.12); }
  abilityReady() { this.tone('triangle', 784, 784, 0.1, 0.2); this.tone('triangle', 1175, 1175, 0.2, 0.2, this.sfxGain, 0.1); }
  abilityOn() { [392, 523, 659, 784, 1047].forEach((f, i) => this.tone('sawtooth', f, f * 1.01, 0.16, 0.14, this.sfxGain, i * 0.045)); this.noise(0.5, 0.3, 2400); }
  abilityOff() { [784, 587, 392].forEach((f, i) => this.tone('triangle', f, f, 0.14, 0.16, this.sfxGain, i * 0.07)); }
  alarm() { for (let i = 0; i < 8; i++) this.tone('square', 1480, 1480, 0.09, 0.1, this.sfxGain, i * 0.16); }
  radio() { this.noise(0.12, 0.25, 3200); this.tone('square', 1200, 1200, 0.05, 0.08, this.sfxGain, 0.12); }
  taser() { for (let i = 0; i < 9; i++) this.tone('sawtooth', 900 + (i % 2) * 700, 300, 0.04, 0.22, this.sfxGain, i * 0.035); this.noise(0.35, 0.3, 5000); }
  miss() { this.noise(0.18, 0.3, 1500); this.tone('sawtooth', 300, 120, 0.2, 0.2); }
  throwObj() { this.noise(0.2, 0.25, 800); }
  checkpoint() { [523, 659, 784].forEach((f, i) => this.tone('triangle', f, f, 0.16, 0.2, this.sfxGain, i * 0.08)); }
  surge() { this.tone('sawtooth', 500, 180, 0.35, 0.18); }
  captured() { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this.tone('square', f, f, 0.2, 0.15, this.sfxGain, i * 0.13)); }
  gameOver() { [392, 330, 262, 196].forEach((f, i) => this.tone('triangle', f, f, 0.22, 0.25, this.sfxGain, 0.35 + i * 0.16)); }
  record() { [523, 659, 784, 1047].forEach((f, i) => this.tone('square', f, f, 0.16, 0.14, this.sfxGain, 0.5 + i * 0.11)); }
  horn() { this.tone('square', 392, 392, 0.3, 0.12); this.tone('square', 494, 494, 0.3, 0.12); }

  // ---------------------------------------------------------------- looping layers
  private stopLoop(name: string) {
    const l = this.loops.get(name);
    if (!l || !this.ctx) return;
    this.loops.delete(name);
    const t = this.ctx.currentTime;
    l.gain.gain.setTargetAtTime(0, t, 0.08);
    l.src.stop(t + 0.5);
    for (const e of l.extra ?? []) (e as OscillatorNode).stop?.(t + 0.5);
  }

  /** Two-tone police siren. */
  siren(on: boolean) {
    if (!this.ctx) return;
    if (!on) { this.stopLoop('siren'); return; }
    if (this.loops.has('siren')) return;
    const o = this.ctx.createOscillator(), lfo = this.ctx.createOscillator(), depth = this.ctx.createGain(), g = this.ctx.createGain();
    o.type = 'triangle'; o.frequency.value = 760;
    lfo.type = 'sine'; lfo.frequency.value = 0.9; depth.gain.value = 190;
    lfo.connect(depth).connect(o.frequency);
    g.gain.value = 0;
    g.gain.setTargetAtTime(0.05, this.ctx.currentTime, 0.2);
    o.connect(g).connect(this.sfxGain);
    o.start(); lfo.start();
    this.loops.set('siren', { src: o, gain: g, extra: [lfo] });
  }

  /** Motorcycle engine; call every frame with 0..1 revs while riding. */
  engine(on: boolean, revs = 0.5) {
    if (!this.ctx) return;
    let l = this.loops.get('engine');
    if (!on) { if (l) this.stopLoop('engine'); return; }
    if (!l) {
      const o = this.ctx.createOscillator(), o2 = this.ctx.createOscillator(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
      o.type = 'sawtooth'; o2.type = 'square';
      f.type = 'lowpass'; f.frequency.value = 900;
      g.gain.value = 0;
      g.gain.setTargetAtTime(0.16, this.ctx.currentTime, 0.1);
      o.connect(f); o2.connect(f); f.connect(g).connect(this.sfxGain);
      o.start(); o2.start();
      l = { src: o, gain: g, extra: [o2] };
      this.loops.set('engine', l);
    }
    const f0 = 70 + revs * 90;
    (l.src as OscillatorNode).frequency.setTargetAtTime(f0, this.ctx.currentTime, 0.08);
    (l.extra![0] as OscillatorNode).frequency.setTargetAtTime(f0 * 0.5, this.ctx.currentTime, 0.08);
  }

  private noiseLoop(name: string, type: BiquadFilterType, freq: number, q: number, vol: number, out = this.sfxGain) {
    if (!this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.4);
    src.connect(f).connect(g).connect(out);
    src.start();
    this.loops.set(name, { src, gain: g });
  }

  /** Rushing air while flying. */
  wind(on: boolean) {
    if (on === this.loops.has('wind')) return;
    if (on) this.noiseLoop('wind', 'bandpass', 1100, 0.5, 0.3); else this.stopLoop('wind');
  }

  /** Background bed for the current environment (null = silence). */
  setAmbience(a: Ambience | null) {
    if (a === this.ambience) return;
    this.ambience = a;
    this.stopLoop('amb');
    if (a) { const c = AMBIENCE[a]; this.noiseLoop('amb', c.type, c.freq, c.q, c.vol); }
  }

  stopLoops() { for (const k of [...this.loops.keys()]) this.stopLoop(k); this.ambience = null; }

  // ---------------------------------------------------------------- music
  setMood(m: Mood) { this.mood = m; }

  startMusic() {
    if (!this.ctx || this.timer) return;
    this.nextT = this.ctx.currentTime + 0.05;
    this.seq = 0;
    this.timer = window.setInterval(() => {
      if (!this.ctx) return;
      while (this.nextT < this.ctx.currentTime + 0.2) {
        const m = MUSIC[this.mood];
        const beat = 60 / m.bpm / 2;
        const at = this.nextT - this.ctx.currentTime;
        const s = this.seq++;
        const b = m.bass[Math.floor(s / 16) % 4];
        if (s % 2 === 0) this.tone('sawtooth', b, b, beat * 1.6, 0.22, this.musicGain, at);
        if (s % 4 === 2) this.tone('square', b * 2, b * 2, beat * 0.5, 0.08, this.musicGain, at);
        const l = m.lead[s % 16] * (Math.floor(s / 32) % 2 ? 1.122 : 1);
        if (l) this.tone('triangle', l, l, beat * 0.9, 0.16, this.musicGain, at);
        if (s % 4 === 0) this.tone('sine', 140, 45, 0.12, 0.5, this.musicGain, at);
        if (this.mood !== 'chase' && s % 2 === 1) this.tone('square', 6000, 3000, 0.03, 0.04, this.musicGain, at); // hats
        this.nextT += beat;
      }
    }, 60);
  }

  stopMusic() { clearInterval(this.timer); this.timer = 0; }
}
