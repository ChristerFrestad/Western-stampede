/**
 * Uniform cover-fit math for reel cells.
 * Never stretch: scale uniformly, center, crop overflow with mask.
 */

export const CELL_W = 118;
export const CELL_H = 96;
export const CELL_PAD = 5;
export const CELL_INNER_W = CELL_W - CELL_PAD * 2;
export const CELL_INNER_H = CELL_H - CELL_PAD * 2;
export const REEL_GAP = 8;
export const REEL_PAD = 4;

export interface CoverFit {
  /** Uniform scale applied to texture (width * scale, height * scale). */
  scale: number;
  /** Offset inside cell (top-left of sprite relative to cell origin). */
  x: number;
  y: number;
  drawW: number;
  drawH: number;
  innerW: number;
  innerH: number;
}

/**
 * Cover-fit: fill the inner cell completely without distorting aspect ratio.
 * Overflow is cropped by a mask the same size as the cell.
 */
export function coverFit(
  texW: number,
  texH: number,
  innerW = CELL_INNER_W,
  innerH = CELL_INNER_H,
  pad = CELL_PAD,
): CoverFit {
  const w = Math.max(1, texW);
  const h = Math.max(1, texH);
  const scale = Math.max(innerW / w, innerH / h);
  const drawW = w * scale;
  const drawH = h * scale;
  const x = pad + (innerW - drawW) / 2;
  const y = pad + (innerH - drawH) / 2;
  return { scale, x, y, drawW, drawH, innerW, innerH };
}

/** Contain-fit (letterbox) — kept for HUD/icons if needed. */
export function containFit(
  texW: number,
  texH: number,
  innerW = CELL_INNER_W,
  innerH = CELL_INNER_H,
  pad = CELL_PAD,
): CoverFit {
  const w = Math.max(1, texW);
  const h = Math.max(1, texH);
  const scale = Math.min(innerW / w, innerH / h);
  const drawW = w * scale;
  const drawH = h * scale;
  const x = pad + (innerW - drawW) / 2;
  const y = pad + (innerH - drawH) / 2;
  return { scale, x, y, drawW, drawH, innerW, innerH };
}

export function isPremiumSymbol(id: string): boolean {
  return (
    id === 'LONGHORN' ||
    id === 'WILD' ||
    id === 'WILD_FG' ||
    id === 'SCATTER' ||
    id === 'SUPERCOIN'
  );
}
