import type { BuyTier, GameConfigResponse, SpinResult } from '@ws/shared';
import * as api from './api';
import { audio } from './audio';
import {
  showFeatureSplash,
  showLonghornOnGridCallout,
  showSupercoinWheel,
} from './overlays';
import {
  anticipationReels,
  isScatterNearMiss,
} from './presentation/anticipation';
import { runCelebration } from './presentation/celebration-controller';
import { ReelView } from './reel-view';

const el = {
  balance: document.getElementById('balance')!,
  lastWin: document.getElementById('last-win')!,
  bet: document.getElementById('bet') as HTMLSelectElement,
  spin: document.getElementById('btn-spin') as HTMLButtonElement,
  plus: document.getElementById('btn-plus') as HTMLButtonElement,
  minus: document.getElementById('btn-minus') as HTMLButtonElement,
  auto: document.getElementById('btn-auto') as HTMLButtonElement,
  buy: document.getElementById('btn-buy') as HTMLButtonElement,
  topup: document.getElementById('btn-topup') as HTMLButtonElement,
  rules: document.getElementById('btn-rules') as HTMLButtonElement,
  mute: document.getElementById('btn-mute') as HTMLButtonElement | null,
  fgMeter: document.getElementById('fg-meter')!,
  fgCount: document.getElementById('fg-count')!,
  ways: document.getElementById('ways-label')!,
  premiumInj: document.getElementById('premium-inj')!,
  herdMeter: document.getElementById('herd-meter') as HTMLElement | null,
  herdOnGrid: document.getElementById('herd-on-grid') as HTMLElement | null,
  featureWin: document.getElementById('feature-win') as HTMLElement | null,
  featureWinVal: document.getElementById('feature-win-val') as HTMLElement | null,
  banner: document.getElementById('feature-banner')!,
  toast: document.getElementById('toast')!,
  modal: document.getElementById('modal-root')!,
  canvas: document.getElementById('game-canvas') as HTMLCanvasElement,
};

let config: GameConfigResponse;
let busy = false;
let autoplay = false;
let freeRemaining = 0;
/** Cumulative wins during the current free/buy feature (client display only). */
let featureWinSum = 0;
let inFeature = false;
/** Last known Supercoin herd size (for meter pulse). */
let lastHerd = 0;

const reels = new ReelView(el.canvas);
reels.onSpinStart = () => audio.spinStart();
reels.onReelStop = (reelIndex, symbols) => audio.reelLandSymbols(reelIndex, symbols);
reels.onSpinEnd = () => {
  audio.stopSpinLoop();
  audio.anticipationStop();
};
reels.onAnticipation = () => audio.anticipationStart();
reels.onAnticipationEnd = () => audio.anticipationStop();
reels.onNearMiss = () => audio.nearMiss();

function fmt(n: number): string {
  return n.toLocaleString();
}

function setBalance(n: number) {
  el.balance.textContent = fmt(n);
}

function toast(msg: string) {
  el.toast.textContent = msg;
  el.toast.classList.add('show');
  window.setTimeout(() => el.toast.classList.remove('show'), 2200);
}

function openModal(html: string) {
  el.modal.innerHTML = `<div class="modal">${html}</div>`;
  el.modal.classList.add('open');
  el.modal.onclick = (e) => {
    if (e.target === el.modal) closeModal();
  };
}

function closeModal() {
  el.modal.classList.remove('open');
  el.modal.innerHTML = '';
}

function fillBets() {
  el.bet.innerHTML = '';
  for (const b of config.betSteps) {
    const opt = document.createElement('option');
    opt.value = String(b);
    opt.textContent = fmt(b);
    el.bet.appendChild(opt);
  }
  el.bet.value = String(config.betSteps[2] ?? config.minBet);
}

function currentBet(): number {
  return Number(el.bet.value);
}

function setBusy(v: boolean) {
  busy = v;
  el.spin.disabled = v;
  el.buy.disabled = v || freeRemaining > 0;
  el.bet.disabled = v || freeRemaining > 0;
  el.plus.disabled = v || freeRemaining > 0;
  el.minus.disabled = v || freeRemaining > 0;
}

function setFeatureBanner(text: string | null, alert = false) {
  if (!text) {
    el.banner.textContent = '';
    el.banner.classList.remove('show', 'alert');
    return;
  }
  el.banner.textContent = text;
  el.banner.classList.add('show');
  el.banner.classList.toggle('alert', alert);
}

