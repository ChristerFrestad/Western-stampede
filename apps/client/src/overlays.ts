import type { SupercoinResult } from '@ws/shared';
import { audio } from './audio';

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
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

export async function showFeatureSplash(opts: {
  kind: 'free-games' | 'retrigger' | 'stampede' | 'free-end';
  title: string;
  subtitle?: string;
  ms?: number;
}): Promise<void> {
  const layer = ensureLayer();
  const ms = opts.ms ?? 2400;
  const splashClass =
    opts.kind === 'free-games' || opts.kind === 'retrigger'
      ? 'fx-splash free'
      : opts.kind === 'stampede'
        ? 'fx-splash stampede'
        : 'fx-splash end';

  layer.innerHTML = `
    <div class="${splashClass}">
      <div class="fx-card">
        <div class="fx-kicker">${opts.kind === 'free-end' ? 'FEATURE COMPLETE' : 'FEATURE'}</div>
        <div class="fx-title">${opts.title}</div>
        ${opts.subtitle ? `<div class="fx-sub">${opts.subtitle}</div>` : ''}
      </div>
    </div>
  `;
  layer.classList.add('show');

  if (opts.kind === 'free-games' || opts.kind === 'retrigger') audio.freeGames();
  else if (opts.kind === 'stampede') audio.stampede();
  else audio.winSmall();

  await sleep(ms);
  layer.classList.remove('show');
  layer.innerHTML = '';
}

/**
 * Supercoin wheel overlay. Server already chose wheelValue;
 * we animate to a matching segment for presentation only.
 */
export async function showSupercoinWheel(result: SupercoinResult): Promise<void> {
  const layer = ensureLayer();
  const values = [5, 8, 10, 12, 15, 20, 25];
  let idx = values.indexOf(result.wheelValue);
  if (idx < 0) {
    idx = values.reduce(
      (best, v, i) =>
        Math.abs(v - result.wheelValue) < Math.abs(values[best]! - result.wheelValue) ? i : best,
      0,
    );
  }

  const seg = 360 / values.length;
  const targetDeg = 360 * 4 + (360 - (idx * seg + seg / 2));

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

  const disc = document.getElementById('wheel-disc') as HTMLDivElement;
  await sleep(50);
  disc.style.transition = 'transform 3.2s cubic-bezier(0.12, 0.75, 0.12, 1)';
  disc.style.transform = `rotate(${targetDeg}deg)`;

  let ticks = 0;
  const tickIv = window.setInterval(() => {
    audio.wheelTick();
    ticks++;
    if (ticks > 28) clearInterval(tickIv);
  }, 90);

  await sleep(3300);
  clearInterval(tickIv);
  audio.wheelLand();
  audio.coin();

  const res = document.getElementById('wheel-result');
  if (res) {
    res.innerHTML = `<strong>+${result.awardedLonghorns}</strong> Longhorns added · herd <strong>${result.totalLonghornsInjected}</strong>`;
  }

  await sleep(1400);
  layer.classList.remove('show');
  layer.innerHTML = '';

  // Inject ceremony (flying herd into the cabinet)
  await showLonghornInject(result);
}

/**
 * Visual “Longhorns enter the reels” after Supercoin wheel.
 * Pure presentation — math already applied on server strips.
 */
export async function showLonghornInject(result: SupercoinResult): Promise<void> {
  const layer = ensureLayer();
  const n = Math.min(14, Math.max(5, result.awardedLonghorns));
  const icons = Array.from({ length: n }, (_, i) => {
    const left = 12 + Math.random() * 76;
    const delay = i * 70;
    const dur = 900 + Math.random() * 500;
    return `<img class="herd-fly" src="/assets/symbols/LONGHORN.jpg" alt=""
      style="left:${left}%; animation-delay:${delay}ms; animation-duration:${dur}ms" />`;
  }).join('');

  layer.innerHTML = `
    <div class="fx-splash inject">
      <div class="fx-card inject-card">
        <div class="fx-kicker">HERD GROWING</div>
        <div class="fx-title">+${result.awardedLonghorns} LONGHORNS</div>
        <div class="fx-sub">Injected into free-game reels · total herd <strong id="inject-total">${result.totalLonghornsInjected - result.awardedLonghorns}</strong></div>
        <p class="fx-explain">More Longhorns on the strips = more chances to land the premium symbol every free spin.</p>
        <div class="herd-fly-stage" id="herd-fly-stage">${icons}</div>
      </div>
    </div>
  `;
  layer.classList.add('show');
  audio.longhornLand();
  audio.coin();

  // Count herd meter text up
  const totalEl = document.getElementById('inject-total');
  const from = Math.max(0, result.totalLonghornsInjected - result.awardedLonghorns);
  const to = result.totalLonghornsInjected;
  const start = performance.now();
  const dur = 1100;
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

  // Extra horn hits while icons fly
  for (let i = 0; i < Math.min(5, result.awardedLonghorns); i++) {
    window.setTimeout(() => audio.longhornLand(), 120 + i * 140);
  }

  await sleep(900);
  layer.classList.remove('show');
  layer.innerHTML = '';
}

/** Compact toast-style callout for on-grid Longhorn count after a free spin. */
export async function showLonghornOnGridCallout(count: number, herd: number): Promise<void> {
  if (count <= 0 && herd <= 0) return;
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
  if (count > 0) audio.longhornLand();
  await sleep(count > 0 ? 1600 : 900);
  layer.classList.remove('show');
  layer.innerHTML = '';
}
