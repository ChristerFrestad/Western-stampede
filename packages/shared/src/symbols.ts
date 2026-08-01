/** Symbol IDs used across math engine, API, and client. */
export const SymbolId = {
 NINE: '9',
 TEN: '10',
 J: 'J',
 Q: 'Q',
 K: 'K',
 A: 'A',
 EAGLE: 'EAGLE',
 COYOTE: 'COYOTE',
 WOLF: 'WOLF',
 STAG: 'STAG',
 LONGHORN: 'LONGHORN',
 WILD: 'WILD',
 /** Free-game wild variant. */
 WILD_FG: 'WILD_FG',
 SCATTER: 'SCATTER',
 /** Supercoin face — triggers wheel during free games (counts as scatter face). */
 SUPERCOIN: 'SUPERCOIN',
} as const;

export type SymbolId = (typeof SymbolId)[keyof typeof SymbolId];

export const LOW_SYMBOLS: SymbolId[] = [
 SymbolId.NINE,
 SymbolId.TEN,
 SymbolId.J,
 SymbolId.Q,
 SymbolId.K,
 SymbolId.A,
];

export const HIGH_SYMBOLS: SymbolId[] = [
 SymbolId.EAGLE,
 SymbolId.COYOTE,
 SymbolId.WOLF,
 SymbolId.STAG,
 SymbolId.LONGHORN,
];

export function isWild(s: SymbolId): boolean {
 return s === SymbolId.WILD || s === SymbolId.WILD_FG;
}

export function isScatterLike(s: SymbolId): boolean {
 return s === SymbolId.SCATTER || s === SymbolId.SUPERCOIN;
}

/** Base visible reel heights: 4-6-6-6-4 → 3,456 ways. */
export const BASE_REEL_HEIGHTS = [4, 6, 6, 6, 4] as const;

/** Stampede: middle three reels expand to 10 → 16,000 ways. */
export const STAMPEDE_REEL_HEIGHTS = [4, 10, 10, 10, 4] as const;

export const REEL_COUNT = 5;

export function waysFromHeights(heights: readonly number[]): number {
 return heights.reduce((a, b) => a * b, 1);
}
