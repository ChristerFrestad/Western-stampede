import { BANNER_LABEL, type BannerTier } from './celebration-config';

function ensureRoot(): HTMLDivElement {
  let el = document.getElementById('celebration-root') as HTMLDivElement | null;
  if (!el) {
    el = document.createElement('div');
    el.id = 'celebration-root';
    document.body.appendChild(el);
  }
  return el;
}

export interface BannerApi {
  showCounting(displayValue: number, hint: string): void;
  updateCount(displayValue: number): void;
  showBanner(tier: BannerTier, totalWin: number): void;
  /** Final step: total amount won this spin (and optional feature pot). */
  showTotal(totalWin: number, opts?: { featureTotal?: number }): void;
  setSkipHint(visible: boolean): void;
  hide(): void;
  flashThreshold(tier: BannerTier): void;
}

export function createBannerOverlay(): BannerApi {
  const root = ensureRoot();

  const renderShell = (inner: string, extraClass = '') => {
    root.innerHTML = `
      <div class="cele-veil ${extraClass}">
        <div class="cele-card">
          ${inner}
          <div class="cele-skip" id="cele-skip">SPACE / CLICK — NEXT</div>
        </div>
      </div>
    `;
    root.classList.add('show');
  };

  return {
    showCounting(displayValue: number, hint: string) {
      root.classList.remove('flash-big', 'flash-mega', 'flash-super', 'flash-total');
      renderShell(`
        <div class="cele-kicker">${hint}</div>
        <div class="cele-title cele-title-count">WIN</div>
        <div class="cele-amount" id="cele-amount">${displayValue.toLocaleString()}</div>
      `);
    },
    updateCount(displayValue: number) {
      const amt = document.getElementById('cele-amount');
      if (amt) amt.textContent = displayValue.toLocaleString();
    },
    showBanner(tier: BannerTier, totalWin: number) {
      const sub =
        tier === 'super'
          ? 'LEGENDARY PAYOUT'
          : tier === 'mega'
            ? 'MASSIVE WIN'
            : 'BIG HIT';
      const confetti =
        tier === 'super' || tier === 'mega'
          ? `<div class="cele-confetti" aria-hidden="true">${Array.from(
              { length: tier === 'super' ? 48 : 28 },
              (_, i) =>
                `<i style="--i:${i};--x:${(i * 37) % 100};--d:${0.4 + (i % 7) * 0.12}s;--c:${
                  ['#ffd24a', '#ff8a3a', '#e8a0ff', '#7dffb0', '#fff'][i % 5]
                }"></i>`,
            ).join('')}</div>`
          : '';
      renderShell(`
        ${confetti}
        <div class="cele-kicker">WESTERN STAMPEDE · ${sub}</div>
        <div class="cele-title cele-title-${tier}">${BANNER_LABEL[tier]}</div>
        <div class="cele-amount" id="cele-amount">${totalWin.toLocaleString()}</div>
      `);
      root.classList.remove('flash-big', 'flash-mega', 'flash-super', 'flash-total');
      root.classList.add(`flash-${tier}`);
    },
    showTotal(totalWin: number, opts?: { featureTotal?: number }) {
      root.classList.remove('flash-big', 'flash-mega', 'flash-super');
      root.classList.add('flash-total');
      const feat =
        opts?.featureTotal != null
          ? `<div class="cele-sub">Feature total · ${opts.featureTotal.toLocaleString()}</div>`
          : '';
      renderShell(
        `
        <div class="cele-kicker">SPIN COMPLETE</div>
        <div class="cele-title cele-title-total">YOU WON</div>
        <div class="cele-amount" id="cele-amount">${totalWin.toLocaleString()}</div>
        ${feat}
      `,
        'cele-total',
      );
      const h = document.getElementById('cele-skip');
      if (h) h.textContent = 'SPACE / CLICK — BACK TO GAME';
    },
    flashThreshold(tier: BannerTier) {
      root.classList.add(`flash-${tier}`);
      const title = root.querySelector('.cele-title');
      if (title) {
        title.className = `cele-title cele-title-${tier}`;
        title.textContent = BANNER_LABEL[tier];
      }
    },
    setSkipHint(visible: boolean) {
      const h = document.getElementById('cele-skip');
      if (h) h.style.opacity = visible ? '1' : '0';
    },
    hide() {
      root.classList.remove(
        'show',
        'flash-big',
        'flash-mega',
        'flash-super',
        'flash-total',
      );
      root.innerHTML = '';
    },
  };
}
