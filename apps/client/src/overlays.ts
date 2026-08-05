import type { SupercoinResult } from '@ws/shared';
import { audio } from './audio';

/** Optional Pixi board for inject/land choreography (set from main). */
export type LonghornBoardFx = {
  playLonghornInject: (count: number, ms?: number) => Promise<void>;
  pulseLonghornCells?: (ms?: number) => Promise<void>;
};

let longhornBoard: LonghornBoardFx | null = null;
export function setLonghornBoard(board: LonghornBoardFx | null) {
  longhornBoard = board;
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

/** Space / stage click advances presentation only (never money). */
function waitOrSkip(ms: number, turbo = false): Promise<boolean> {
  const duration = turbo ? Math.floor(ms * 0.42) : ms;
  return new Promise((resolve) => {
    let done = false;
    const finish = (skipped: boolean) => {
      if (done) return;
      done = true;
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onPtr, true);
      resolve(skipped);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.key !== ' ') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA'))
        return;
      e.preventDefault();
      e.stopPropagation();
      audio.click();
      finish(true);
    };
    const onPtr = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('footer, header, .modal, button, select, a')) return;
      e.stopPropagation();
      audio.click();
      finish(true);
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onPtr, true);
    window.setTimeout(() => finish(false), duration);
  });
}

function ensureLayer(): HTMLDivElement {
  let layer = document.getElementById('fx-layer') as HTMLDivElement | null;
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'fx-layer';
    document.body.appendChild(layer);
  }
  return layer;
}

function showSkipHint(layer: HTMLElement) {
  let hint = layer.querySelector('.fx-skip-hint') as HTMLElement | null;
  if (!hint) {
    hint = document.createElement('div');
    hint.className = 'fx-skip-hint';
    hint.textContent = 'Space / click to skip';
    layer.appendChild(hint);
  }
}

export async function showFeatureSplash(opts: {
  kind: 'free-games' | 'retrigger' | 'stampede' | 'free-end' | 'buy';
  title: string;
  subtitle?: string;
  ms?: number;
  turbo?: boolean;
}): Promise<void> {
  const layer = ensureLayer();
  const ms = opts.ms ?? 2400;
  const splashClass =
    opts.kind === 'free-games' || opts.kind === 'retrigger' || opts.kind === 'buy'
      ? 'fx-splash free'
      : opts.kind === 'stampede'
        ? 'fx-splash stampede'
        : 'fx-splash end';

  const kicker =
    opts.kind === 'free-end'
      ? 'FEATURE COMPLETE'
      : opts.kind === 'buy'
        ? 'BONUS BUY'
        : opts.kind === 'stampede'
          ? 'EXPAND FEATURE'
          : 'FEATURE';

  const art =
    opts.kind === 'free-games' ||
    opts.kind === 'retrigger' ||
    opts.kind === 'buy' ||
    opts.kind === 'stampede'
      ? `<div class="fx-art-wrap"><img class="fx-art" src="/assets/ui/free-games-splash.jpg" alt="" /></div>`
      : '';

  layer.innerHTML = `
    <div class="${splashClass}">
      <div class="fx-card fx-card-feature">
        ${art}
        <div class="fx-kicker">${kicker}</div>
        <div class="fx-title">${opts.title}</div>
        ${opts.subtitle ? `<div class="fx-sub">${opts.subtitle}</div>` : ''}
      </div>
    </div>
  `;
  layer.classList.add('show');
  showSkipHint(layer);

  if (opts.kind === 'free-games' || opts.kind === 'retrigger' || opts.kind === 'buy')
    audio.freeGames();
  else if (opts.kind === 'stampede') audio.stampede();
  else audio.winSmall();

  await waitOrSkip(ms, opts.turbo);
  layer.classList.remove('show');
  layer.innerHTML = '';
}

/**
 * Supercoin wheel. Server already chose wheelValue;
 * client lands matching segment for presentation only.
 */
export async function showSupercoinWheel(
  result: SupercoinResult,
  opts?: { turbo?: boolean },
): Promise<void> {
  const turbo = opts?.turbo ?? false;
  const layer = ensureLayer();
  const values = [5, 8, 10, 12, 15, 20, 25];
  let idx = values.indexOf(result.wheelValue);
  if (idx < 0) {
    idx = values.reduce(
      (best, v, i) =>
        Math.abs(v - result.wheelValue) < Math.abs(values[best]! - result.wheelValue)
          ? i
          : best,
      0,
    );
  }

  const seg = 360 / values.length;
  const targetDeg = 360 * 4 + (360 - (idx * seg + seg / 2));
  const spinMs = turbo ? 1400 : 3200;

  layer.innerHTML = `
    <div class="fx-splash wheel">
      <div class="fx-card wheel-card">
        <div class="fx-kicker">SUPERCOIN · REEL 1</div>
        <div class="fx-title">LONGHORN BOOST</div>
        <p class="fx-explain">Wheel awards Longhorn symbols that stay injected into free-game reels for the rest of the feature.</p>
        <div class="wheel-stage">
          <div class="wheel-pointer"></div>
          <div class="wheel-disc" id="wheel-disc" style="transform: rotate(0deg)">
            <img src="/assets/ui/supercoin-wheel.jpg" alt="" />
            <div class="wheel-labels">
              ${values
                .map((v, i) => {
                  const rot = i * seg + seg / 2;
                  return `<span style="--r:${rot}deg">${v}</span>`;
                })
                .join('')}
            </div>
          </div>
        </div>
        <div class="fx-sub" id="wheel-result">Spinning…</div>
      </div>
    </div>
  `;
  layer.classList.add('show');
  showSkipHint(layer);
  audio.duckMusic(0.25, spinMs + 800);

  const disc = document.getElementById('wheel-disc') as HTMLDivElement;
  await sleep(40);
  disc.style.transition = `transform ${spinMs / 1000}s cubic-bezier(0.12, 0.75, 0.12, 1)`;
  disc.style.transform = `rotate(${targetDeg}deg)`;

  let ticks = 0;
  const tickIv = window.setInterval(
    () => {
      audio.wheelTick();
      ticks++;
      if (ticks > (turbo ? 12 : 28)) clearInterval(tickIv);
    },
    turbo ? 70 : 90,
  );

  const skipped = await waitOrSkip(spinMs + 80, false);
  clearInterval(tickIv);
  if (skipped) {
    disc.style.transition = 'transform 0.15s ease-out';
    disc.style.transform = `rotate(${targetDeg}deg)`;
    await sleep(160);
  }

  audio.wheelLand();
  audio.coin();

  const res = document.getElementById('wheel-result');
  if (res) {
    res.innerHTML = `<strong>+${result.awardedLonghorns}</strong> Longhorns added · herd <strong>${result.totalLonghornsInjected}</strong>`;
  }

  await waitOrSkip(turbo ? 600 : 1400, turbo);
  layer.classList.remove('show');
  layer.innerHTML = '';

  // board hook set by main via setLonghornBoard
  await showLonghornInject(result, { turbo, board: longhornBoard });
}

