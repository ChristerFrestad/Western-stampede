import type { BuyTier, GameConfigResponse, SpinResult } from '@ws/shared';
import * as api from './api';
import { audio } from './audio';
import { showFeatureSplash, showSupercoinWheel } from './overlays';
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
  banner: document.getElementById('feature-banner')!,
  toast: document.getElementById('toast')!,
  modal: document.getElementById('modal-root')!,
  canvas: document.getElementById('game-canvas') as HTMLCanvasElement,
};

let config: GameConfigResponse;
let busy = false;
let autoplay = false;
let freeRemaining = 0;

const reels = new ReelView(el.canvas);
reels.onSpinStart = () => audio.spinStart();
reels.onReelStop = () => audio.spinStopTick();
reels.onSpinEnd = () => audio.stopSpinLoop();

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

function banner(msg: string, ms = 2200) {
  el.banner.textContent = msg;
  el.banner.classList.add('show');
  window.setTimeout(() => el.banner.classList.remove('show'), ms);
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

function updateMeters(result: SpinResult) {
  freeRemaining = result.features.freeGamesRemaining;
  if (freeRemaining > 0) {
    el.fgMeter.style.display = 'block';
    el.fgCount.textContent = String(freeRemaining);
  } else {
    el.fgMeter.style.display = 'none';
  }

  const ways = result.heights.reduce((a, b) => a * b, 1);
  el.ways.textContent = ways.toLocaleString();

  if (result.features.supercoin) {
    el.premiumInj.textContent = String(result.features.supercoin.totalLonghornsInjected);
  }
}

async function presentFeatures(result: SpinResult) {
  if (result.features.enteredFreeGames) {
    await showFeatureSplash({
      kind: 'free-games',
      title: `${result.features.freeGamesAwarded} FREE GAMES`,
      subtitle: 'Longhorns are restless — reels stay hot',
      ms: 2600,
    });
  } else if (result.features.freeGamesAwarded > 0 && result.mode === 'FREE') {
    await showFeatureSplash({
      kind: 'retrigger',
      title: `+${result.features.freeGamesAwarded} FREE GAMES`,
      subtitle: 'Retrigger!',
      ms: 2000,
    });
  }

  if (result.features.stampede) {
    await showFeatureSplash({
      kind: 'stampede',
      title: 'STAMPEDE!',
      subtitle: '16,000 ways · guaranteed longhorn line',
      ms: 2400,
    });
  }

  if (result.features.supercoin) {
    await showSupercoinWheel(result.features.supercoin);
  }

  if (result.features.freeGamesEnded) {
    await showFeatureSplash({
      kind: 'free-end',
      title: 'FREE GAMES COMPLETE',
      subtitle: `Last win meter: ${fmt(result.totalWin)}`,
      ms: 2000,
    });
  }
}

async function doSpin(buyTier?: BuyTier) {
  if (busy) return;
  audio.unlock();
  audio.click();
  setBusy(true);
  try {
    const result = await api.spin(currentBet(), buyTier);
    await reels.animateSpin(result.grid, result.heights);
    reels.highlightWins(result.wins);
    setBalance(result.balance);
    el.lastWin.textContent = fmt(result.totalWin);
    updateMeters(result);

    if (result.totalWin > 0) {
      const x = result.totalWin / result.bet;
      if (x >= 50) {
        audio.winBig();
        toast(`MEGA WIN ${fmt(result.totalWin)}!`);
      } else if (x >= 15) {
        audio.winBig();
        toast(`BIG WIN ${fmt(result.totalWin)}`);
      } else if (x >= 5) {
        audio.winSmall();
        toast(`Nice win ${fmt(result.totalWin)}`);
      } else {
        audio.winSmall();
      }
    }

    await presentFeatures(result);

    if (result.features.freeGamesRemaining > 0) {
      setBusy(false);
      await sleep(500);
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
    <p>5 reels · 4-6-6-6-4 grid · <strong>3,456 ways</strong> (Stampede expands to 16,000).</p>
    <ul>
      <li>Match symbols left-to-right on adjacent reels.</li>
      <li>Wild substitutes and can multiply 2× or 3×.</li>
      <li>3 / 4 / 5 Scatters → 8 / 15 / 20 free games.</li>
      <li>During free games, 2+ scatters retrigger 5 / 8 / 15 / 20 extra.</li>
      <li>Supercoin on reel 1 in free games spins a wheel for extra longhorn symbols.</li>
      <li>Stampede randomly expands middle reels with a guaranteed longhorn line.</li>
      <li>Buy Bonus: jump into free games for 80× / 150× / 250× bet.</li>
    </ul>
    <p style="color:#c44b2b;font-weight:600">Demo play only — not real-money gambling. Outcomes are server-authoritative with a pluggable RNG.</p>
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
    <p>Current bet: <strong>${fmt(bet)}</strong></p>
    <div class="modal-actions" style="flex-direction:column;align-items:stretch">
      ${opts
        .map(
          (o) => `
        <button class="btn-buy" type="button" data-tier="${o.tier}">
          ${o.tier.toUpperCase()} — ${o.freeGames} FG — ${fmt(Math.floor(bet * o.costX))} (${o.costX}×)
          ${o.supercoinOnEntry ? ' · Supercoin' : ''}
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

  const unlock = () => audio.unlock();
  window.addEventListener('pointerdown', unlock, { once: true });

  el.spin.onclick = () => void doSpin();
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
      audio.muted = !audio.muted;
      if (audio.muted) audio.stopSpinLoop();
      el.mute!.textContent = audio.muted ? 'SOUND OFF' : 'SOUND';
      audio.click();
    };
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      void doSpin();
    }
  });
}

void boot();
