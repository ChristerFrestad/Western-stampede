import type { SymbolId } from './symbols.js';

export type GameMode = 'BASE' | 'FREE' | 'BUY' | 'STAMPEDE';

export type BuyTier = 'standard' | 'enhanced' | 'premium';

export interface Money {
 /** Integer credits (demo: 1 credit = 1 unit). */
 amount: number;
 currency: 'DEMO' | 'USD';
}

export interface RngMeta {
 provider: string;
 streamId?: string;
}

export interface PaytableEntry {
 symbol: SymbolId;
 /** Multipliers of total bet for 2/3/4/5 of a kind (index = count). */
 pays: Partial<Record<2 | 3 | 4 | 5, number>>;
}

export interface BuyOption {
 tier: BuyTier;
 /** Cost as multiple of total bet. */
 costX: number;
 freeGames: number;
 supercoinOnEntry: boolean;
 stampedeWeightBoost: number;
}

export interface FeatureWeights {
 /** Probability [0,1] of stampede on a base spin (after other eval). */
 stampedeChance: number;
 /** Weight of wild multiplier 2 vs 3 when wild contributes. */
 wildMult2Weight: number;
 wildMult3Weight: number;
 /** Supercoin chance per free-game spin when SUPERCOIN lands on reel 0. */
 supercoinWheelValues: number[];
 supercoinCap: number;
}

export interface MathConfigPublic {
 version: string;
 name: string;
 rtpTarget: number;
 reelHeights: number[];
 stampedeHeights: number[];
 paytable: PaytableEntry[];
 betSteps: number[];
 minBet: number;
 maxBet: number;
 freeGamesByScatter: Record<string, number>;
 retriggerByScatter: Record<string, number>;
 buyOptions: BuyOption[];
 maxWinX: number;
 demoOnly: boolean;
}

export interface WinCell {
  reel: number;
  row: number;
}

export interface WinDetail {
  symbol: SymbolId;
  count: number;
  ways: number;
  /** Wild multiplier product applied. */
  mult: number;
  /** Win in credits. */
  amount: number;
  /** Cells that participate in at least one paying way (includes wilds). */
  cells?: WinCell[];
}

export interface SupercoinResult {
 awardedLonghorns: number;
 totalLonghornsInjected: number;
 wheelValue: number;
}

export interface SpinFeatures {
 freeGamesAwarded: number;
 freeGamesRemaining: number;
 freeGamesTotal: number;
 stampede: boolean;
 supercoin: SupercoinResult | null;
 buyTier: BuyTier | null;
 /** Natural scatter entry into free games. */
 enteredFreeGames: boolean;
 /** Buy bonus purchased this spin (starts free session). */
 buyEntered: boolean;
 freeGamesEnded: boolean;
 /** Bet locked for the active free-game session (if any). */
 sessionBet: number | null;
 /**
  * Total LONGHORN symbols injected into free-game strips via Supercoin
  * (session cumulative). 0 outside free games.
  */
 longhornHerd: number;
 /** How many LONGHORN symbols are visible on the grid this spin. */
 longhornsOnGrid: number;
}

export interface SpinRequest {
 bet: number;
 clientRoundId: string;
 buyTier?: BuyTier;
}

export interface SpinResult {
 roundId: string;
 mathVersion: string;
 mode: GameMode;
 bet: number;
 /** grid[reel][row] */
 grid: SymbolId[][];
 /** Visible heights used this spin. */
 heights: number[];
 stops: number[];
 wins: WinDetail[];
 totalWin: number;
 balance: number;
 features: SpinFeatures;
 /** Per-wild cell multipliers (reel,row) → mult when applicable. */
 wildMults: Array<{ reel: number; row: number; mult: number }>;
 rngMeta: RngMeta;
}

export interface GameConfigResponse extends MathConfigPublic {
 guestStartBalance: number;
}

export interface GuestAuthResponse {
 token: string;
 playerId: string;
 balance: number;
 displayName: string;
}

export interface WalletResponse {
 balance: number;
 currency: string;
}

export interface TopUpRequest {
 amount: number;
}

export interface TopUpResponse {
 intentId: string;
 status: 'completed' | 'pending';
 balance: number;
 amount: number;
}
