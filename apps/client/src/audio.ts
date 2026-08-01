/**
 * Game audio: Web Audio synth + optional sample files under /assets/sfx/.
 * Unlock on first user gesture. Music and SFX buses with ducking.
 */

export type MusicStem = 'base' | 'free' | 'win';

type LoopVoice = {
  nodes: AudioNode[];
  stop: () => void;
};

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  muted = false;

  private spinLoop: LoopVoice | null = null;
  private anticipLoop: LoopVoice | null = null;
  private bgmLoop: LoopVoice | null = null;
  private musicStem: MusicStem = 'base';
  private musicBaseGain = 0.055;
  private duckUntil = 0;
  private sampleCache = new Map<string, AudioBuffer>();

  private ensure(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);

      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = this.musicBaseGain;
      this.musicBus.connect(this.master);

      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = 1;
      this.sfxBus.connect(this.master);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  unlock() {
    this.ensure();
    if (!this.bgmLoop) this.startBgm('base');
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (m) {
      this.stopSpinLoop();
      this.anticipationStop();
      this.stopBgm();
      if (this.master) this.master.gain.value = 0;
    } else if (this.master) {
      this.master.gain.value = 0.35;
      this.startBgm(this.musicStem === 'win' ? 'base' : this.musicStem);
    }
  }

  /** Soft duck music for `ms` milliseconds. */
  duckMusic(amount = 0.35, ms = 800) {
    const ctx = this.ensure();
    if (!ctx || !this.musicBus) return;
    const g = this.musicBus.gain;
    const now = ctx.currentTime;
    const target = this.musicBaseGain * amount;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(target, now + 0.08);
    this.duckUntil = performance.now() + ms;
    window.setTimeout(() => {
      if (performance.now() < this.duckUntil - 20) return;
      if (!this.musicBus || this.muted) return;
      const c = this.ctx;
      if (!c) return;
      const t = c.currentTime;
      this.musicBus.gain.cancelScheduledValues(t);
      this.musicBus.gain.setValueAtTime(this.musicBus.gain.value, t);
      this.musicBus.gain.linearRampToValueAtTime(this.musicBaseGain, t + 0.25);
    }, ms);
  }

  private beep(
    freq: number,
    dur: number,
    type: OscillatorType = 'sine',
    gain = 0.2,
    freqEnd?: number,
  ) {
    const ctx = this.ensure();
    if (!ctx || !this.sfxBus) return;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd != null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), t0 + dur);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.sfxBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** Noise burst for impacts / dust. */
  private noise(dur: number, gain = 0.08, filterFreq = 800) {
    const ctx = this.ensure();
    if (!ctx || !this.sfxBus) return;
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = filterFreq;
    const g = ctx.createGain();
    const t0 = ctx.currentTime;
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(this.sfxBus);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  // --- UI / spin ---

  click() {
    this.beep(880, 0.06, 'triangle', 0.12);
  }

  spinStart() {
    this.stopSpinLoop();
    this.duckMusic(0.45, 4000);
    const ctx = this.ensure();
    if (!ctx || !this.sfxBus) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = 90;
    lfo.frequency.value = 14;
    lfoGain.gain.value = 18;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    gain.gain.value = 0.04;
    osc.connect(gain);
    gain.connect(this.sfxBus);
    osc.start();
    lfo.start();
    this.spinLoop = {
      nodes: [osc, lfo, gain],
      stop: () => {
        try {
          osc.stop();
          lfo.stop();
        } catch {
          /* already stopped */
        }
      },
    };
  }

  /** Generic reel clunk; pitch ladder L→R. */
  spinStopTick(reelIndex = 0) {
    this.reelStop(reelIndex);
  }

  reelStop(reelIndex: number) {
    const base = 180 + reelIndex * 28;
    this.beep(base, 0.09, 'square', 0.1, base * 0.65);
    this.noise(0.05, 0.04, 400 + reelIndex * 80);
  }

  stopSpinLoop() {
    if (!this.spinLoop) return;
    this.spinLoop.stop();
    this.spinLoop = null;
  }

  /**
   * Symbol-aware land after a reel stops.
   * Priority: scatter > wild > longhorn > generic (already played).
   */
  reelLandSymbols(reelIndex: number, symbols: string[]) {
    this.reelStop(reelIndex);
    const set = new Set(symbols);
    if (set.has('SCATTER') || set.has('SUPERCOIN')) {
      this.scatterLand();
      return;
    }
    if (set.has('WILD') || set.has('WILD_FG')) {
      this.wildLand();
      return;
    }
    if (set.has('LONGHORN')) {
      this.longhornLand();
    }
  }

  // --- Signature symbols ---

  scatterLand() {
    this.beep(880, 0.12, 'sine', 0.14, 1320);
    window.setTimeout(() => this.beep(1320, 0.16, 'triangle', 0.12, 1760), 70);
    this.noise(0.06, 0.03, 2000);
  }

  wildLand() {
    this.beep(180, 0.12, 'sawtooth', 0.1, 420);
    window.setTimeout(() => this.beep(720, 0.14, 'sine', 0.14), 80);
    this.noise(0.08, 0.05, 600);
  }

  /** Signature longhorn horn. */
  longhornLand() {
    this.beep(120, 0.22, 'sawtooth', 0.14, 95);
    window.setTimeout(() => this.beep(160, 0.28, 'triangle', 0.12, 200), 60);
    window.setTimeout(() => this.beep(90, 0.2, 'sine', 0.08, 70), 140);
    this.noise(0.1, 0.04, 300);
  }

  longhornWin() {
    this.longhornLand();
    window.setTimeout(() => this.beep(240, 0.2, 'triangle', 0.14, 360), 200);
    window.setTimeout(() => this.beep(320, 0.25, 'sine', 0.12), 320);
  }

  // --- Wins / features ---

  winSmall() {
    this.beep(523, 0.1, 'sine', 0.15);
    window.setTimeout(() => this.beep(659, 0.12, 'sine', 0.15), 80);
  }

  winBig() {
    this.duckMusic(0.25, 2200);
    this.beep(392, 0.12, 'triangle', 0.18, 523);
    window.setTimeout(() => this.beep(523, 0.14, 'triangle', 0.18, 659), 100);
    window.setTimeout(() => this.beep(784, 0.22, 'sine', 0.2), 220);
  }

  winMega() {
    this.duckMusic(0.2, 2800);
    this.winBig();
    window.setTimeout(() => this.beep(880, 0.28, 'sine', 0.16), 300);
  }

  winSuper() {
    this.duckMusic(0.15, 3200);
    this.winMega();
    window.setTimeout(() => this.beep(1046, 0.35, 'triangle', 0.14), 400);
  }

  coin() {
    this.beep(1200, 0.08, 'sine', 0.12, 1800);
    window.setTimeout(() => this.beep(1600, 0.1, 'sine', 0.1, 2200), 60);
  }

  freeGames() {
    this.setMusicStem('free');
    this.beep(330, 0.15, 'triangle', 0.16, 440);
    window.setTimeout(() => this.beep(440, 0.15, 'triangle', 0.16, 554), 120);
    window.setTimeout(() => this.beep(659, 0.25, 'sine', 0.18), 260);
  }

  freeGamesEnd() {
    this.setMusicStem('base');
    this.beep(440, 0.12, 'triangle', 0.12, 330);
    window.setTimeout(() => this.beep(330, 0.18, 'sine', 0.1), 100);
  }

  stampede() {
    this.beep(80, 0.35, 'sawtooth', 0.12, 50);
    window.setTimeout(() => this.beep(60, 0.4, 'sawtooth', 0.1, 40), 80);
    this.noise(0.25, 0.08, 120);
  }

  wheelTick() {
    this.beep(640, 0.04, 'square', 0.08);
  }

  wheelLand() {
    this.beep(480, 0.12, 'triangle', 0.18, 720);
    window.setTimeout(() => this.beep(960, 0.2, 'sine', 0.16), 100);
  }

  winCycle() {
    this.beep(440, 0.07, 'triangle', 0.1);
    window.setTimeout(() => this.beep(554, 0.08, 'triangle', 0.1), 60);
  }

  /** One-shot rising tone (legacy). Prefer anticipationStart for long holds. */
  anticipation() {
    this.anticipationStart();
  }

  anticipationStart() {
    this.anticipationStop();
    const ctx = this.ensure();
    if (!ctx || !this.sfxBus) return;
    this.duckMusic(0.4, 5000);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lfoG = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 180;
    lfo.type = 'sine';
    lfo.frequency.value = 0.35;
    lfoG.gain.value = 40;
    lfo.connect(lfoG);
    lfoG.connect(osc.frequency);
    gain.gain.value = 0.06;
    // Slow rise
    osc.frequency.linearRampToValueAtTime(420, ctx.currentTime + 2.5);
    osc.connect(gain);
    gain.connect(this.sfxBus);
    osc.start();
    lfo.start();
    this.anticipLoop = {
      nodes: [osc, lfo, gain],
      stop: () => {
        try {
          osc.stop();
          lfo.stop();
        } catch {
          /* */
        }
      },
    };
  }

  anticipationStop() {
    if (!this.anticipLoop) return;
    this.anticipLoop.stop();
    this.anticipLoop = null;
  }

  nearMiss() {
    this.anticipationStop();
    this.beep(300, 0.18, 'triangle', 0.1, 100);
    this.noise(0.12, 0.03, 500);
  }

  // --- BGM (procedural western-ish pad) ---

  startBgm(stem: MusicStem = 'base') {
    if (this.muted) return;
    this.musicStem = stem;
    this.stopBgm();
    const ctx = this.ensure();
    if (!ctx || !this.musicBus) return;

    const freqs =
      stem === 'free'
        ? [98, 147, 196, 247]
        : stem === 'win'
          ? [130, 164, 196, 261]
          : [82, 123, 164, 196];

    const nodes: AudioNode[] = [];
    const oscillators: OscillatorNode[] = [];
    const t0 = ctx.currentTime;

    for (let i = 0; i < freqs.length; i++) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const lfo = ctx.createOscillator();
      const lfoG = ctx.createGain();
      osc.type = i % 2 === 0 ? 'triangle' : 'sine';
      osc.frequency.value = freqs[i]!;
      lfo.frequency.value = 0.08 + i * 0.03;
      lfoG.gain.value = 2 + i;
      lfo.connect(lfoG);
      lfoG.connect(osc.frequency);
      g.gain.value = 0.22 / freqs.length;
      osc.connect(g);
      g.connect(this.musicBus);
      osc.start(t0);
      lfo.start(t0);
      oscillators.push(osc, lfo);
      nodes.push(osc, lfo, g);
    }

    // Soft pulse for free stem
    if (stem === 'free') {
      const pulse = ctx.createOscillator();
      const pg = ctx.createGain();
      pulse.type = 'square';
      pulse.frequency.value = 2.2;
      pg.gain.value = 0.015;
      // Use LFO on music bus slightly — keep simple: low click-free drone
      pulse.frequency.value = 49;
      pulse.type = 'sine';
      pulse.connect(pg);
      pg.connect(this.musicBus);
      pulse.start(t0);
      oscillators.push(pulse);
      nodes.push(pulse, pg);
    }

    this.bgmLoop = {
      nodes,
      stop: () => {
        for (const o of oscillators) {
          try {
            o.stop();
          } catch {
            /* */
          }
        }
      },
    };
  }

  setMusicStem(stem: MusicStem) {
    if (this.musicStem === stem && this.bgmLoop) return;
    this.startBgm(stem);
  }

  stopBgm() {
    if (!this.bgmLoop) return;
    this.bgmLoop.stop();
    this.bgmLoop = null;
  }

  /** Optional: preload sample by id from /assets/sfx/{id}.ogg|mp3 */
  async loadSample(id: string): Promise<AudioBuffer | null> {
    if (this.sampleCache.has(id)) return this.sampleCache.get(id)!;
    const ctx = this.ensure();
    if (!ctx) return null;
    for (const ext of ['ogg', 'mp3', 'wav']) {
      try {
        const res = await fetch(`/assets/sfx/${id}.${ext}`);
        if (!res.ok) continue;
        const ab = await res.arrayBuffer();
        const buf = await ctx.decodeAudioData(ab.slice(0));
        this.sampleCache.set(id, buf);
        return buf;
      } catch {
        /* try next */
      }
    }
    return null;
  }

  playSample(id: string, gain = 0.5) {
    const ctx = this.ensure();
    if (!ctx || !this.sfxBus) return;
    const buf = this.sampleCache.get(id);
    if (!buf) {
      void this.loadSample(id).then((b) => {
        if (b) this.playSample(id, gain);
      });
      return;
    }
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    g.gain.value = gain;
    src.buffer = buf;
    src.connect(g);
    g.connect(this.sfxBus);
    src.start();
  }
}

export const audio = new GameAudio();
