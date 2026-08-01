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
  // Snap display index to closest known segment (matches math defaults)
  let idx = values.indexOf(result.wheelValue);
  if (idx < 0) {
    idx = values.reduce(
      (best, v, i) =>
        Math.abs(v - result.wheelValue) < Math.abs(values[best]! - result.wheelValue) ? i : best,
      0,
    );
  }

  const seg = 360 / values.length;
  // Land with pointer at top: rotate so segment center hits 0deg
  const targetDeg = 360 * 4 + (360 - (idx * seg + seg / 2));

  layer.innerHTML = `
    <div class="fx-splash wheel">
      <div class="fx-card wheel-card">
        <div class="fx-kicker">SUPERCOIN</div>
        <div class="fx-title">LONGHORN BOOST</div>
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

  // Tick SFX while spinning
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
    res.textContent = `+${result.awardedLonghorns} longhorns · total ${result.totalLonghornsInjected}`;
  }

  await sleep(1600);
  layer.classList.remove('show');
  layer.innerHTML = '';
}
