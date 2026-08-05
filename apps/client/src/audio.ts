/**
 * Western Stampede — high-presence cabinet audio (original synthesis).
 *
 * Genre timeline (western / animal ways cabinets — original assets only):
 *  idle → wind + pad always on
 *  spin → mechanical rumble, duck bed
 *  stop L→R → heavy clunks (rising weight)
 *  scatter → bright bell · wild → whoosh · longhorn → deep bellow
 *  anticip → rising tension + drums
 *  wins → coin cascade + escalating fanfares
 *  free → percussive stem
 *
 * Loudness: hot by design (master ~0.92 + compressor). Player lowers device volume.
 */

export type MusicStem = 'base' | 'free' | 'win';

type LoopHandle = { stop: () => void };

/** Global loudness — deliberately hot for floor/cabinet feel. */
const LOUD = {
  master: 0.92,
  music: 0.38,
  ambient: 0.32,
  sfx: 1.15,
  spinRumble: 0.11,
  clunk: 0.85,
  bell: 0.75,
  horn: 0.9,
  fanfare: 0.78,
  coin: 0.55,
  anticip: 0.12,
  impact: 0.7,
} as const;

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private musicBus: GainNode | null = null;
  private ambientBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  muted = false;

  private spinLoop: LoopHandle | null = null;
  private anticipLoop: LoopHandle | null = null;
  private bgmLoop: LoopHandle | null = null;
  private windLoop: LoopHandle | null = null;
  private musicStem: MusicStem = 'base';
  private duckUntil = 0;
  private buffers = new Map<string, AudioBuffer>();
  private built = false;
  private lastCountTick = 0;
  private unlocked = false;

  private ensure(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();

      // Master chain: buses → compressor (loudness) → master gain → destination
      this.master = this.ctx.createGain();
      this.master.gain.value = LOUD.master;

      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -18;
      this.compressor.knee.value = 18;
      this.compressor.ratio.value = 3.5;
      this.compressor.attack.value = 0.003;
      this.compressor.release.value = 0.22;

      this.compressor.connect(this.master);
      this.master.connect(this.ctx.destination);

      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = LOUD.music;
      this.musicBus.connect(this.compressor);

      this.ambientBus = this.ctx.createGain();
      this.ambientBus.gain.value = LOUD.ambient;
      this.ambientBus.connect(this.compressor);

      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = LOUD.sfx;
      this.sfxBus.connect(this.compressor);

      this.buildSynthBank();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /** True after first user gesture unlocked AudioContext. */
  get isUnlocked(): boolean {
    return this.unlocked;
  }

  unlock() {
    const ctx = this.ensure();
    if (!ctx) return;
    const first = !this.unlocked;
    this.unlocked = true;
    if (!this.windLoop) this.startWindBed();
    if (!this.bgmLoop) this.startBgm(this.musicStem === 'win' ? 'base' : this.musicStem);
    if (first && !this.muted) {
      // Soft confirm that cabinet audio is live (not a second toast from UI)
      this.playBuf('chime_cluster', { gain: 0.25 });
    }
  }

  getMusicStem(): MusicStem {
    return this.musicStem;
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (m) {
      this.stopSpinLoop();
      this.anticipationStop();
      this.stopBgm();
      this.stopWindBed();
      if (this.master) this.master.gain.value = 0;
    } else if (this.master) {
      this.master.gain.value = LOUD.master;
      this.startWindBed();
      this.startBgm(this.musicStem === 'win' ? 'base' : this.musicStem);
    }
  }

  duckMusic(amount = 0.4, ms = 900) {
    const ctx = this.ensure();
    if (!ctx || !this.musicBus || !this.ambientBus) return;
    const now = ctx.currentTime;
    const targets: Array<[GainNode, number]> = [
      [this.musicBus, LOUD.music * amount],
      [this.ambientBus, LOUD.ambient * Math.max(0.35, amount)],
    ];
    for (const [bus, target] of targets) {
      bus.gain.cancelScheduledValues(now);
      bus.gain.setValueAtTime(bus.gain.value, now);
      bus.gain.linearRampToValueAtTime(target, now + 0.06);
    }
    this.duckUntil = performance.now() + ms;
    window.setTimeout(() => {
      if (performance.now() < this.duckUntil - 20) return;
      if (!this.musicBus || !this.ambientBus || this.muted) return;
      const c = this.ctx;
      if (!c) return;
      const t = c.currentTime;
      this.musicBus.gain.cancelScheduledValues(t);
      this.musicBus.gain.setValueAtTime(this.musicBus.gain.value, t);
      this.musicBus.gain.linearRampToValueAtTime(LOUD.music, t + 0.4);
      this.ambientBus.gain.cancelScheduledValues(t);
      this.ambientBus.gain.setValueAtTime(this.ambientBus.gain.value, t);
      this.ambientBus.gain.linearRampToValueAtTime(LOUD.ambient, t + 0.4);
    }, ms);
  }

  // ---------- buffer bank ----------

  private buildSynthBank() {
    if (this.built || !this.ctx) return;
    this.built = true;
    const sr = this.ctx.sampleRate;

    this.buffers.set('wind', this.makeWind(sr, 8));
    this.buffers.set('reel_clunk', this.makeClunk(sr, 0.16));
    this.buffers.set('coin', this.makeCoin(sr, 0.22));
    this.buffers.set('bell', this.makeBell(sr, 0.7));
    this.buffers.set('horn', this.makeHorn(sr, 1.05));
    this.buffers.set('whoosh', this.makeWhoosh(sr, 0.4));
    this.buffers.set('impact', this.makeImpact(sr, 0.5));
    this.buffers.set('chime_cluster', this.makeChimeCluster(sr, 1.0));
    this.buffers.set('fanfare_small', this.makeFanfare(sr, 0.85, 'small'));
    this.buffers.set('fanfare_big', this.makeFanfare(sr, 1.55, 'big'));
    this.buffers.set('fanfare_mega', this.makeFanfare(sr, 2.0, 'mega'));
    this.buffers.set('fanfare_super', this.makeFanfare(sr, 2.4, 'super'));
    this.buffers.set('resolve', this.makeResolve(sr, 1.25));
    this.buffers.set('drum_hit', this.makeDrum(sr, 0.22));
    this.buffers.set('pad_note', this.makePadNote(sr, 2.5));
  }

  private makeBuffer(sr: number, dur: number, fn: (i: number, n: number) => number): AudioBuffer {
    const n = Math.floor(sr * dur);
    const buf = this.ctx!.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = fn(i, n);
    // soft peak normalize toward ~0.95
    let peak = 0;
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]!));
    if (peak > 0.001) {
      const g = 0.92 / peak;
      for (let i = 0; i < n; i++) d[i]! *= g;
    }
    return buf;
  }

  private makeWind(sr: number, dur: number): AudioBuffer {
    let b0 = 0,
      b1 = 0,
      b2 = 0;
    return this.makeBuffer(sr, dur, (i, n) => {
      const white = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + white * 0.025;
      b1 = 0.94 * b1 + b0 * 0.06;
      b2 = 0.88 * b2 + b1 * 0.1;
      const t = i / sr;
      const gust = 0.5 + 0.5 * Math.sin(t * 0.28) * Math.sin(t * 0.09 + 0.7);
      const fade = Math.min(1, i / (sr * 0.2), (n - i) / (sr * 0.2));
      return b2 * 2.2 * gust * fade;
    });
  }

  private makeClunk(sr: number, dur: number): AudioBuffer {
    return this.makeBuffer(sr, dur, (i) => {
      const t = i / sr;
      const env = Math.exp(-t * 32);
      const body = Math.sin(2 * Math.PI * 78 * t) * 0.7;
      const thud = Math.sin(2 * Math.PI * 48 * t) * Math.exp(-t * 20) * 0.55;
      const click = Math.sin(2 * Math.PI * 380 * t) * Math.exp(-t * 85) * 0.4;
      const noise = (Math.random() * 2 - 1) * Math.exp(-t * 48) * 0.55;
      const wood = Math.sin(2 * Math.PI * 165 * t + Math.sin(t * 50) * 2.5) * env * 0.3;
      return (body + thud + click + noise + wood) * env;
    });
  }

  private makeCoin(sr: number, dur: number): AudioBuffer {
    return this.makeBuffer(sr, dur, (i) => {
      const t = i / sr;
      const env = Math.exp(-t * 10);
      return (
        (Math.sin(2 * Math.PI * 2650 * t) * env +
          Math.sin(2 * Math.PI * 3400 * t) * Math.exp(-t * 16) * 0.65 +
          Math.sin(2 * Math.PI * 1950 * t) * Math.exp(-t * 7) * 0.45) *
        0.55
      );
    });
  }

  private makeBell(sr: number, dur: number): AudioBuffer {
    return this.makeBuffer(sr, dur, (i) => {
      const t = i / sr;
      const env = Math.exp(-t * 2.6);
      const f0 = 920;
      let s = 0;
      for (const [h, g] of [
        [1, 1],
        [2.002, 0.5],
        [2.98, 0.32],
        [4.04, 0.15],
        [5.15, 0.1],
        [6.8, 0.06],
      ] as const) {
        s += Math.sin(2 * Math.PI * f0 * h * t) * g * Math.exp(-t * (1.8 + h * 0.5));
      }
      return s * env * 0.55;
    });
  }

  private makeHorn(sr: number, dur: number): AudioBuffer {
    return this.makeBuffer(sr, dur, (i) => {
      const t = i / sr;
      const env = Math.min(1, t * 10) * Math.exp(-t * 1.35);
      const f = 88 + 55 * Math.sin(t * 2.6) + t * 32;
      const phase = 2 * Math.PI * f * t;
      const saw =
        (2 / Math.PI) *
        (Math.sin(phase) +
          Math.sin(2 * phase) / 2 +
          Math.sin(3 * phase) / 3 +
          Math.sin(4 * phase) / 4 +
          Math.sin(5 * phase) / 5);
      const growl = Math.sin(2 * Math.PI * (f * 0.48) * t) * 0.4;
      const air = (Math.random() * 2 - 1) * 0.1 * env;
      return (saw * 0.6 + growl + air) * env;
    });
  }

  private makeWhoosh(sr: number, dur: number): AudioBuffer {
    return this.makeBuffer(sr, dur, (i, n) => {
      const t = i / n;
      const env = Math.sin(t * Math.PI);
      const noise = Math.random() * 2 - 1;
      return noise * env * (0.25 + 0.75 * t);
    });
  }

  private makeImpact(sr: number, dur: number): AudioBuffer {
    return this.makeBuffer(sr, dur, (i) => {
      const t = i / sr;
      const env = Math.exp(-t * 5.5);
      const boom = Math.sin(2 * Math.PI * 42 * t) * Math.exp(-t * 4.5);
      const mid = Math.sin(2 * Math.PI * 95 * t) * Math.exp(-t * 8) * 0.55;
      const crack = (Math.random() * 2 - 1) * Math.exp(-t * 35) * 0.55;
      return (boom + mid + crack) * env;
    });
  }

  private makeChimeCluster(sr: number, dur: number): AudioBuffer {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568];
    return this.makeBuffer(sr, dur, (i) => {
      const t = i / sr;
      let s = 0;
      for (let n = 0; n < notes.length; n++) {
        const delay = n * 0.065;
        const lt = t - delay;
        if (lt < 0) continue;
        s += Math.sin(2 * Math.PI * notes[n]! * lt) * Math.exp(-lt * 3.5) * (0.4 - n * 0.04);
      }
      return s;
    });
  }

  private makeFanfare(
    sr: number,
    dur: number,
    tier: 'small' | 'big' | 'mega' | 'super',
  ): AudioBuffer {
    const root =
      tier === 'super' ? 196 : tier === 'mega' ? 174.6 : tier === 'big' ? 146.8 : 130.8;
    const intervals =
      tier === 'super'
        ? [0, 4, 7, 12, 16, 19, 24]
        : tier === 'mega'
          ? [0, 4, 7, 12, 16, 19]
          : tier === 'big'
            ? [0, 4, 7, 12, 16]
            : [0, 4, 7, 12];
    const step = tier === 'super' ? 0.08 : 0.1;
    return this.makeBuffer(sr, dur, (i) => {
      const t = i / sr;
      let s = 0;
      for (let k = 0; k < intervals.length; k++) {
        const delay = k * step;
        const lt = t - delay;
        if (lt < 0) continue;
        const f = root * Math.pow(2, intervals[k]! / 12);
        const env = Math.min(1, lt * 22) * Math.exp(-lt * (1.2 + k * 0.12));
        const brass =
          Math.sin(2 * Math.PI * f * lt) * 0.55 +
          Math.sin(2 * Math.PI * f * 2 * lt) * 0.28 +
          Math.sin(2 * Math.PI * f * 3 * lt) * 0.14 +
          Math.sin(2 * Math.PI * f * 4 * lt) * 0.06;
        s += brass * env;
      }
      if (t > dur * 0.3) {
        const tt = t - dur * 0.3;
        s += Math.sin(2 * Math.PI * 1568 * tt) * Math.exp(-tt * 4) * 0.2;
        s += Math.sin(2 * Math.PI * 2093 * tt) * Math.exp(-tt * 5) * 0.12;
      }
      return s * 0.55;
    });
  }

  private makeResolve(sr: number, dur: number): AudioBuffer {
    return this.makeBuffer(sr, dur, (i) => {
      const t = i / sr;
      const env = Math.min(1, t * 14) * Math.exp(-t * 1.5);
      const chord = [130.81, 164.81, 196, 261.63, 329.63];
      let s = 0;
      for (const f of chord) {
        s += Math.sin(2 * Math.PI * f * t) * 0.28;
        s += Math.sin(2 * Math.PI * f * 2 * t) * 0.1;
      }
      s += Math.sin(2 * Math.PI * 1046 * t) * Math.exp(-t * 2.5) * 0.22;
      return s * env;
    });
  }

  private makeDrum(sr: number, dur: number): AudioBuffer {
    return this.makeBuffer(sr, dur, (i) => {
      const t = i / sr;
      const env = Math.exp(-t * 16);
      const tone = Math.sin(2 * Math.PI * (85 - t * 50) * t);
      const noise = (Math.random() * 2 - 1) * Math.exp(-t * 28) * 0.45;
      return (tone * 0.75 + noise) * env;
    });
  }

  private makePadNote(sr: number, dur: number): AudioBuffer {
    return this.makeBuffer(sr, dur, (i, n) => {
      const t = i / sr;
      const fade = Math.min(1, i / (sr * 0.3), (n - i) / (sr * 0.4));
      const f = 110;
      return (
        (Math.sin(2 * Math.PI * f * t) * 0.4 +
          Math.sin(2 * Math.PI * f * 1.5 * t) * 0.2 +
          Math.sin(2 * Math.PI * f * 2 * t) * 0.12) *
        fade
      );
    });
  }

  private playBuf(
    id: string,
    opts?: { gain?: number; rate?: number; bus?: 'sfx' | 'music' | 'ambient' },
  ) {
    const ctx = this.ensure();
    if (!ctx) return;
    const buf = this.buffers.get(id);
    const dest =
      opts?.bus === 'music'
        ? this.musicBus
        : opts?.bus === 'ambient'
          ? this.ambientBus
          : this.sfxBus;
    if (!buf || !dest) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts?.rate ?? 1;
    const g = ctx.createGain();
    g.gain.value = opts?.gain ?? 0.7;
    src.connect(g);
    g.connect(dest);
    src.start();
  }

  private loopBuf(
    id: string,
    bus: GainNode,
    gain: number,
    rate = 1,
  ): LoopHandle | null {
    const ctx = this.ensure();
    if (!ctx) return null;
    const buf = this.buffers.get(id);
    if (!buf) return null;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    g.connect(bus);
    src.start();
    return {
      stop: () => {
        try {
          src.stop();
        } catch {
          /* */
        }
      },
    };
  }

  private tone(
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
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.sfxBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  // ---------- public API ----------

  click() {
    this.playBuf('coin', { gain: LOUD.coin * 0.55, rate: 1.45 });
    this.tone(1400, 0.045, 'triangle', 0.1);
  }

  spinStart() {
    this.stopSpinLoop();
    this.duckMusic(0.42, 5500);
    const ctx = this.ensure();
    if (!ctx || !this.sfxBus) return;

    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lfoG = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.value = 68;
    osc2.type = 'square';
    osc2.frequency.value = 34;
    lfo.frequency.value = 12;
    lfoG.gain.value = 16;
    lfo.connect(lfoG);
    lfoG.connect(osc.frequency);
    gain.gain.value = LOUD.spinRumble;
    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(this.sfxBus);

    const nLen = Math.floor(ctx.sampleRate * 2);
    const nBuf = ctx.createBuffer(1, nLen, ctx.sampleRate);
    const nd = nBuf.getChannelData(0);
    for (let i = 0; i < nLen; i++) nd[i] = Math.random() * 2 - 1;
    const nSrc = ctx.createBufferSource();
    nSrc.buffer = nBuf;
    nSrc.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = 780;
    filt.Q.value = 0.65;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.07;
    nSrc.connect(filt);
    filt.connect(noiseGain);
    noiseGain.connect(this.sfxBus);

    osc.start();
    osc2.start();
    lfo.start();
    nSrc.start();

    this.spinLoop = {
      stop: () => {
        try {
          osc.stop();
          osc2.stop();
          lfo.stop();
          nSrc.stop();
        } catch {
          /* */
        }
      },
    };
  }

  spinStopTick(reelIndex = 0) {
    this.reelStop(reelIndex);
  }

  reelStop(reelIndex: number) {
    const rate = 0.82 + reelIndex * 0.09;
    this.playBuf('reel_clunk', { gain: LOUD.clunk * (0.85 + reelIndex * 0.06), rate });
    this.tone(150 + reelIndex * 32, 0.08, 'square', 0.08, 85);
  }

  stopSpinLoop() {
    if (!this.spinLoop) return;
    this.spinLoop.stop();
    this.spinLoop = null;
  }

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

  scatterLand() {
    this.playBuf('bell', { gain: LOUD.bell, rate: 1 });
    this.playBuf('coin', { gain: LOUD.coin, rate: 1.15 });
    window.setTimeout(() => this.playBuf('coin', { gain: LOUD.coin * 0.7, rate: 1.35 }), 70);
  }

  wildLand() {
    this.playBuf('whoosh', { gain: 0.75, rate: 0.95 });
    this.playBuf('chime_cluster', { gain: 0.55, rate: 1.12 });
    this.tone(200, 0.14, 'sawtooth', 0.12, 480);
  }

  longhornLand() {
    this.playBuf('horn', { gain: LOUD.horn, rate: 0.96 });
    this.playBuf('impact', { gain: LOUD.impact * 0.45, rate: 1.15 });
  }

  longhornWin() {
    this.playBuf('horn', { gain: LOUD.horn, rate: 1 });
    window.setTimeout(() => this.playBuf('horn', { gain: LOUD.horn * 0.65, rate: 1.12 }), 160);
    window.setTimeout(() => this.playBuf('chime_cluster', { gain: 0.6 }), 260);
  }

  winSmall() {
    this.playBuf('fanfare_small', { gain: LOUD.fanfare * 0.75 });
    this.coinCascade(5, 60);
  }

  winBig() {
    this.duckMusic(0.28, 2600);
    this.playBuf('fanfare_big', { gain: LOUD.fanfare });
    this.playBuf('impact', { gain: LOUD.impact * 0.55 });
    this.coinCascade(10, 48);
  }

  winMega() {
    this.duckMusic(0.22, 3200);
    this.playBuf('fanfare_mega', { gain: LOUD.fanfare * 1.05 });
    this.playBuf('impact', { gain: LOUD.impact * 0.7, rate: 0.9 });
    this.coinCascade(14, 40);
  }

  winSuper() {
    this.duckMusic(0.15, 4000);
    this.playBuf('fanfare_super', { gain: LOUD.fanfare * 1.1 });
    this.playBuf('impact', { gain: LOUD.impact, rate: 0.82 });
    this.playBuf('chime_cluster', { gain: 0.65 });
    this.coinCascade(18, 35);
  }

  totalWin() {
    this.playBuf('resolve', { gain: 0.85 });
    this.coinCascade(8, 50);
  }

  countUpTick() {
    const now = performance.now();
    if (now - this.lastCountTick < 38) return;
    this.lastCountTick = now;
    this.playBuf('coin', { gain: LOUD.coin * 0.35, rate: 1.15 + Math.random() * 0.35 });
  }

  private coinCascade(count: number, gapMs: number) {
    for (let i = 0; i < count; i++) {
      window.setTimeout(
        () =>
          this.playBuf('coin', {
            gain: LOUD.coin * (0.45 + Math.random() * 0.25),
            rate: 0.9 + Math.random() * 0.45,
          }),
        i * gapMs,
      );
    }
  }

  coin() {
    this.playBuf('coin', { gain: LOUD.coin });
  }

  freeGames() {
    this.setMusicStem('free');
    this.playBuf('fanfare_big', { gain: LOUD.fanfare * 0.85, rate: 1.05 });
    this.playBuf('drum_hit', { gain: 0.75 });
    window.setTimeout(() => this.playBuf('drum_hit', { gain: 0.65, rate: 1.12 }), 110);
    window.setTimeout(() => this.playBuf('chime_cluster', { gain: 0.6 }), 180);
  }

  freeGamesEnd() {
    this.setMusicStem('base');
    this.playBuf('resolve', { gain: 0.7, rate: 0.92 });
  }

  stampede() {
    this.playBuf('impact', { gain: LOUD.impact, rate: 0.72 });
    this.playBuf('horn', { gain: LOUD.horn * 0.7, rate: 0.78 });
    this.playBuf('whoosh', { gain: 0.65 });
    window.setTimeout(() => this.playBuf('impact', { gain: LOUD.impact * 0.65, rate: 0.88 }), 90);
  }

  wheelTick() {
    this.playBuf('coin', { gain: LOUD.coin * 0.35, rate: 1.65 });
  }

  wheelLand() {
    this.playBuf('bell', { gain: LOUD.bell });
    this.playBuf('chime_cluster', { gain: 0.6 });
  }

  winCycle() {
    this.playBuf('chime_cluster', { gain: 0.42, rate: 1.18 });
    this.tone(480, 0.07, 'triangle', 0.1);
  }

  anticipation() {
    this.anticipationStart();
  }

  anticipationStart() {
    this.anticipationStop();
    const ctx = this.ensure();
    if (!ctx || !this.sfxBus) return;
    this.duckMusic(0.4, 6500);

    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc2.type = 'triangle';
    osc.frequency.value = 155;
    osc2.frequency.value = 232;
    osc.frequency.linearRampToValueAtTime(520, ctx.currentTime + 2.6);
    osc2.frequency.linearRampToValueAtTime(780, ctx.currentTime + 2.6);

    const pulse = ctx.createOscillator();
    const pulseG = ctx.createGain();
    pulse.frequency.value = 2.0;
    pulseG.gain.value = 0.04;
    pulse.connect(pulseG);
    pulseG.connect(gain.gain);

    gain.gain.value = LOUD.anticip;
    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(this.sfxBus);
    osc.start();
    osc2.start();
    pulse.start();

    let beats = 0;
    const beatIv = window.setInterval(() => {
      this.playBuf('drum_hit', {
        gain: 0.28 + beats * 0.03,
        rate: 0.88 + beats * 0.035,
      });
      beats++;
      if (beats > 14) window.clearInterval(beatIv);
    }, 420);

    this.anticipLoop = {
      stop: () => {
        window.clearInterval(beatIv);
        try {
          osc.stop();
          osc2.stop();
          pulse.stop();
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
    this.tone(340, 0.28, 'triangle', 0.14, 85);
    this.playBuf('whoosh', { gain: 0.4, rate: 0.65 });
  }

  // ---------- ambient + BGM ----------

  private startWindBed() {
    this.stopWindBed();
    const ctx = this.ensure();
    if (!ctx || !this.ambientBus) return;
    this.windLoop = this.loopBuf('wind', this.ambientBus, 1.0, 1);
  }

  private stopWindBed() {
    if (!this.windLoop) return;
    this.windLoop.stop();
    this.windLoop = null;
  }

  startBgm(stem: MusicStem = 'base') {
    if (this.muted) return;
    this.musicStem = stem;
    this.stopBgm();
    const ctx = this.ensure();
    if (!ctx || !this.musicBus) return;

    const roots =
      stem === 'free'
        ? [98, 147, 196, 246.94, 294]
        : stem === 'win'
          ? [130.81, 164.81, 196, 261.63, 329.63]
          : [82.41, 123.47, 164.81, 196, 246.94];

    const stoppers: Array<() => void> = [];
    const t0 = ctx.currentTime;
    const voiceGain = stem === 'free' ? 0.22 : stem === 'win' ? 0.2 : 0.17;

    for (let i = 0; i < roots.length; i++) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const lfo = ctx.createOscillator();
      const lfoG = ctx.createGain();
      osc.type = i % 2 === 0 ? 'triangle' : 'sine';
      osc.frequency.value = roots[i]!;
      lfo.frequency.value = 0.06 + i * 0.025;
      lfoG.gain.value = 2 + i * 0.5;
      lfo.connect(lfoG);
      lfoG.connect(osc.frequency);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(voiceGain / roots.length, t0 + 0.9);
      osc.connect(g);
      g.connect(this.musicBus);
      osc.start(t0);
      lfo.start(t0);
      stoppers.push(() => {
        try {
          osc.stop();
          lfo.stop();
        } catch {
          /* */
        }
      });
    }

    // Free/win: stronger tribal pulse (genre free-games energy lift)
    if (stem === 'free' || stem === 'win') {
      let beat = 0;
      const bpm = stem === 'win' ? 112 : 96;
      const interval = (60 / bpm) * 1000;
      const iv = window.setInterval(() => {
        if (this.muted || !this.bgmLoop) {
          window.clearInterval(iv);
          return;
        }
        const accent = beat % 4 === 0;
        this.playBuf('drum_hit', {
          gain: accent ? 0.28 : 0.14,
          rate: accent ? 0.82 : 1.05,
          bus: 'music',
        });
        if (beat % 8 === 4) {
          this.playBuf('pad_note', { gain: 0.12, rate: 1.2, bus: 'music' });
        }
        beat++;
      }, interval);
      stoppers.push(() => window.clearInterval(iv));
    }

    // Base: occasional distant wildlife color (keeps idle alive)
    if (stem === 'base') {
      const iv = window.setInterval(() => {
        if (this.muted || !this.bgmLoop) {
          window.clearInterval(iv);
          return;
        }
        if (Math.random() > 0.5) return;
        this.tone(200 + Math.random() * 220, 0.9, 'sine', 0.045, 140);
      }, 3800);
      stoppers.push(() => window.clearInterval(iv));
    }

    this.bgmLoop = {
      stop: () => {
        for (const s of stoppers) s();
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

  async loadSample(id: string): Promise<AudioBuffer | null> {
    const ctx = this.ensure();
    if (!ctx) return null;
    for (const ext of ['ogg', 'mp3', 'wav']) {
      try {
        const res = await fetch(`/assets/sfx/${id}.${ext}`);
        if (!res.ok) continue;
        const ab = await res.arrayBuffer();
        const buf = await ctx.decodeAudioData(ab.slice(0));
        this.buffers.set(id, buf);
        return buf;
      } catch {
        /* next */
      }
    }
    return null;
  }
}

export const audio = new GameAudio();
