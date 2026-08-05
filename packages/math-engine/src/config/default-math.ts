import {
 BASE_REEL_HEIGHTS,
 STAMPEDE_REEL_HEIGHTS,
 SymbolId,
 type BuyOption,
 type FeatureWeights,
 type MathConfigPublic,
 type PaytableEntry,
} from '@ws/shared';
import { buildShuffledStrip } from '../strip-build.js';

/**
 * Paytable: multipliers of total bet **per way**.
 * With 3,456 ways, multi-way stacks grow fast — keep per-way values modest.
 * Large headline wins come from multi-way stacks, wild mults, and stampede.
 */
/**
 * Per-way pays (× total bet). Calibrated v1.3.0 against 5M-spin parallel PCG sim:
 * pre-scale base RTP ≈ 0.997 → scale ≈ 0.9526 for target ~0.95.
 * All money outcomes flow through this table (base, free, stampede, wilds).
 */
export const DEFAULT_PAYTABLE: PaytableEntry[] = [
  { symbol: SymbolId.LONGHORN, pays: { 3: 0.21, 4: 0.667, 5: 2.667 } },
  { symbol: SymbolId.STAG, pays: { 3: 0.133, 4: 0.429, 5: 1.62 } },
  { symbol: SymbolId.WOLF, pays: { 3: 0.105, 4: 0.333, 5: 1.334 } },
  { symbol: SymbolId.COYOTE, pays: { 3: 0.086, 4: 0.267, 5: 1.096 } },
  { symbol: SymbolId.EAGLE, pays: { 3: 0.071, 4: 0.21, 5: 0.905 } },
  { symbol: SymbolId.A, pays: { 3: 0.043, 4: 0.133, 5: 0.438 } },
  { symbol: SymbolId.K, pays: { 3: 0.038, 4: 0.105, 5: 0.362 } },
  { symbol: SymbolId.Q, pays: { 3: 0.03, 4: 0.086, 5: 0.305 } },
  { symbol: SymbolId.J, pays: { 3: 0.025, 4: 0.071, 5: 0.267 } },
  { symbol: SymbolId.TEN, pays: { 3: 0.019, 4: 0.057, 5: 0.21 } },
  { symbol: SymbolId.NINE, pays: { 3: 0.015, 4: 0.048, 5: 0.181 } },
];

/**
 * Buy costs ≈ mean session mult / 0.95 after paytable scale
 * (see `pnpm math:sim:buy` after v1.3.0). Packages still 8 / 15 / 20 FG.
 */
export const DEFAULT_BUY_OPTIONS: BuyOption[] = [
  {
    tier: 'standard',
    costX: 19,
    freeGames: 8,
    supercoinOnEntry: false,
    stampedeWeightBoost: 0,
  },
  {
    tier: 'enhanced',
    costX: 63,
    freeGames: 15,
    supercoinOnEntry: true,
    stampedeWeightBoost: 0.02,
  },
  {
    tier: 'premium',
    costX: 118,
    freeGames: 20,
    supercoinOnEntry: true,
    stampedeWeightBoost: 0.05,
  },
];

export const DEFAULT_FEATURE_WEIGHTS: FeatureWeights = {
 /** ~1 in 500 spins. */
 stampedeChance: 0.002,
 wildMult2Weight: 70,
 wildMult3Weight: 30,
 supercoinWheelValues: [5, 8, 10, 12, 15, 20, 25],
 supercoinCap: 80,
};

/**
 * Virtual reel strips (stop counts). Tuned for ~95% RTP target via simulator;
 * adjust freely via admin / MathConfig without client changes.
 *
 * Built from weighted bags then **deterministically shuffled** so consecutive
 * strip cells are mixed (not 14×9 then 14×10…). Counts preserved → same hit rates.
 */

const HIGH = [
 [SymbolId.EAGLE, 5],
 [SymbolId.COYOTE, 4],
 [SymbolId.WOLF, 4],
 [SymbolId.STAG, 3],
 [SymbolId.LONGHORN, 2],
] as Array<[SymbolId, number]>;

/** Base-game strips — pad with lows so scatters/wilds are rare (~1 feature / 100+ spins). */
const PAD_LOW: Array<[SymbolId, number]> = [
 [SymbolId.NINE, 14],
 [SymbolId.TEN, 14],
 [SymbolId.J, 12],
 [SymbolId.Q, 12],
 [SymbolId.K, 10],
 [SymbolId.A, 10],
];

