import type { BuyTier, GameConfigResponse, SpinResult } from '@ws/shared';
import * as api from './api';
import { audio } from './audio';
import {
  showFeatureSplash,
  showLonghornOnGridCallout,
  showSupercoinWheel,
  setLonghornBoard,
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
  fgTotalLabel: document.getElementById('fg-total-label') as HTMLElement | null,
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
  betLockedChip: document.getElementById('bet-locked-chip') as HTMLElement | null,
  demoBadge: document.getElementById('demo-badge') as HTMLElement | null,
};

type ClientPhase =
  | 'idle'
  | 'spinning'
  | 'celebrating'
  | 'feature_ceremony'
  | 'free_loop';

let config: GameConfigResponse;
let busy = false;
let phase: ClientPhase = 'idle';
let autoplay = false;
let freeRemaining = 0;
let freeTotal = 0;
/** Cumulative wins during the current free/buy feature (display only). */
let featureWinSum = 0;
let inFeature = false;
let lastHerd = 0;
let balanceCredits = 0;
let soundUnlocked = false;

const reels = new ReelView(el.canvas);
setLonghornBoard(reels);
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

function friendlyError(code: string): string {
  const map: Record<string, string> = {
    INSUFFICIENT_FUNDS: 'Not enough credits — top up or lower your bet',
    INVALID_BET: 'Invalid bet amount',
    INVALID_BUY_TIER: 'That buy tier is not available',
    FREE_GAMES_ACTIVE: 'Finish free games before buying again',
    BET_LOCKED: 'Bet is locked during free games',
    UNAUTHORIZED: 'Session expired — refreshing…',
    RATE_LIMITED: 'Too many requests — wait a moment',
    RNG_UNAVAILABLE: 'Game temporarily unavailable (RNG)',
  };
  return map[code] ?? code;
}

function setBalance(n: number) {
  balanceCredits = n;
  el.balance.textContent = fmt(n);
}

function toast(msg: string) {
  el.toast.textContent = msg;
  el.toast.classList.add('show');
  window.setTimeout(() => el.toast.classList.remove('show'), 2400);
}

function openModal(html: string, wide = false) {
  el.modal.innerHTML = `<div class="modal${wide ? ' modal-buy' : ''}" role="dialog" aria-modal="true" tabindex="-1">${html}</div>`;
  el.modal.classList.add('open');
  el.modal.setAttribute('aria-hidden', 'false');
  el.modal.onclick = (e) => {
    if (e.target === el.modal) closeModal();
  };
  const dialog = el.modal.querySelector('.modal') as HTMLElement | null;
  // Accessible name: prefer h2 id, else aria-label from title text
  const h2 = dialog?.querySelector('h2');
  if (h2) {
    if (!h2.id) h2.id = 'modal-title';
    dialog?.setAttribute('aria-labelledby', h2.id);
  } else {
    dialog?.setAttribute('aria-label', 'Dialog');
  }
  const focusable = dialog?.querySelector<HTMLElement>(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
  );
  window.setTimeout(() => focusable?.focus(), 0);
}

function closeModal() {
  el.modal.classList.remove('open');
  el.modal.innerHTML = '';
  el.modal.setAttribute('aria-hidden', 'true');
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
  if (el.betLockedChip) {
    if (freeRemaining > 0) {
      el.betLockedChip.classList.add('show');
      el.betLockedChip.textContent = `Bet locked · ${fmt(currentBet())}`;
    } else {
      el.betLockedChip.classList.remove('show');
    }
  }
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
    if (freeActive || herd > 0) el.herdMeter.classList.add('show');
    else el.herdMeter.classList.remove('show');
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
    void el.herdMeter.offsetWidth;
    el.herdMeter.classList.add('pulse');
    window.setTimeout(() => el.herdMeter?.classList.remove('pulse'), 1000);
  }
  lastHerd = herd;

  if (freeActive && !result.features.freeGamesEnded) {
    const parts = [
      `FREE · ${freeRemaining}${freeTotal > 0 ? ` / ${freeTotal}` : ''} left`,
      herd > 0 ? `herd ${herd}` : 'herd 0',
      onGrid > 0 ? `${onGrid} Longhorn on reels` : null,
    ].filter(Boolean);
    setFeatureBanner(parts.join(' · '));
  } else if (result.features.freeGamesEnded || !freeActive) {
    if (!freeActive) setFeatureBanner(null);
  }
}

