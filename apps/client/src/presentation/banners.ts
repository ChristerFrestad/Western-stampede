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
  setSkipHint(visible: boolean): void;
  hide(): void;
  flashThreshold(tier: BannerTier): void;
}

export function createBannerOverlay(): BannerApi {
  const root = ensureRoot();

  const renderShell = (inner: string) => {
    root.innerHTML = `
      <div class="cele-veil">
        <div class="cele-card">
          ${inner}
          <div class="cele-skip" id="cele-skip">SPACE / CLICK — SKIP</div>
        </div>
      </div>
    `;
    root.classList.add('show');
  };

  return {
    showCounting(displayValue: number, hint: string) {
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
      renderShell(`
        <div class="cele-kicker">WESTERN STAMPEDE</div>
        <div class="cele-title cele-title-${tier}">${BANNER_LABEL[tier]}</div>
        <div class="cele-amount" id="cele-amount">${totalWin.toLocaleString()}</div>
      `);
      root.classList.remove('flash-big', 'flash-mega', 'flash-super');
      root.classList.add(`flash-${tier}`);
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
      root.classList.remove('show', 'flash-big', 'flash-mega', 'flash-super');
      root.innerHTML = '';
    },
  };
}