/** Per-reel composition bags (before shuffle). */
const BASE_BAGS: Array<Array<[SymbolId, number]>> = [
 [
  ...PAD_LOW,
  ...HIGH,
  [SymbolId.SCATTER, 1],
  [SymbolId.SUPERCOIN, 1],
  [SymbolId.LONGHORN, 2],
 ],
 [
  ...PAD_LOW,
  ...HIGH,
  [SymbolId.WILD, 2],
  [SymbolId.SCATTER, 1],
  [SymbolId.LONGHORN, 2],
 ],
 [
  ...PAD_LOW,
  ...HIGH,
  [SymbolId.WILD, 2],
  [SymbolId.SCATTER, 1],
  [SymbolId.LONGHORN, 2],
 ],
 [
  ...PAD_LOW,
  ...HIGH,
  [SymbolId.WILD, 2],
  [SymbolId.SCATTER, 1],
  [SymbolId.LONGHORN, 2],
 ],
 [
  ...PAD_LOW,
  ...HIGH,
  [SymbolId.SCATTER, 1],
  [SymbolId.LONGHORN, 2],
 ],
];

/** Fixed seeds so strip layout is stable across processes (cert-friendly). */
const BASE_SEEDS = [0x575301, 0x575302, 0x575303, 0x575304, 0x575305];

export const DEFAULT_BASE_STRIPS: SymbolId[][] = BASE_BAGS.map((bag, i) =>
  // Mini-stacks up to 5 (ways need stacks) but never the old 14-long low bands
  buildShuffledStrip(bag, BASE_SEEDS[i] ?? 1000 + i, 5, 5),
);

/**
 * Free-game strips — slightly richer wilds/longhorns, fewer scatters than base
 * so retriggers stay exciting but not infinite. Re-shuffled after inject extras.
 */
export const DEFAULT_FG_STRIPS: SymbolId[][] = DEFAULT_BASE_STRIPS.map((reel, ri) => {
  const filtered: SymbolId[] = reel.filter(
    (s) => s !== SymbolId.SCATTER && s !== SymbolId.SUPERCOIN,
  );
  filtered.push(SymbolId.SCATTER);
  if (ri === 0) filtered.push(SymbolId.SUPERCOIN);
  if (ri >= 1 && ri <= 3) {
    filtered.push(SymbolId.WILD_FG, SymbolId.WILD_FG);
  }
  filtered.push(SymbolId.LONGHORN, SymbolId.LONGHORN);
  // Re-mix after appending so we don't leave a LONGHORN/WILD clump at the tail
  return buildShuffledStrip(
    countAsParts(filtered),
    0xf600 + ri * 17,
    5,
    5,
  );
});

function countAsParts(syms: SymbolId[]): Array<[SymbolId, number]> {
  const map = new Map<SymbolId, number>();
  for (const s of syms) map.set(s, (map.get(s) ?? 0) + 1);
  return [...map.entries()];
}

export const FREE_GAMES_BY_SCATTER: Record<number, number> = {
 3: 8,
 4: 15,
 5: 20,
};

export const RETRIGGER_BY_SCATTER: Record<number, number> = {
 2: 5,
 3: 8,
 4: 15,
 5: 20,
};

export const MATH_VERSION = 'western-stampede-1.3.0';

export function buildPublicConfig(demoOnly = true): MathConfigPublic {
 return {
 version: MATH_VERSION,
 name: 'Western Stampede Standard',
 rtpTarget: 0.95,
 reelHeights: [...BASE_REEL_HEIGHTS],
 stampedeHeights: [...STAMPEDE_REEL_HEIGHTS],
 paytable: DEFAULT_PAYTABLE,
 betSteps: [20, 40, 100, 200, 500, 1000, 2000, 5000],
 minBet: 20,
 maxBet: 5000,
 freeGamesByScatter: Object.fromEntries(
 Object.entries(FREE_GAMES_BY_SCATTER).map(([k, v]) => [String(k), v]),
 ),
 retriggerByScatter: Object.fromEntries(
 Object.entries(RETRIGGER_BY_SCATTER).map(([k, v]) => [String(k), v]),
 ),
 buyOptions: DEFAULT_BUY_OPTIONS,
 maxWinX: 4000,
 demoOnly,
 };
}

export interface InternalMathConfig {
 version: string;
 paytable: PaytableEntry[];
 baseStrips: SymbolId[][];
 fgStrips: SymbolId[][];
 baseHeights: number[];
 stampedeHeights: number[];
 features: FeatureWeights;
 freeGamesByScatter: Record<number, number>;
 retriggerByScatter: Record<number, number>;
 buyOptions: BuyOption[];
 maxWinX: number;
}

export function defaultInternalMath(): InternalMathConfig {
 return {
 version: MATH_VERSION,
 paytable: DEFAULT_PAYTABLE,
 baseStrips: DEFAULT_BASE_STRIPS.map((r) => [...r]),
 fgStrips: DEFAULT_FG_STRIPS.map((r) => [...r]),
 baseHeights: [...BASE_REEL_HEIGHTS],
 stampedeHeights: [...STAMPEDE_REEL_HEIGHTS],
 features: { ...DEFAULT_FEATURE_WEIGHTS },
 freeGamesByScatter: { ...FREE_GAMES_BY_SCATTER },
 retriggerByScatter: { ...RETRIGGER_BY_SCATTER },
 buyOptions: DEFAULT_BUY_OPTIONS.map((b) => ({ ...b })),
 maxWinX: 4000,
 };
}