function updateMeters(result: SpinResult) {
  freeRemaining = result.features.freeGamesRemaining;
  freeTotal = result.features.freeGamesTotal || freeTotal;

  if (freeRemaining > 0 || result.features.buyEntered || result.features.enteredFreeGames) {
    el.fgMeter.style.display = 'block';
    if (freeTotal > 0) {
      el.fgCount.textContent = `${freeRemaining} / ${freeTotal}`;
      if (el.fgTotalLabel) el.fgTotalLabel.textContent = 'remaining / total';
    } else {
      el.fgCount.textContent = String(freeRemaining);
      if (el.fgTotalLabel) el.fgTotalLabel.textContent = 'remaining';
    }
  } else {
    el.fgMeter.style.display = 'none';
    freeTotal = 0;
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

  if (el.betLockedChip) {
    if (freeRemaining > 0) {
      el.betLockedChip.classList.add('show');
      el.betLockedChip.textContent = `Bet locked · ${fmt(result.features.sessionBet ?? result.bet)}`;
    } else {
      el.betLockedChip.classList.remove('show');
    }
  }
}

async function presentFeaturesAfterSpin(result: SpinResult, turbo: boolean) {
  phase = 'feature_ceremony';

  if (result.features.enteredFreeGames && !result.features.buyEntered) {
    freeTotal = result.features.freeGamesTotal || result.features.freeGamesAwarded;
    await showFeatureSplash({
      kind: 'free-games',
      title: `${result.features.freeGamesAwarded} FREE GAMES`,
      subtitle:
        'Premium Longhorns pay big. Supercoin on reel 1 spins a wheel that injects more Longhorns into every free spin.',
      ms: 2800,
      turbo,
    });
    setFeatureBanner('FREE GAMES · Land Supercoin on reel 1 to grow the Longhorn herd');
  }

  if (
    !result.features.buyEntered &&
    !result.features.enteredFreeGames &&
    result.features.freeGamesAwarded > 0 &&
    (result.mode === 'FREE' || result.mode === 'STAMPEDE')
  ) {
    freeTotal = result.features.freeGamesTotal;
    await showFeatureSplash({
      kind: 'retrigger',
      title: `+${result.features.freeGamesAwarded} FREE GAMES`,
      subtitle: 'Retrigger! Herd size stays — keep landing Longhorns.',
      ms: 2000,
      turbo,
    });
  }

  if (result.features.stampede) {
    await showFeatureSplash({
      kind: 'stampede',
      title: 'STAMPEDE!',
      subtitle: '16,000 ways · guaranteed Longhorn on every reel',
      ms: 2400,
      turbo,
    });
    await reels.pulseLonghorns(turbo ? 700 : 1600);
    audio.longhornWin();
  }

  if (result.features.supercoin && !result.features.buyEntered) {
    await showSupercoinWheel(result.features.supercoin, { turbo });
    updateHerdMeter(result, { pulse: true });
    if ((result.features.longhornsOnGrid ?? 0) > 0) {
      await reels.pulseLonghorns(turbo ? 500 : 1200);
    }
  }

  if (
    (result.mode === 'FREE' || result.mode === 'STAMPEDE') &&
    !result.features.supercoin &&
    !result.features.stampede &&
    !result.features.buyEntered &&
    (result.features.longhornsOnGrid ?? 0) > 0 &&
    !turbo
  ) {
    await showLonghornOnGridCallout(
      result.features.longhornsOnGrid,
      result.features.longhornHerd,
      { turbo, board: reels },
    );
  }

  if (result.features.freeGamesEnded) {
    await showFeatureSplash({
      kind: 'free-end',
      title: 'FREE GAMES COMPLETE',
      subtitle: `Feature total: ${fmt(featureWinSum)} · final herd ${result.features.longhornHerd}`,
      ms: 2400,
      turbo,
    });
    audio.freeGamesEnd();
    featureWinSum = 0;
    inFeature = false;
    lastHerd = 0;
    freeTotal = 0;
    if (el.featureWin) el.featureWin.style.display = 'none';
    if (el.herdMeter) el.herdMeter.classList.remove('show');
    setFeatureBanner(null);
  }
}

/**
 * One server spin + full presentation. Does not auto-chain free games
 * (caller owns the free loop).
 */
async function playOneSpin(buyTier?: BuyTier): Promise<SpinResult | null> {
  const turbo = autoplay;
  phase = 'spinning';

  if (buyTier) {
    const opt = config.buyOptions.find((o) => o.tier === buyTier);
    const cost = Math.floor(currentBet() * (opt?.costX ?? 0));
    await showFeatureSplash({
      kind: 'buy',
      title: `BOUGHT ${opt?.freeGames ?? 8} FREE GAMES`,
      subtitle: `${(buyTier as string).toUpperCase()} · ${fmt(cost)} credits (${opt?.costX}×)${
        opt?.supercoinOnEntry ? ' · Supercoin before first spin' : ''
      }`,
      ms: 2000,
      turbo,
    });
  }

  const result = await api.spin(currentBet(), buyTier);

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
      freeTotal = result.features.freeGamesTotal || result.features.freeGamesAwarded;
    }
    if (inFeature || result.features.buyEntered || result.mode === 'FREE' || result.mode === 'STAMPEDE') {
      inFeature = true;
      if (
        result.features.buyEntered ||
        result.mode === 'FREE' ||
        result.mode === 'STAMPEDE'
      ) {
        featureWinSum += result.totalWin;
      }
    }
  }

  if (result.features.buyEntered && result.features.supercoin) {
    phase = 'feature_ceremony';
    await showSupercoinWheel(result.features.supercoin, { turbo });
    updateHerdMeter(result, { pulse: true });
    setFeatureBanner(
      `Herd ${result.features.longhornHerd} · Longhorns in free reels — spinning…`,
    );
  }

  const antic = anticipationReels(result.grid);
  const nearMiss = isScatterNearMiss(result.grid);
  await reels.animateSpin(result.grid, result.heights, {
    anticipationReels: antic,
    nearMissScatter: nearMiss,
  });

  if (
    (result.mode === 'FREE' ||
      result.mode === 'STAMPEDE' ||
      result.features.longhornHerd > 0) &&
    (result.features.longhornsOnGrid ?? 0) > 0 &&
    result.totalWin <= 0
  ) {
    void reels.pulseLonghorns(turbo ? 400 : 700);
  }

  if (inFeature && el.featureWinVal) {
    el.featureWinVal.textContent = fmt(featureWinSum);
  }
  updateMeters(result);

  phase = 'celebrating';
  const { tier } = await runCelebration(reels, result, {
    lastWinEl: el.lastWin,
    featureWinEl: el.featureWinVal,
    featureWinSum: inFeature ? featureWinSum : undefined,
    turbo,
  });

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
  }

  await presentFeaturesAfterSpin(result, turbo);
  return result;
}