function updateHerdMeter(result: SpinResult, opts?: { pulse?: boolean }) {
  const herd = result.features.longhornHerd ?? 0;
  const onGrid = result.features.longhornsOnGrid ?? 0;
  const freeActive =
    freeRemaining > 0 ||
    inFeature ||
    result.features.buyEntered ||
    result.features.enteredFreeGames ||
    result.mode === 'FREE' ||
    result.mode === 'STAMPEDE';

  if (el.herdMeter) {
    if (freeActive || herd > 0) {
      el.herdMeter.classList.add('show');
    } else {
      el.herdMeter.classList.remove('show');
    }
  }

  el.premiumInj.textContent = String(herd);
  if (el.herdOnGrid) {
    if (freeActive) {
      el.herdOnGrid.textContent =
        onGrid > 0
          ? `On reels now: ${onGrid}`
          : herd > 0
            ? 'On reels now: 0 — herd is in the strips'
            : 'Land Supercoin on reel 1 to grow the herd';
    } else {
      el.herdOnGrid.textContent = 'Free games · Supercoin injects Longhorns';
    }
  }

  if (opts?.pulse && el.herdMeter && herd > lastHerd) {
    el.herdMeter.classList.remove('pulse');
    // reflow to restart animation
    void el.herdMeter.offsetWidth;
    el.herdMeter.classList.add('pulse');
    window.setTimeout(() => el.herdMeter?.classList.remove('pulse'), 1000);
  }
  lastHerd = herd;

  // Persistent status line during free games
  if (freeActive && !result.features.freeGamesEnded) {
    const parts = [
      `FREE · ${freeRemaining} left`,
      herd > 0 ? `herd ${herd}` : 'herd 0 — watch reel 1 Supercoin',
      onGrid > 0 ? `${onGrid} Longhorn on reels` : null,
    ].filter(Boolean);
    setFeatureBanner(parts.join(' · '));
  } else if (result.features.freeGamesEnded) {
    setFeatureBanner(null);
  } else if (!freeActive) {
    setFeatureBanner(null);
  }
}

function updateMeters(result: SpinResult) {
  freeRemaining = result.features.freeGamesRemaining;
  if (freeRemaining > 0 || result.features.buyEntered || result.features.enteredFreeGames) {
    el.fgMeter.style.display = 'block';
    el.fgCount.textContent = String(freeRemaining);
  } else {
    el.fgMeter.style.display = 'none';
  }

  const ways = result.heights.reduce((a, b) => a * b, 1);
  el.ways.textContent = ways.toLocaleString();

  updateHerdMeter(result, { pulse: true });

  if (el.featureWin && el.featureWinVal) {
    if (inFeature || freeRemaining > 0) {
      el.featureWin.style.display = 'block';
      el.featureWinVal.textContent = fmt(featureWinSum);
    } else {
      el.featureWin.style.display = 'none';
    }
  }
}

/**
 * Feature ceremony order:
 * buy → intro splash → supercoin wheel (if any) → reels already animated before this for natural;
 * For buy we may show intro/wheel BEFORE reels (handled in doSpin).
 */
