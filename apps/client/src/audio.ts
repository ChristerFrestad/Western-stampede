/**
 * Immersive game audio for Western Stampede.
 *
 * Design notes (original synthesis — not ripped from any commercial title):
 * Premium western/animal ways slots typically layer:
 *   - Continuous nature bed (wind + distant pulse) while the game is open
 *   - Heavy mechanical reel clunks with rising pitch L→R
 *   - Signature premium-animal bellow, bright scatter bell, wild whoosh
 *   - Rising anticipation bed, cascading coin ticks on wins
 *   - Escalating fanfares for big / mega / super, then a total “resolve” hit
 *
 * Implementation: procedural AudioBuffers + live oscillators, optional file
 * overrides under /assets/sfx/{id}.ogg|mp3|wav.
 */

export type MusicStem = 'base' | 'free' | 'win';

type LoopHandle = { stop: () => void };

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private ambientBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  muted = false;

  private spinLoop: LoopHandle | null = null;
  private anticipLoop: LoopHandle | null = null;
  private bgmLoop: LoopHandle | null = null;
  private windLoop: LoopHandle | null = null;
  private musicStem: MusicStem = 'base';
  /** Louder ambient so the cabinet always “lives”. */
  private musicBaseGain = 0.14;
  private ambientBaseGain = 0.09;
  private duckUntil = 0;
  private buffers = new Map<string, AudioBuffer>();
  private built = false;
  private lastCountTick = 0;

  private ensure(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.42;
      this.master.connect(this.ctx.destination);

      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = this.musicBaseGain;
      this.musicBus.connect(this.master);

      this.ambientBus = this.ctx.createGain();
      this.ambientBus.gain.value = this.ambientBaseGain;
      this.ambientBus.connect(this.master);

      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = 1;
      this.sfxBus.connect(this.master);

      this.buildSynthBank();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  unlock() {
    const ctx = this.ensure();
    if (!ctx) return;
    if (!this.windLoop) this.startWindBed();
    if (!this.bgmLoop) this.startBgm(this.musicStem === 'win' ? 'base' : this.musicStem);
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
      this.master.gain.value = 0.42;
      this.startWindBed();
      this.startBgm(this.musicStem === 'win' ? 'base' : this.musicStem);
    }
  }

  duckMusic(amount = 0.35, ms = 800) {
    const ctx = this.ensure();
    if (!ctx || !this.musicBus || !this.ambientBus) return;
    const now = ctx.currentTime;
    for (const bus of [this.musicBus, this.ambientBus]) {
      const base = bus === this.musicBus ? this.musicBaseGain : this.ambientBaseGain;
      bus.gain.cancelScheduledValues(now);
      bus.gain.setValueAtTime(bus.gain.value, now);
      bus.gain.linearRampToValueAtTime(base * amount, now + 0.08);
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
      this.musicBus.gain.linearRampToValueAtTime(this.musicBaseGain, t + 0.35);
      this.ambientBus.gain.cancelScheduledValues(t);
      this.ambientBus.gain.setValueAtTime(this.ambientBus.gain.value, t);
      this.ambientBus.gain.linearRampToValueAtTime(this.ambientBaseGain, t + 0.35);
    }, ms);
  }

  // ---------- buffer bank ----------

  private buildSynthBank() {
    if (this.built || !this.ctx) return;
    this.built = true;
    const sr = this.ctx.sampleRate;

    this.buffers.set('wind', this.makeWind(sr, 6));
    this.buffers.set('reel_clunk', this.makeClunk(sr, 0.12));
    this.buffers.set('coin', this.makeCoin(sr, 0.18));
    this.buffers.set('bell', this.makeBell(sr, 0.55));
    this.buffers.set('horn', this.makeHorn(sr, 0.85));
    this.buffers.set('whoosh', this.makeWhoosh(sr, 0.35));
    this.buffers.set('impact', this.makeImpact(sr, 0.4));
    this.buffers.set('chime_cluster', this.makeChimeCluster(sr, 0.9));
    this.buffers.set('fanfare_small', this.makeFanfare(sr, 0.7, 'small'));
    this.buffers.set('fanfare_big', this.makeFanfare(sr, 1.4, 'big'));
    this.buffers.set('fanfare_mega', this.makeFanfare(sr, 1.8, 'mega'));
    this.buffers.set('fanfare_super', this.makeFanfare(sr, 2.2, 'super'));
    this.buffers.set('resolve', this.makeResolve(sr, 1.1));
    this.buffers.set('drum_hit', this.makeDrum(sr, 0.2));
  }

  private makeBuffer(sr: number, dur: number, fn: (i: number, n: number) => number): AudioBuffer {
    const n = Math.floor(sr * dur);
    const buf = this.ctx!.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = fn(i, n);
    return buf;
  }

  private makeWind(sr: number, dur: number): AudioBuffer {
    let b0 = 0,
      b1 = 0,
      b2 = 0;
    return this.makeBuffer(sr, dur, (i, n) => {
      // Brown-ish noise
      const white = Math.random() * 2 - 1;
      b0 = 0.998 * b0 + white * 0.02;
      b1 = 0.95 * b1 + b0 * 0.05;
      b2 = 0.9 * b2 + b1 * 0.08;
      const t = i / sr;
      const gust = 0.55 + 0.45 * Math.sin(t * 0.35) * Math.sin(t * 0.11 + 1.2);
      // Soft loop fade
      const fade = Math.min(1, i / (sr * 0.15), (n - i) / (sr * 0.15));
      return b2 * 1.8 * gust * fade * 0.55;
    });
  }

  private makeClunk(sr: number, dur: number): AudioBuffer {
    return this.makeBuffer(sr, dur, (i, n) => {
      const t = i / sr;
      const env = Math.exp(-t * 38);
      const body = Math.sin(2 * Math.PI * 85 * t) * 0.55;
      const click = Math.sin(2 * Math.PI * 420 * t) * Math.exp(-t * 90) * 0.35;
      const noise = (Math.random() * 2 - 1) * Math.exp(-t * 55) * 0.45;
      const wood = Math.sin(2 * Math.PI * 180 * t + Math.sin(t * 40) * 2) * env * 0.25;
      return (body + click + noise + wood) * env;
    });
  }

  private makeCoin(sr: number, dur: number): AudioBuffer {
    return this.makeBuffer(sr, dur, (i) => {
      const t = i / sr;
      const env = Math.exp(-t * 12);
      const a = Math.sin(2 * Math.PI * 2400 * t) * env;
      const b = Math.sin(2 * Math.PI * 3200 * t) * Math.exp(-t * 18) * 0.6;
      const c = Math.sin(2 * Math.PI * 1800 * t) * Math.exp(-t * 8) * 0.4;
      return (a + b + c) * 0.35;
    });
  }

  private makeBell(sr: number, dur: number): AudioBuffer {
    return this.makeBuffer(sr, dur, (i) => {
      const t = i / sr;
      const env = Math.exp(-t * 3.2);
      const f0 = 880;
      let s = 0;
      for (const [h, g] of [
        [1, 1],
        [2.01, 0.45],
        [2.99, 0.28],
        [4.05, 0.12],
        [5.2, 0.08],
      ] as const) {
        s += Math.sin(2 * Math.PI * f0 * h * t) * g * Math.exp(-t * (2 + h));
      }
      return s * env * 0.4;
    });
  }

  private makeHorn(sr: number, dur: number): AudioBuffer {
    return this.makeBuffer(sr, dur, (i) => {
      const t = i / sr;
      // Animal bellow: low saw-ish + formant sweep
      const env = Math.min(1, t * 8) * Math.exp(-t * 1.6);
      const f = 95 + 40 * Math.sin(t * 3) + t * 25;
      const phase = 2 * Math.PI * f * t;
      const saw =
        (2 / Math.PI) *
        (Math.sin(phase) +
          Math.sin(2 * phase) / 2 +
          Math.sin(3 * phase) / 3 +
          Math.sin(4 * phase) / 4);
      const growl = Math.sin(2 * Math.PI * (f * 0.5) * t) * 0.35;
      const air = (Math.random() * 2 - 1) * 0.08 * env;
      return (saw * 0.55 + growl + air) * env * 0.7;
    });
  }

  private makeWhoosh(sr: number, dur: number): AudioBuffer {
    return this.makeBuffer(sr, dur, (i, n) => {
      const t = i / sr;
      const env = Math.sin((i / n) * Math.PI);
      const noise = Math.random() * 2 - 1;
      // Simple highpass feel via difference
      return noise * env * 0.45 * (0.3 + 0.7 * (i / n));
    });
  }

  private makeImpact(sr: number, dur: number): AudioBuffer {
    return this.makeBuffer(sr, dur, (i) => {
      const t = i / sr;
      const env = Math.exp(-t * 6);
      const boom = Math.sin(2 * Math.PI * 48 * t) * Math.exp(-t * 5);
      const mid = Math.sin(2 * Math.PI * 110 * t) * Math.exp(-t * 9) * 0.5;
      const crack = (Math.random() * 2 - 1) * Math.exp(-t * 40) * 0.5;
      return (boom + mid + crack) * env * 0.85;
    });
  }

  private makeChimeCluster(sr: number, dur: number): AudioBuffer {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    return this.makeBuffer(sr, dur, (i) => {
      const t = i / sr;
      let s = 0;
      for (let n = 0; n < notes.length; n++) {
        const delay = n * 0.07;
        const lt = t - delay;
        if (lt < 0) continue;
        const env = Math.exp(-lt * 4);
        s += Math.sin(2 * Math.PI * notes[n]! * lt) * env * (0.35 - n * 0.04);
      }
      return s * 0.55;
    });
  }

  private makeFanfare(
    sr: number,
    dur: number,
    tier: 'small' | 'big' | 'mega' | 'super',
  ): AudioBuffer {
    const root =
      tier === 'super' ? 196 : tier === 'mega' ? 174 : tier === 'big' ? 146 : 130;
    const intervals =
      tier === 'super'
        ? [0, 4, 7, 12, 16, 19]
        : tier === 'mega'
          ? [0, 4, 7, 12, 16]
          : tier === 'big'
            ? [0, 4, 7, 12]
            : [0, 4, 7];
    return this.makeBuffer(sr, dur, (i) => {
      const t = i / sr;
      let s = 0;
      for (let k = 0; k < intervals.length; k++) {
        const delay = k * (tier === 'super' ? 0.09 : 0.11);
        const lt = t - delay;
        if (lt < 0) continue;
        const f = root * Math.pow(2, intervals[k]! / 12);
        const env = Math.min(1, lt * 20) * Math.exp(-lt * (1.4 + k * 0.15));
        const brass =
          Math.sin(2 * Math.PI * f * lt) * 0.5 +
          Math.sin(2 * Math.PI * f * 2 * lt) * 0.25 +
          Math.sin(2 * Math.PI * f * 3 * lt) * 0.12;
        s += brass * env;
      }
      // Sparkle tail
      if (t > dur * 0.35) {
        const tt = t - dur * 0.35;
        s += Math.sin(2 * Math.PI * 1568 * tt) * Math.exp(-tt * 5) * 0.15;
      }
      return s * 0.45;
    });
  }

  private makeResolve(sr: number, dur: number): AudioBuffer {
    return this.makeBuffer(sr, dur, (i) => {
      const t = i / sr;
      const env = Math.min(1, t * 12) * Math.exp(-t * 1.8);
      const chord = [130.81, 164.81, 196, 261.63];
      let s = 0;
      for (const f of chord) {
        s += Math.sin(2 * Math.PI * f * t) * 0.25;
        s += Math.sin(2 * Math.PI * f * 2 * t) * 0.08;
      }
      const shimmer = Math.sin(2 * Math.PI * 1046 * t) * Math.exp(-t * 3) * 0.2;
      return (s + shimmer) * env * 0.7;
    });
  }

  private makeDrum(sr: number, dur: number): AudioBuffer {
    return this.makeBuffer(sr, dur, (i) => {
      const t = i / sr;
      const env = Math.exp(-t * 18);
      const tone = Math.sin(2 * Math.PI * (90 - t * 40) * t);
      const noise = (Math.random() * 2 - 1) * Math.exp(-t * 30) * 0.4;
      return (tone * 0.7 + noise) * env;
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
    g.gain.value = opts?.gain ?? 0.6;
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

  // ---------- public API (same surface as before + new) ----------

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType = 'sine',
    gain = 0.15,
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
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.sfxBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  click() {
    this.playBuf('coin', { gain: 0.25, rate: 1.4 });
    this.tone(1200, 0.04, 'triangle', 0.06);
  }

  spinStart() {
    this.stopSpinLoop();
    this.duckMusic(0.5, 5000);
    const ctx = this.ensure();
    if (!ctx || !this.sfxBus) return;

    // Layered mechanical rumble + filtered noise
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lfoG = ctx.createGain();
    const noiseGain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.value = 72;
    osc2.type = 'square';
    osc2.frequency.value = 36;
    lfo.frequency.value = 11;
    lfoG.gain.value = 14;
    lfo.connect(lfoG);
    lfoG.connect(osc.frequency);
    gain.gain.value = 0.035;
    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(this.sfxBus);

    // Noise whoosh bed
    const nLen = Math.floor(ctx.sampleRate * 2);
    const nBuf = ctx.createBuffer(1, nLen, ctx.sampleRate);
    const nd = nBuf.getChannelData(0);
    for (let i = 0; i < nLen; i++) nd[i] = Math.random() * 2 - 1;
    const nSrc = ctx.createBufferSource();
    nSrc.buffer = nBuf;
    nSrc.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = 900;
    filt.Q.value = 0.7;
    noiseGain.gain.value = 0.028;
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
    const rate = 0.85 + reelIndex * 0.08;
    this.playBuf('reel_clunk', { gain: 0.55 + reelIndex * 0.06, rate });
    this.tone(160 + reelIndex * 30, 0.07, 'square', 0.05, 90);
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
    this.playBuf('bell', { gain: 0.55, rate: 1 });
    this.playBuf('coin', { gain: 0.35, rate: 1.1 });
    window.setTimeout(() => this.playBuf('coin', { gain: 0.25, rate: 1.3 }), 80);
  }

  wildLand() {
    this.playBuf('whoosh', { gain: 0.5, rate: 0.9 });
    this.playBuf('chime_cluster', { gain: 0.35, rate: 1.15 });
    this.tone(180, 0.12, 'sawtooth', 0.08, 420);
  }

  longhornLand() {
    this.playBuf('horn', { gain: 0.7, rate: 0.95 });
    this.playBuf('impact', { gain: 0.25, rate: 1.2 });
  }

  longhornWin() {
    this.playBuf('horn', { gain: 0.75, rate: 1 });
    window.setTimeout(() => this.playBuf('horn', { gain: 0.45, rate: 1.15 }), 180);
    window.setTimeout(() => this.playBuf('chime_cluster', { gain: 0.4 }), 280);
  }

  winSmall() {
    this.playBuf('fanfare_small', { gain: 0.5 });
    this.coinCascade(4, 70);
  }

  winBig() {
    this.duckMusic(0.28, 2400);
    this.playBuf('fanfare_big', { gain: 0.6 });
    this.playBuf('impact', { gain: 0.35 });
    this.coinCascade(8, 55);
  }

  winMega() {
    this.duckMusic(0.22, 3000);
    this.playBuf('fanfare_mega', { gain: 0.65 });
    this.playBuf('impact', { gain: 0.45, rate: 0.9 });
    this.coinCascade(12, 45);
  }

  winSuper() {
    this.duckMusic(0.15, 3600);
    this.playBuf('fanfare_super', { gain: 0.7 });
    this.playBuf('impact', { gain: 0.5, rate: 0.85 });
    this.playBuf('chime_cluster', { gain: 0.45 });
    this.coinCascade(16, 40);
  }

  /** Final “YOU WON” resolve after all banners. */
  totalWin() {
    this.playBuf('resolve', { gain: 0.65 });
    this.coinCascade(6, 60);
  }

  countUpTick() {
    const now = performance.now();
    if (now - this.lastCountTick < 45) return;
    this.lastCountTick = now;
    this.playBuf('coin', { gain: 0.12, rate: 1.2 + Math.random() * 0.3 });
  }

  private coinCascade(count: number, gapMs: number) {
    for (let i = 0; i < count; i++) {
      window.setTimeout(
        () => this.playBuf('coin', { gain: 0.18, rate: 0.95 + Math.random() * 0.4 }),
        i * gapMs,
      );
    }
  }

  coin() {
    this.playBuf('coin', { gain: 0.4, rate: 1 });
  }

  freeGames() {
    this.setMusicStem('free');
    this.playBuf('fanfare_big', { gain: 0.45, rate: 1.05 });
    this.playBuf('drum_hit', { gain: 0.5 });
    window.setTimeout(() => this.playBuf('drum_hit', { gain: 0.4, rate: 1.1 }), 120);
    window.setTimeout(() => this.playBuf('chime_cluster', { gain: 0.4 }), 200);
  }

  freeGamesEnd() {
    this.setMusicStem('base');
    this.playBuf('resolve', { gain: 0.5, rate: 0.9 });
  }

  stampede() {
    this.playBuf('impact', { gain: 0.7, rate: 0.75 });
    this.playBuf('horn', { gain: 0.45, rate: 0.8 });
    this.playBuf('whoosh', { gain: 0.4 });
    window.setTimeout(() => this.playBuf('impact', { gain: 0.4, rate: 0.9 }), 100);
  }

  wheelTick() {
    this.playBuf('coin', { gain: 0.15, rate: 1.6 });
  }

  wheelLand() {
    this.playBuf('bell', { gain: 0.5 });
    this.playBuf('chime_cluster', { gain: 0.4 });
  }

  winCycle() {
    this.playBuf('chime_cluster', { gain: 0.28, rate: 1.2 });
    this.tone(440, 0.06, 'triangle', 0.06);
  }

  anticipation() {
    this.anticipationStart();
  }

  anticipationStart() {
    this.anticipationStop();
    const ctx = this.ensure();
    if (!ctx || !this.sfxBus) return;
    this.duckMusic(0.45, 6000);

    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lfoG = ctx.createGain();
    osc.type = 'sine';
    osc2.type = 'triangle';
    osc.frequency.value = 160;
    osc2.frequency.value = 240;
    osc.frequency.linearRampToValueAtTime(480, ctx.currentTime + 2.8);
    osc2.frequency.linearRampToValueAtTime(720, ctx.currentTime + 2.8);
    lfo.frequency.value = 4.5;
    lfoG.gain.value = 0.012;
    // Heartbeat pulse on gain
    const pulse = ctx.createOscillator();
    const pulseG = ctx.createGain();
    pulse.frequency.value = 1.8;
    pulseG.gain.value = 0.025;
    pulse.connect(pulseG);
    pulseG.connect(gain.gain);

    gain.gain.value = 0.05;
    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(this.sfxBus);
    osc.start();
    osc2.start();
    pulse.start();
    lfo.start();

    // Soft drum hits under tension
    let beats = 0;
    const beatIv = window.setInterval(() => {
      this.playBuf('drum_hit', { gain: 0.18 + beats * 0.02, rate: 0.9 + beats * 0.03 });
      beats++;
      if (beats > 12) window.clearInterval(beatIv);
    }, 480);

    this.anticipLoop = {
      stop: () => {
        window.clearInterval(beatIv);
        try {
          osc.stop();
          osc2.stop();
          pulse.stop();
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
    this.tone(320, 0.25, 'triangle', 0.1, 90);
    this.playBuf('whoosh', { gain: 0.25, rate: 0.7 });
  }

  // ---------- ambient + BGM ----------

  private startWindBed() {
    this.stopWindBed();
    const ctx = this.ensure();
    if (!ctx || !this.ambientBus) return;
    this.windLoop = this.loopBuf('wind', this.ambientBus, 0.85, 1);
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

    // Harmonic bed (western-ish open fifths + soft pulse)
    const roots =
      stem === 'free'
        ? [98, 147, 196, 233, 294]
        : stem === 'win'
          ? [130.81, 164.81, 196, 261.63, 329.63]
          : [82.41, 123.47, 164.81, 196, 246.94];

    const stoppers: Array<() => void> = [];
    const t0 = ctx.currentTime;

    for (let i = 0; i < roots.length; i++) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const lfo = ctx.createOscillator();
      const lfoG = ctx.createGain();
      osc.type = i % 2 === 0 ? 'triangle' : 'sine';
      osc.frequency.value = roots[i]!;
      lfo.frequency.value = 0.05 + i * 0.02;
      lfoG.gain.value = 1.5 + i * 0.4;
      lfo.connect(lfoG);
      lfoG.connect(osc.frequency);
      // Soft attack
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.14 / roots.length, t0 + 1.2);
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

    // Rhythmic pulse for free / win stems (tribal light)
    if (stem === 'free' || stem === 'win') {
      let beat = 0;
      const bpm = stem === 'win' ? 110 : 92;
      const interval = (60 / bpm) * 1000;
      const iv = window.setInterval(() => {
        if (this.muted || !this.bgmLoop) {
          window.clearInterval(iv);
          return;
        }
        const accent = beat % 4 === 0;
        this.playBuf('drum_hit', {
          gain: accent ? 0.14 : 0.07,
          rate: accent ? 0.85 : 1.05,
          bus: 'music',
        });
        beat++;
      }, interval);
      stoppers.push(() => window.clearInterval(iv));
    }

    // Occasional distant “wildlife” color tone (base only)
    if (stem === 'base') {
      const iv = window.setInterval(() => {
        if (this.muted || !this.bgmLoop) {
          window.clearInterval(iv);
          return;
        }
        if (Math.random() > 0.55) return;
        this.tone(220 + Math.random() * 180, 0.8, 'sine', 0.025, 160);
      }, 4500);
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
    if (this.buffers.has(id) && this.built) {
      // Prefer file override if present
    }
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
        /* try next */
      }
    }
    return null;
  }
}

export const audio = new GameAudio();