async function doSpin(buyTier?: BuyTier) {
  if (busy) return;
  ensureSound();
  audio.click();
  setBusy(true);
  try {
    let result = await playOneSpin(buyTier);
    if (!result) return;

    // Iterative free-game chain (no recursion)
    while (result.features.freeGamesRemaining > 0) {
      phase = 'free_loop';
      setBusy(false);
      setBusy(true);
      await sleep(autoplay ? 220 : 480);
      const locked = result.features.sessionBet ?? result.bet ?? currentBet();
      if (el.bet.querySelector(`option[value="${locked}"]`)) {
        el.bet.value = String(locked);
      }
      result = await playOneSpin();
      if (!result) break;
    }
  } catch (e) {
    audio.stopSpinLoop();
    const raw = e instanceof Error ? e.message : 'Spin failed';
    toast(friendlyError(raw));
    if (raw === 'INSUFFICIENT_FUNDS') autoplay = false;
    if (raw === 'UNAUTHORIZED') {
      try {
        await api.ensureSession();
      } catch {
        /* ignore */
      }
    }
  } finally {
    phase = 'idle';
    setBusy(false);
    if (autoplay && freeRemaining <= 0) {
      await sleep(350);
      void doSpin();
    }
  }
}

function buyLinesFromConfig(): string {
  return config.buyOptions
    .map(
      (o) =>
        `${o.costX}× (${o.tier}) → ${o.freeGames} free games${
          o.supercoinOnEntry ? ' + Supercoin entry' : ''
        }${o.stampedeWeightBoost > 0 ? ' + Stampede boost' : ''}`,
    )
    .join(' · ');
}

