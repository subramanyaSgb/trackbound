/** Fully synthesised audio (no external files): SFX + a looping music sequencer. */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private sfxGain!: GainNode;
  private musicGain!: GainNode;
  private timer = 0;
  private seq = 0;
  private nextT = 0;
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

  private noise(dur: number, vol: number, freq: number) {
    if (!this.ctx) return;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.sfxGain);
    src.start();
  }

  coin() { this.tone('square', 988, 988, 0.06, 0.12); this.tone('square', 1319, 1319, 0.12, 0.12, this.sfxGain, 0.06); }
  jump() { this.tone('sine', 300, 720, 0.18, 0.25); }
  land() { this.noise(0.08, 0.25, 300); }
  slide() { this.noise(0.4, 0.3, 1400); }
  step() { this.noise(0.035, 0.08, 500); }
  lane() { this.noise(0.07, 0.12, 2400); }
  click() { this.tone('triangle', 660, 880, 0.07, 0.2); }
  powerup() { [523, 784, 1047, 1568].forEach((f, i) => this.tone('sine', f, f * 1.02, 0.14, 0.22, this.sfxGain, i * 0.05)); }
  shieldBreak() { this.noise(0.3, 0.5, 2600); this.tone('sine', 1400, 200, 0.3, 0.3); }
  mission() { [659, 784, 988, 1319].forEach((f, i) => this.tone('triangle', f, f, 0.18, 0.2, this.sfxGain, i * 0.09)); }
  buy() { this.tone('square', 784, 784, 0.07, 0.14); this.tone('square', 1175, 1175, 0.16, 0.14, this.sfxGain, 0.07); }
  deny() { this.tone('sawtooth', 160, 120, 0.16, 0.2); }
  crash() { this.noise(0.5, 0.8, 160); this.tone('sawtooth', 180, 40, 0.5, 0.4); }
  gameOver() { [392, 330, 262, 196].forEach((f, i) => this.tone('triangle', f, f, 0.22, 0.25, this.sfxGain, 0.35 + i * 0.16)); }
  record() { [523, 659, 784, 1047].forEach((f, i) => this.tone('square', f, f, 0.16, 0.14, this.sfxGain, 0.5 + i * 0.11)); }

  startMusic() {
    if (!this.ctx || this.timer) return;
    this.nextT = this.ctx.currentTime + 0.05;
    this.seq = 0;
    const bass = [110, 110, 131, 98];
    const lead = [440, 0, 523, 659, 0, 523, 440, 392, 440, 0, 587, 523, 0, 392, 330, 392];
    const beat = 60 / 132 / 2;
    this.timer = window.setInterval(() => {
      if (!this.ctx) return;
      while (this.nextT < this.ctx.currentTime + 0.2) {
        const at = this.nextT - this.ctx.currentTime;
        const s = this.seq++;
        const b = bass[Math.floor(s / 16) % 4];
        if (s % 2 === 0) this.tone('sawtooth', b, b, beat * 1.6, 0.22, this.musicGain, at);
        if (s % 4 === 2) this.tone('square', b * 2, b * 2, beat * 0.5, 0.08, this.musicGain, at);
        const l = lead[s % 16] * (Math.floor(s / 32) % 2 ? 1.122 : 1);
        if (l) this.tone('triangle', l, l, beat * 0.9, 0.16, this.musicGain, at);
        if (s % 4 === 0) this.tone('sine', 140, 45, 0.12, 0.5, this.musicGain, at);
        this.nextT += beat;
      }
    }, 60);
  }

  stopMusic() { clearInterval(this.timer); this.timer = 0; }
}