export async function showLonghornInject(
  result: SupercoinResult,
  opts?: { turbo?: boolean; board?: LonghornBoardFx | null },
): Promise<void> {
  const turbo = opts?.turbo ?? false;
  const layer = ensureLayer();
  const n = Math.min(10, Math.max(4, result.awardedLonghorns));
  const icons = Array.from({ length: n }, (_, i) => {
    const left = 12 + Math.random() * 76;
    const delay = i * (turbo ? 40 : 70);
    const dur = (turbo ? 500 : 900) + Math.random() * 400;
    return `<img class="herd-fly" src="/assets/symbols/LONGHORN.jpg" alt=""
      style="left:${left}%; animation-delay:${delay}ms; animation-duration:${dur}ms" />`;
  }).join('');

  layer.innerHTML = `
    <div class="fx-splash inject">
      <div class="fx-card inject-card">
        <div class="fx-kicker">HERD GROWING</div>
        <div class="fx-title">+${result.awardedLonghorns} LONGHORNS</div>
        <div class="fx-sub">Injected into free-game reels · total herd <strong id="inject-total">${result.totalLonghornsInjected - result.awardedLonghorns}</strong></div>
        <p class="fx-explain">Watch the reels — Longhorns drop into the free-game strips for every remaining free spin.</p>
        <div class="herd-fly-stage" id="herd-fly-stage">${icons}</div>
      </div>
    </div>
  `;
  layer.classList.add('show');
  showSkipHint(layer);
  audio.longhornLand();
  audio.coin();

  // Parallel: board rain into reels while DOM card counts herd
  const boardPromise = opts?.board
    ? opts.board.playLonghornInject(
        result.awardedLonghorns,
        turbo ? 900 : 1600,
      )
    : Promise.resolve();

  const totalEl = document.getElementById('inject-total');
  const from = Math.max(0, result.totalLonghornsInjected - result.awardedLonghorns);
  const to = result.totalLonghornsInjected;
  const start = performance.now();
  const dur = turbo ? 500 : 1100;
  await new Promise<void>((resolve) => {
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / dur);
      const v = Math.floor(from + (to - from) * t);
      if (totalEl) totalEl.textContent = String(v);
      if (t < 1) requestAnimationFrame(tick);
      else {
        if (totalEl) totalEl.textContent = String(to);
        resolve();
      }
    };
    requestAnimationFrame(tick);
  });

  for (let i = 0; i < Math.min(turbo ? 2 : 5, result.awardedLonghorns); i++) {
    window.setTimeout(() => audio.longhornLand(), 80 + i * 120);
  }

  await Promise.all([
    waitOrSkip(turbo ? 400 : 900, turbo),
    boardPromise,
  ]);
  layer.classList.remove('show');
  layer.innerHTML = '';
}

export async function showLonghornOnGridCallout(
  count: number,
  herd: number,
  opts?: { turbo?: boolean; board?: LonghornBoardFx | null },
): Promise<void> {
  if (count <= 0 && herd <= 0) return;
  if (opts?.turbo) {
    await opts.board?.pulseLonghornCells?.(400);
    return;
  }
  const layer = ensureLayer();
  layer.innerHTML = `
    <div class="fx-splash callout">
      <div class="fx-card callout-card">
        <div class="callout-row">
          <img src="/assets/symbols/LONGHORN.jpg" alt="" class="callout-icon" />
          <div>
            <div class="fx-title callout-title">${count} LONGHORN${count === 1 ? '' : 'S'} ON REELS</div>
            <div class="fx-sub">Free-game herd · ${herd} injected into strips</div>
          </div>
        </div>
      </div>
    </div>
  `;
  layer.classList.add('show');
  await Promise.all([
    waitOrSkip(1400, false),
    opts?.board?.pulseLonghornCells?.(1200) ?? Promise.resolve(),
  ]);
  layer.classList.remove('show');
  layer.innerHTML = '';
}
