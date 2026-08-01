import type { SymbolId } from '@ws/shared';

/** Fallback colors if a texture fails — not used when assets load. */
export interface SymbolStyle {
  label: string;
  bg: string;
  fg: string;
  ring?: string;
}

export const SYMBOL_STYLES: Record<string, SymbolStyle> = {
  '9': { label: '9', bg: '#3a4555', fg: '#c5d0e0' },
  '10': { label: '10', bg: '#3a4555', fg: '#c5d0e0' },
  J: { label: 'J', bg: '#3a4a5a', fg: '#d0dce8' },
  Q: { label: 'Q', bg: '#4a3a5a', fg: '#e0d0f0' },
  K: { label: 'K', bg: '#5a3a3a', fg: '#f0d0d0' },
  A: { label: 'A', bg: '#3a5a4a', fg: '#d0f0e0' },
  EAGLE: { label: 'EAGLE', bg: '#2a3a50', fg: '#f0e8d0', ring: '#8ab4e8' },
  COYOTE: { label: 'COYOTE', bg: '#4a3a28', fg: '#f0d8b0', ring: '#c4a06a' },
  WOLF: { label: 'WOLF', bg: '#2a2a3a', fg: '#d0d0e8', ring: '#8890b0' },
  STAG: { label: 'STAG', bg: '#3a4a30', fg: '#e0f0c8', ring: '#90b070' },
  LONGHORN: { label: 'LONGHORN', bg: '#3a2818', fg: '#f5d080', ring: '#e8b84a' },
  WILD: { label: 'WILD', bg: '#6a4010', fg: '#ffe8a0', ring: '#ffcc44' },
  WILD_FG: { label: 'WILD', bg: '#f5f0e8', fg: '#2a2010', ring: '#ffffff' },
  SCATTER: { label: 'SCATTER', bg: '#8a7010', fg: '#fff8d0', ring: '#ffd700' },
  SUPERCOIN: { label: 'SUPER', bg: '#a08020', fg: '#fff', ring: '#ffee88' },
};

export function styleFor(id: SymbolId | string): SymbolStyle {
  return SYMBOL_STYLES[id] ?? { label: String(id).slice(0, 2), bg: '#333', fg: '#fff' };
}
