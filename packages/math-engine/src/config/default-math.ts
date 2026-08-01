import {
 BASE_REEL_HEIGHTS,
 STAMPEDE_REEL_HEIGHTS,
 SymbolId,
 type BuyOption,
 type FeatureWeights,
 type MathConfigPublic,
 type PaytableEntry,
} from '@ws/shared';

/**
 * Paytable: multipliers of total bet **per way**.
 * With 3,456 ways, multi-way stacks grow fast — keep per-way values modest.
 * Large headline wins come from multi-way stacks, wild mults, and stampede.
 */
export const DEFAULT_PAYTABLE: PaytableEntry[] = [
 { symbol: SymbolId.LONGHORN, pays: { 3: 0.16, 4: 0.5, 5: 2.0 } },
 { symbol: SymbolId.STAG, pays: { 3: 0.1, 4: 0.32, 5: 1.2 } },
 { symbol: SymbolId.WOLF, pays: { 3: 0.08, 4: 0.25, 5: 1.0 } },
 { symbol: SymbolId.COYOTE, pays: { 3: 0.065, 4: 0.2, 5: 0.85 } },
 { symbol: SymbolId.EAGLE, pays: { 3: 0.055, 4: 0.16, 5: 0.7 } },
 { symbol: SymbolId.A, pays: { 3: 0.032, 4: 0.1, 5: 0.33 } },
 { symbol: SymbolId.K, pays: { 3: 0.028, 4: 0.08, 5: 0.28 } },
 { symbol: SymbolId.Q, pays: { 3: 0.022, 4: 0.065, 5: 0.24 } },
 { symbol: SymbolId.J, pays: { 3: 0.018, 4: 0.055, 5: 0.2 } },
 { symbol: SymbolId.TEN, pays: { 3: 0.014, 4: 0.045, 5: 0.16 } },
 { symbol: SymbolId.NINE, pays: { 3: 0.011, 4: 0.035, 5: 0.14 } },
];

/**
 * Buy costs calibrated so buy RTP ≈ 95% given current free-game EV
 * (see `pnpm math:sim:buy`). Spins match natural 3/4/5 scatter packages.
 */
export const DEFAULT_BUY_OPTIONS: BuyOption[] = [
  {
    tier: 'standard',
    costX: 22,
    freeGames: 8,
    supercoinOnEntry: false,
    stampedeWeightBoost: 0,
  },
  {
    tier: 'enhanced',
    costX: 80,
    freeGames: 15,
    supercoinOnEntry: true,
    stampedeWeightBoost: 0.02,
  },
  {
    tier: 'premium',
    costX: 145,
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
 */
function strip(parts: Array<[SymbolId, number]>): SymbolId[] {
 const out: SymbolId[] = [];
 for (const [sym, n] of parts) {
 for (let i = 0; i < n; i++) out.push(sym);
 }
 return out;
}

const LOW = [
 [SymbolId.NINE, 8],
 [SymbolId.TEN, 8],
 [SymbolId.J, 7],
 [SymbolId.Q, 7],
 [SymbolId.K, 6],
 [SymbolId.A, 6],
] as Array<[SymbolId, number]>;

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

export const DEFAULT_BASE_STRIPS: SymbolId[][] = [
 strip([
 ...PAD_LOW,
 ...HIGH,
 [SymbolId.SCATTER, 1],
 [SymbolId.SUPERCOIN, 1],
 [SymbolId.LONGHORN, 2],
 ]),
 strip([
 ...PAD_LOW,
 ...HIGH,
 [SymbolId.WILD, 2],
 [SymbolId.SCATTER, 1],
 [SymbolId.LONGHORN, 2],
 ]),
 strip([
 ...PAD_LOW,
 ...HIGH,
 [SymbolId.WILD, 2],
 [SymbolId.SCATTER, 1],
 [SymbolId.LONGHORN, 2],
 ]),
 strip([
 ...PAD_LOW,
 ...HIGH,
 [SymbolId.WILD, 2],
 [SymbolId.SCATTER, 1],
 [SymbolId.LONGHORN, 2],
 ]),
 strip([
 ...PAD_LOW,
 ...HIGH,
 [SymbolId.SCATTER, 1],
 [SymbolId.LONGHORN, 2],
 ]),
];

/**
 * Free-game strips — slightly richer wilds/longhorns, fewer scatters than base
 * so retriggers stay exciting but not infinite.
 */
export const DEFAULT_FG_STRIPS: SymbolId[][] = DEFAULT_BASE_STRIPS.map((reel, ri) => {
 const filtered: SymbolId[] = reel.filter(
 (s) => s !== SymbolId.SCATTER && s !== SymbolId.SUPERCOIN,
 );
 // sparse scatters for retrigger
 filtered.push(SymbolId.SCATTER);
 if (ri === 0) filtered.push(SymbolId.SUPERCOIN);
 if (ri >= 1 && ri <= 3) {
 filtered.push(SymbolId.WILD_FG, SymbolId.WILD_FG);
 }
 filtered.push(SymbolId.LONGHORN, SymbolId.LONGHORN);
 return filtered;
});

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

export const MATH_VERSION = 'western-stampede-1.1.0';

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