async function presentFeaturesAfterSpin(result: SpinResult) {
  // Natural free-game entry (after trigger spin already shown)
  if (result.features.enteredFreeGames && !result.features.buyEntered) {
    await showFeatureSplash({
      kind: 'free-games',
      title: `${result.features.freeGamesAwarded} FREE GAMES`,
      subtitle:
        'Premium Longhorns pay big. Supercoin on reel 1 spins a wheel that injects more Longhorns into every free spin.',
      ms: 2800,
    });
    setFeatureBanner('FREE GAMES · Land Supercoin on reel 1 to grow the Longhorn herd');
  }

  // Retrigger during free (not the buy package splash)
  if (
    !result.features.buyEntered &&
    !result.features.enteredFreeGames &&
    result.features.freeGamesAwarded > 0 &&
    (result.mode === 'FREE' || result.mode === 'STAMPEDE')
  ) {
    await showFeatureSplash({
      kind: 'retrigger',
      title: `+${result.features.freeGamesAwarded} FREE GAMES`,
      subtitle: 'Retrigger! Herd size stays — keep landing Longhorns.',
      ms: 2000,
    });
  }

  if (result.features.stampede) {
    await showFeatureSplash({
      kind: 'stampede',
      title: 'STAMPEDE!',
      subtitle: '16,000 ways · guaranteed Longhorn on every reel',
      ms: 2400,
    });
    // Show the forced Longhorn line on the board
    await reels.pulseLonghorns(1600);
    audio.longhornWin();
  }

  // Supercoin during free (not already shown pre-spin on buy entry)
  if (result.features.supercoin && !result.features.buyEntered) {
    await showSupercoinWheel(result.features.supercoin);
    updateHerdMeter(result, { pulse: true });
    // Spotlight any Longhorns already visible this spin
    if ((result.features.longhornsOnGrid ?? 0) > 0) {
      await reels.pulseLonghorns(1200);
    }
  }

  // Free-spin callout: make Longhorns on the grid obvious (skip if we just did stampede/supercoin)
  if (
    (result.mode === 'FREE' || result.mode === 'STAMPEDE') &&
    !result.features.supercoin &&
    !result.features.stampede &&
    !result.features.buyEntered &&
    (result.features.longhornsOnGrid ?? 0) > 0 &&
    !autoplay
  ) {
    await showLonghornOnGridCallout(
      result.features.longhornsOnGrid,
      result.features.longhornHerd,
    );
    await reels.pulseLonghorns(900);
  }

  if (result.features.freeGamesEnded) {
    await showFeatureSplash({
      kind: 'free-end',
      title: 'FREE GAMES COMPLETE',
      subtitle: `Feature total: ${fmt(featureWinSum)} · final herd ${result.features.longhornHerd}`,
      ms: 2400,
    });
    audio.freeGamesEnd();
    featureWinSum = 0;
    inFeature = false;
    lastHerd = 0;
    if (el.featureWin) el.featureWin.style.display = 'none';
    if (el.herdMeter) el.herdMeter.classList.remove('show');
    setFeatureBanner(null);
  }
}

async function doSpin(buyTier?: BuyTier) {
  if (busy) return;
  audio.unlock();
  audio.click();
  setBusy(true);
  try {
    // Buy ceremony: intro (+ wheel) BEFORE reels for the entry response
    if (buyTier) {
      const opt = config.buyOptions.find((o) => o.tier === buyTier);
      const cost = Math.floor(currentBet() * (opt?.costX ?? 80));
      await showFeatureSplash({
        kind: 'free-games',
        title: `BOUGHT ${opt?.freeGames ?? 8} FREE GAMES`,
        subtitle: `${buyTier.toUpperCase()} · cost ${fmt(cost)}${
          opt?.supercoinOnEntry
            ? ' · Supercoin injects Longhorns before first spin'
            : ''
        }`,
        ms: 2200,
      });
    }

    const result = await api.spin(currentBet(), buyTier);

    // Track feature win accumulation
    if (
      result.features.buyEntered ||
      result.features.enteredFreeGames ||
      result.mode === 'FREE' ||
      result.mode === 'STAMPEDE' ||
      freeRemaining > 0
    ) {
      if (result.features.buyEntered || result.features.enteredFreeGames) {
        featureWinSum = 0;
        inFeature = true;
      }
      if (inFeature || result.features.buyEntered || result.mode === 'FREE' || result.mode === 'STAMPEDE') {
        inFeature = true;
        // Buy first spin + free spins count; natural trigger spin is base (not in feature pot)
        if (
          result.features.buyEntered ||
          result.mode === 'FREE' ||
          result.mode === 'STAMPEDE'
        ) {
          featureWinSum += result.totalWin;
        }
      }
    }

    // Buy entry supercoin wheel before reels (herd already applied to this spin’s strips)
    if (result.features.buyEntered && result.features.supercoin) {
      await showSupercoinWheel(result.features.supercoin);
      updateHerdMeter(result, { pulse: true });
      setFeatureBanner(
        `Herd ${result.features.longhornHerd} · Longhorns injected into free reels — spinning…`,
      );
    }

    const antic = anticipationReels(result.grid);
    const nearMiss = isScatterNearMiss(result.grid);
    await reels.animateSpin(result.grid, result.heights, {
      anticipationReels: antic,
      nearMissScatter: nearMiss,
    });

    // After reels stop: if Longhorns landed, flash them before win cycle
    if (
      (result.mode === 'FREE' ||
        result.mode === 'STAMPEDE' ||
        result.features.longhornHerd > 0) &&
      (result.features.longhornsOnGrid ?? 0) > 0 &&
      result.totalWin <= 0
    ) {
      // No win celebration path — still show the herd on reels briefly
      void reels.pulseLonghorns(700);
    }

    if (inFeature && el.featureWinVal) {
      el.featureWinVal.textContent = fmt(featureWinSum);
    }
    updateMeters(result);

    // Celebration: combos → count → BIG/MEGA/SUPER → TOTAL → Space back to game
    const { tier } = await runCelebration(reels, result, {
      lastWinEl: el.lastWin,
      featureWinEl: el.featureWinVal,
      featureWinSum: inFeature ? featureWinSum : undefined,
      turbo: autoplay,
    });

    // Ambient stem: free games keep free bed; otherwise base
    if (inFeature || result.features.freeGamesRemaining > 0) {
      audio.setMusicStem('free');
    } else {
      audio.setMusicStem('base');
    }

    setBalance(result.balance);
    updateMeters(result);

    if (tier === 'super' || tier === 'mega') {
      toast(`${tier === 'super' ? 'SUPER' : 'MEGA'} WIN ${fmt(result.totalWin)}!`);
    } else if (tier === 'big') {
      toast(`BIG WIN ${fmt(result.totalWin)}`);
    } else if (tier === 'small' || tier === 'micro') {
      /* reel FX already celebrated */
    }

    await presentFeaturesAfterSpin(result);

    if (result.features.freeGamesRemaining > 0) {
      setBusy(false);
      await sleep(500);
      // Use session bet for free spins
      const locked =
        result.features.sessionBet ?? result.bet ?? currentBet();
      if (el.bet.querySelector(`option[value="${locked}"]`)) {
        el.bet.value = String(locked);
      }
      await doSpin();
      return;
    }
  } catch (e) {
    audio.stopSpinLoop();
    const msg = e instanceof Error ? e.message : 'Spin failed';
    toast(msg);
    if (msg === 'INSUFFICIENT_FUNDS') autoplay = false;
  } finally {
    setBusy(false);
    if (autoplay && freeRemaining <= 0) {
      await sleep(400);
      void doSpin();
    }
  }
}