function showRules() {
  audio.click();
  const buyLine = buyLinesFromConfig();
  const rtp = Math.round((config.rtpTarget ?? 0.95) * 100);
  openModal(`
    <h2>Western Stampede — Rules</h2>
    <p><strong>How you win (ways):</strong> Match 3+ of the same pay symbol on adjacent reels from the <em>left</em>. Multiple stacks on a reel create multiple ways. Each symbol type pays separately; all combination pays are summed.</p>
    <p>5 reels · 4-6-6-6-4 · <strong>3,456 ways</strong> (Stampede → 16,000).</p>
    <ul>
      <li><strong>Wilds</strong> substitute for pay symbols (not scatters) and may apply ×2 or ×3 when they help a win.</li>
      <li><strong>Combos:</strong> each winning symbol group animates with an explainer (count · ways · amount · wild mult).</li>
      <li><strong>Scatters:</strong> 3/4/5 → 8/15/20 free games. In free games, 2+ scatters retrigger +5/8/15/20.</li>
      <li><strong>Longhorn</strong> is the premium pay symbol. During free games the <strong>Longhorn herd</strong> meter shows how many extra Longhorns Supercoin has injected into free-game reels.</li>
      <li><strong>Supercoin</strong> (reel 1 in free games): lands → wheel → “+N Longhorns” stay in the strips for the feature.</li>
      <li><strong>Stampede:</strong> random expand to 16,000 ways + guaranteed Longhorn on every reel.</li>
      <li><strong>Buy:</strong> ${buyLine}. Same free-game math as natural scatters.</li>
      <li><strong>Win celebrations (× your bet):</strong> BIG ≥15× · MEGA ≥40× · SUPER ≥80×. <strong>Space or click</strong> skips presentation phases (never changes outcomes).</li>
      <li><strong>Target RTP:</strong> ~${rtp}% (math version ${config.version}).</li>
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
  if (freeRemaining > 0) {
    toast('Finish free games before buying again');
    return;
  }
  const bet = currentBet();
  const opts = config.buyOptions;
  const cards = opts
    .map((o) => {
      const cost = Math.floor(bet * o.costX);
      const canAfford = balanceCredits >= cost;
      const recommended = o.tier === 'enhanced';
      const premium = o.tier === 'premium';
      const perks: string[] = [];
      if (o.tier === 'standard') perks.push('Same package as 3 scatters');
      if (o.supercoinOnEntry) perks.push('Supercoin inject before first free spin');
      if (o.stampedeWeightBoost > 0) perks.push('Higher Stampede chance in free games');
      if (!perks.length) perks.push('Natural free-game strips & paytable');
      const cls = [
        'buy-card',
        recommended ? 'recommended' : '',
        premium ? 'premium' : '',
      ]
        .filter(Boolean)
        .join(' ');
      const badge = recommended
        ? '<span class="buy-badge">Recommended</span>'
        : premium
          ? '<span class="buy-badge gold">Premium</span>'
          : '';
      return `
        <button type="button" class="${cls}" data-tier="${o.tier}" ${canAfford ? '' : 'disabled'}
          aria-label="Buy ${o.tier} ${o.freeGames} free games for ${cost}">
          ${badge}
          <span class="tier-name">${o.tier.toUpperCase()}</span>
          <span class="tier-fg">${o.freeGames} free games</span>
          <span class="tier-price">${fmt(cost)}</span>
          <span class="tier-mult">${o.costX}× current bet</span>
          <span class="tier-perks">${perks.join(' · ')}</span>
        </button>`;
    })
    .join('');

  openModal(
    `
    <h2>Buy Free Games</h2>
    <p class="buy-lead">Current bet <strong>${fmt(bet)}</strong>. Same free-game math as natural scatters — higher tiers add Supercoin / Stampede value.</p>
    <div class="buy-grid">${cards}</div>
    <p class="buy-foot">Math ${config.version} · target RTP ~${Math.round((config.rtpTarget ?? 0.95) * 100)}% · demo credits only</p>
    <div class="modal-actions">
      <button class="btn-secondary" type="button" id="buy-cancel">Cancel</button>
    </div>
  `,
    true,
  );

  document.getElementById('buy-cancel')!.onclick = () => closeModal();
  el.modal.querySelectorAll<HTMLButtonElement>('[data-tier]').forEach((btn) => {
    btn.onclick = () => {
      if (btn.disabled) {
        toast('Not enough credits for this tier');
        return;
      }
      const tier = btn.dataset.tier as BuyTier;
      closeModal();
      void doSpin(tier);
    };
  });

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeModal();
      window.removeEventListener('keydown', onKey);
    }
    const map: Record<string, number> = { '1': 0, '2': 1, '3': 2 };
    if (map[e.key] != null) {
      const buttons = el.modal.querySelectorAll<HTMLButtonElement>('[data-tier]');
      const b = buttons[map[e.key]!];
      if (b && !b.disabled) b.click();
    }
  };
  window.addEventListener('keydown', onKey);
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
        toast(friendlyError(e instanceof Error ? e.message : 'Top-up failed'));
      }
    };
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function ensureSound() {
  audio.unlock();
  if (!soundUnlocked) {
    soundUnlocked = true;
    syncMuteButton();
  }
}

function syncMuteButton() {
  if (!el.mute) return;
  el.mute.textContent = audio.muted ? 'MUTED' : 'SOUND';
  el.mute.classList.toggle('btn-mute-off', audio.muted);
  el.mute.classList.toggle('btn-mute-on', !audio.muted);
  el.mute.setAttribute('aria-pressed', audio.muted ? 'true' : 'false');
}

async function boot() {
  toast('Loading cabinet…');
  try {
    await reels.ready;
    await api.ensureSession();
    config = await api.getConfig();
    fillBets();
    const wallet = await api.getWallet();
    setBalance(wallet.balance);
    if (el.demoBadge && config.demoOnly === false) {
      el.demoBadge.textContent = 'Live config';
    }
    toast(`Ready — ${fmt(wallet.balance)} demo credits`);
  } catch (e) {
    toast(e instanceof Error ? e.message : 'Failed to connect to RGS');
    console.error(e);
  }

  const unlockAudio = () => {
    ensureSound();
  };
  window.addEventListener('pointerdown', unlockAudio, { once: true });
  window.addEventListener('keydown', unlockAudio, { once: true });

  el.spin.onclick = () => {
    ensureSound();
    void doSpin();
  };
  el.buy.onclick = () => showBuy();
  el.topup.onclick = () => showTopUp();
  el.rules.onclick = () => showRules();
  el.auto.onclick = () => {
    ensureSound();
    audio.click();
    autoplay = !autoplay;
    el.auto.textContent = autoplay ? 'STOP' : 'AUTO';
    el.auto.classList.toggle('btn-mute-off', autoplay);
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
      ensureSound();
      audio.setMuted(!audio.muted);
      syncMuteButton();
      if (!audio.muted) audio.click();
    };
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      // Celebration / feature skip handlers use capture; only spin when idle
      if (busy || phase !== 'idle') return;
      e.preventDefault();
      ensureSound();
      void doSpin();
    }
  });

  void phase; // reserved for future UI debug HUD
}

void boot();
