/**
 * Lightweight synthesized SFX (Web Audio) — no third-party samples required.
 * Unlock on first user gesture.
 */
export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;
  private spinLoop: { osc: OscillatorNode; gain: GainNode; lfo: OscillatorNode } | null =
    null;

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
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  unlock() {
    this.ensure();
  }

  private beep(
    freq: number,
    dur: number,
    type: OscillatorType = 'sine',
    gain = 0.2,
    freqEnd?: number,
  ) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
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
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  click() {
    this.beep(880, 0.06, 'triangle', 0.12);
  }

  spinStart() {
    this.stopSpinLoop();
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
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
    gain.connect(this.master);
    osc.start();
    lfo.start();
    this.spinLoop = { osc, gain, lfo };
  }

  spinStopTick() {
    this.beep(220, 0.08, 'square', 0.1, 140);
  }

  stopSpinLoop() {
    if (!this.spinLoop) return;
    try {
      this.spinLoop.osc.stop();
      this.spinLoop.lfo.stop();
    } catch {
      /* already stopped */
    }
    this.spinLoop = null;
  }

  winSmall() {
    this.beep(523, 0.1, 'sine', 0.15);
    window.setTimeout(() => this.beep(659, 0.12, 'sine', 0.15), 80);
  }

  winBig() {
    this.beep(392, 0.12, 'triangle', 0.18, 523);
    window.setTimeout(() => this.beep(523, 0.14, 'triangle', 0.18, 659), 100);
    window.setTimeout(() => this.beep(784, 0.22, 'sine', 0.2), 220);
  }

  coin() {
    this.beep(1200, 0.08, 'sine', 0.12, 1800);
    window.setTimeout(() => this.beep(1600, 0.1, 'sine', 0.1, 2200), 60);
  }

  freeGames() {
    this.beep(330, 0.15, 'triangle', 0.16, 440);
    window.setTimeout(() => this.beep(440, 0.15, 'triangle', 0.16, 554), 120);
    window.setTimeout(() => this.beep(659, 0.25, 'sine', 0.18), 260);
  }

  stampede() {
    this.beep(80, 0.35, 'sawtooth', 0.12, 50);
    window.setTimeout(() => this.beep(60, 0.4, 'sawtooth', 0.1, 40), 80);
  }

  wheelTick() {
    this.beep(640, 0.04, 'square', 0.08);
  }

  wheelLand() {
    this.beep(480, 0.12, 'triangle', 0.18, 720);
    window.setTimeout(() => this.beep(960, 0.2, 'sine', 0.16), 100);
  }
}

export const audio = new GameAudio();