function showRules() {
  audio.click();
  openModal(`
    <h2>Western Stampede — Rules</h2>
    <p><strong>How you win (ways):</strong> Match 3+ of the same pay symbol on adjacent reels from the <em>left</em>. Multiple stacks on a reel create multiple ways. Each symbol type pays separately; all combination pays are summed.</p>
    <p>5 reels · 4-6-6-6-4 · <strong>3,456 ways</strong> (Stampede → 16,000).</p>
    <ul>
      <li><strong>Wilds</strong> substitute for pay symbols (not scatters) and may apply ×2 or ×3 when they help a win.</li>
      <li><strong>Combos:</strong> each winning symbol group animates with an explainer (count · ways · amount · wild mult).</li>
      <li><strong>Scatters:</strong> 3/4/5 → 8/15/20 free games. In free games, 2+ scatters retrigger +5/8/15/20.</li>
      <li><strong>Longhorn</strong> is the premium pay symbol. During free games the <strong>Longhorn herd</strong> meter shows how many extra Longhorns Supercoin has injected into the free-game reels (they stay for the whole feature).</li>
      <li><strong>Supercoin</strong> (reel 1 in free games): lands → wheel → “+N Longhorns” fly into the reels. Watch the herd meter and “On reels now”.</li>
      <li><strong>Stampede:</strong> random expand to 16,000 ways + guaranteed Longhorn on every reel (highlighted after the splash).</li>
      <li><strong>Buy:</strong> 22× / 80× / 145× bet → 8 / 15 / 20 free games (same math as natural).</li>
      <li><strong>Win celebrations (× your bet):</strong> BIG ≥15× · MEGA ≥40× · SUPER ≥80×. Speedy count-up; <strong>Space or click</strong> skips to the next celebration phase.</li>
    </ul>
    <p style="color:#c44b2b;font-weight:600">Demo play only — not real-money gambling. Outcomes are server-authoritative.</p>
    <div class="modal-actions">
      <button class="btn-spin" type="button" id="close-rules">Got it</button>
    </div>
  `);
  document.getElementById('close-rules')!.onclick = () => closeModal();
}

function showBuy() {
  audio.click();
  const bet = currentBet();
  const opts = config.buyOptions;
  openModal(`
    <h2>Buy Free Games</h2>
    <p>Current bet: <strong>${fmt(bet)}</strong>. Same free-game math as natural scatters; higher tiers add Supercoin / Stampede boost.</p>
    <div class="modal-actions" style="flex-direction:column;align-items:stretch">
      ${opts
        .map(
          (o) => `
        <button class="btn-buy" type="button" data-tier="${o.tier}">
          ${o.tier.toUpperCase()} — ${o.freeGames} FG — ${fmt(Math.floor(bet * o.costX))} (${o.costX}×)
          ${o.supercoinOnEntry ? ' · Supercoin on entry' : ''}
          ${o.stampedeWeightBoost > 0 ? ' · Stampede boost' : ''}
        </button>`,
        )
        .join('')}
      <button class="btn-secondary" type="button" id="buy-cancel">Cancel</button>
    </div>
  `);
  document.getElementById('buy-cancel')!.onclick = () => closeModal();
  el.modal.querySelectorAll<HTMLButtonElement>('[data-tier]').forEach((btn) => {
    btn.onclick = () => {
      const tier = btn.dataset.tier as BuyTier;
      closeModal();
      void doSpin(tier);
    };
  });
}

function showTopUp() {
  audio.click();
  openModal(`
    <h2>Top Up Credits</h2>
    <p>Demo wallet top-up (PSP integration hook ready on the server).</p>
    <div class="modal-actions" style="flex-direction:column;align-items:stretch">
      ${[1000, 5000, 10000, 25000]
        .map(
          (a) =>
            `<button class="btn-topup" type="button" data-amt="${a}">+ ${fmt(a)} credits</button>`,
        )
        .join('')}
      <button class="btn-secondary" type="button" id="topup-cancel">Cancel</button>
    </div>
  `);
  document.getElementById('topup-cancel')!.onclick = () => closeModal();
  el.modal.querySelectorAll<HTMLButtonElement>('[data-amt]').forEach((btn) => {
    btn.onclick = async () => {
      const amount = Number(btn.dataset.amt);
      try {
        const r = await api.topUp(amount);
        setBalance(r.balance);
        audio.coin();
        toast(`Topped up +${fmt(amount)}`);
        closeModal();
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Top-up failed');
      }
    };
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function boot() {
  toast('Loading cabinet art…');
  try {
    await reels.ready;
    await api.ensureSession();
    config = await api.getConfig();
    fillBets();
    const wallet = await api.getWallet();
    setBalance(wallet.balance);
    toast(`Welcome — ${fmt(wallet.balance)} demo credits`);
  } catch (e) {
    toast(e instanceof Error ? e.message : 'Failed to connect to RGS');
    console.error(e);
  }

  const unlockAudio = () => {
    audio.unlock();
  };
  window.addEventListener('pointerdown', unlockAudio, { once: true });
  window.addEventListener('keydown', unlockAudio, { once: true });
  toast('Click anywhere for full cabinet sound (loud by design)');

  el.spin.onclick = () => {
    audio.unlock();
    void doSpin();
  };
  el.buy.onclick = () => showBuy();
  el.topup.onclick = () => showTopUp();
  el.rules.onclick = () => showRules();
  el.auto.onclick = () => {
    audio.click();
    autoplay = !autoplay;
    el.auto.textContent = autoplay ? 'STOP' : 'AUTO';
    if (autoplay) void doSpin();
  };
  el.plus.onclick = () => {
    audio.click();
    const i = config.betSteps.indexOf(currentBet());
    if (i < config.betSteps.length - 1) el.bet.value = String(config.betSteps[i + 1]);
  };
  el.minus.onclick = () => {
    audio.click();
    const i = config.betSteps.indexOf(currentBet());
    if (i > 0) el.bet.value = String(config.betSteps[i - 1]);
  };
  if (el.mute) {
    el.mute.onclick = () => {
      audio.setMuted(!audio.muted);
      el.mute!.textContent = audio.muted ? 'SOUND OFF' : 'SOUND';
      if (!audio.muted) audio.click();
    };
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      // During celebration SkipGate (capture) advances phases; ignore spin while busy
      if (busy) return;
      audio.unlock();
      void doSpin();
    }
  });
}

void boot();
