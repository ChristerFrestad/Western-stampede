import {
  SymbolId,
  type BuyTier,
  type GameMode,
  type SpinFeatures,
  type SpinResult,
  type SupercoinResult,
  type WinDetail,
} from '@ws/shared';
import {
  type InternalMathConfig,
  defaultInternalMath,
} from './config/default-math.js';
import {
  countScatters,
  evaluateWays,
  hasSupercoinOnReel0,
  type WildMultCell,
} from './evaluate-ways.js';
import { mathContentHash } from './math-hash.js';
import type { IRngProvider } from './rng.js';

export interface FreeGameSession {
  remaining: number;
  totalAwarded: number;
  longhornInjected: number;
  stampedeBoost: number;
  buyTier: BuyTier | null;
  sessionBet: number;
}

export interface SpinEngineInput {
  bet: number;
  mode: GameMode;
  freeSession?: FreeGameSession | null;
  buyTier?: BuyTier;
  forceStampede?: boolean;
  forceFreeGames?: number;
}

export interface SpinEngineOutput {
  result: Omit<SpinResult, 'roundId' | 'balance'>;
  nextFreeSession: FreeGameSession | null;
  debitAmount: number;
}

function windowFromStop(
  strip: SymbolId[],
  stop: number,
  height: number,
): SymbolId[] {
  const out: SymbolId[] = [];
  for (let i = 0; i < height; i++) {
    out.push(strip[(stop + i) % strip.length]!);
  }
  return out;
}

export function injectLonghorns(
  strips: SymbolId[][],
  count: number,
): SymbolId[][] {
  if (count <= 0) return strips.map((r) => [...r]);
  const copy = strips.map((r) => [...r]);
  const low = new Set<string>(['9', '10', 'J', 'Q', 'K', 'A']);
  let left = count;
  let guard = 0;
  while (left > 0 && guard < 10_000) {
    guard++;
    const reel = guard % copy.length;
    const strip = copy[reel]!;
    const idx = guard % strip.length;
    if (low.has(strip[idx]!)) {
      strip[idx] = SymbolId.LONGHORN;
      left--;
    } else if (
      strip[idx] !== SymbolId.LONGHORN &&
      strip[idx] !== SymbolId.SCATTER
    ) {
      if (guard % 3 === 0) {
        strip[idx] = SymbolId.LONGHORN;
        left--;
      }
    }
  }
  return copy;
}

function pickWildMult(
  rng: IRngProvider,
  w2: number,
  w3: number,
  cellTag: string,
): number {
  const t = w2 + w3;
  const r = rng.nextInt(t, `wild.mult.${cellTag}`);
  return r < w2 ? 2 : 3;
}

/**
 * Server-authoritative spin engine.
 * Hot path is fully synchronous (RNG + evaluation) for multi-million spin sims.
 */
export class SpinEngine {
  private cachedMathHash: string;

  constructor(
    private math: InternalMathConfig = defaultInternalMath(),
    private rng: IRngProvider,
  ) {
    this.cachedMathHash = mathContentHash(math);
  }

  getMath(): InternalMathConfig {
    return this.math;
  }

  setMath(math: InternalMathConfig): void {
    this.math = math;
    this.cachedMathHash = mathContentHash(math);
  }

  getRng(): IRngProvider {
    return this.rng;
  }

  setRng(rng: IRngProvider): void {
    this.rng = rng;
  }

  /** Preferred: zero Promise overhead. */
  spinSync(input: SpinEngineInput): SpinEngineOutput {
    const { bet } = input;
    let freeSession = input.freeSession ? { ...input.freeSession } : null;
    let debitAmount = 0;
    let buyTier: BuyTier | null = null;
    let buyEntered = false;
    let buyPackageSpins = 0;
    let entrySupercoin: SupercoinResult | null = null;
    let mode: GameMode = 'BASE';

    if (input.buyTier && !freeSession) {
      const opt = this.math.buyOptions.find((b) => b.tier === input.buyTier);
      if (!opt) throw new Error(`Unknown buy tier: ${input.buyTier}`);
      debitAmount = Math.floor(bet * opt.costX);
      buyTier = opt.tier;
      buyEntered = true;
      buyPackageSpins = opt.freeGames;
      freeSession = {
        remaining: opt.freeGames,
        totalAwarded: opt.freeGames,
        longhornInjected: 0,
        stampedeBoost: opt.stampedeWeightBoost,
        buyTier: opt.tier,
        sessionBet: bet,
      };

      if (opt.supercoinOnEntry) {
        const sc = this.rollSupercoin(freeSession);
        freeSession = sc.session;
        entrySupercoin = sc.result;
      }
      mode = 'FREE';
    } else if (freeSession && freeSession.remaining > 0) {
      if (bet !== freeSession.sessionBet) {
        throw new Error('BET_LOCKED');
      }
      mode = 'FREE';
      debitAmount = 0;
    } else {
      debitAmount = bet;
      mode = 'BASE';
      freeSession = null;
    }

    const inFree = mode === 'FREE' && freeSession != null;

    let heights = [...this.math.baseHeights];
    let stampede = false;

    const baseStampede =
      this.math.features.stampedeChance + (freeSession?.stampedeBoost ?? 0);
    const stampedeChance = inFree ? baseStampede * 0.4 : baseStampede;
    if (
      input.forceStampede ||
      this.rollChance(stampedeChance, 'feature.stampede')
    ) {
      stampede = true;
      heights = [...this.math.stampedeHeights];
      mode = 'STAMPEDE';
    }

    let strips = inFree
      ? injectLonghorns(this.math.fgStrips, freeSession!.longhornInjected)
      : this.math.baseStrips.map((r) => [...r]);

    const stops: number[] = [];
    for (let r = 0; r < 5; r++) {
      stops.push(this.rng.nextInt(strips[r]!.length, `reel.stop.${r}`));
    }

    let grid = strips.map((strip, r) =>
      windowFromStop(strip, stops[r]!, heights[r]!),
    );

    if (stampede) {
      grid = ensureFiveOfAKind(grid, SymbolId.LONGHORN);
    }
    if (input.forceFreeGames && input.forceFreeGames >= 3) {
      grid = forceScatters(grid, input.forceFreeGames);
    }

    const wildMults: WildMultCell[] = [];
    for (let r = 0; r < grid.length; r++) {
      for (let row = 0; row < grid[r]!.length; row++) {
        const s = grid[r]![row]!;
        if (s === SymbolId.WILD || s === SymbolId.WILD_FG) {
          wildMults.push({
            reel: r,
            row,
            mult: pickWildMult(
              this.rng,
              this.math.features.wildMult2Weight,
              this.math.features.wildMult3Weight,
              `${r}.${row}`,
            ),
          });
        }
      }
    }

    const payBet = freeSession?.sessionBet ?? bet;
    let wins: WinDetail[] = evaluateWays(
      grid,
      payBet,
      this.math.paytable,
      wildMults,
    );
    let totalWin = wins.reduce((a, w) => a + w.amount, 0);
    const maxWin = Math.floor(payBet * this.math.maxWinX);
    if (totalWin > maxWin) {
      const scale = maxWin / totalWin;
      wins = wins.map((w) => ({ ...w, amount: Math.floor(w.amount * scale) }));
      totalWin = wins.reduce((a, w) => a + w.amount, 0);
    }

    let supercoin: SupercoinResult | null = entrySupercoin;
    if (inFree && freeSession && hasSupercoinOnReel0(grid)) {
      const sc = this.rollSupercoin(freeSession);
      freeSession = sc.session;
      if (supercoin) {
        supercoin = {
          awardedLonghorns:
            supercoin.awardedLonghorns + sc.result.awardedLonghorns,
          totalLonghornsInjected: freeSession.longhornInjected,
          wheelValue: sc.result.wheelValue,
        };
      } else {
        supercoin = sc.result;
      }
    }

    const scatters = countScatters(grid);
    let freeGamesAwarded = 0;
    let enteredFreeGames = false;
    let freeGamesEnded = false;
    let retriggerAwarded = 0;
    let longhornHerd = freeSession?.longhornInjected ?? 0;

    if (inFree && freeSession) {
      freeSession.remaining -= 1;
      longhornHerd = freeSession.longhornInjected;
      const table = this.math.retriggerByScatter;
      if (scatters >= 2 && table[scatters] != null) {
        retriggerAwarded = table[scatters]!;
        freeSession.remaining += retriggerAwarded;
        freeSession.totalAwarded += retriggerAwarded;
        freeGamesAwarded = retriggerAwarded;
      }
      if (freeSession.remaining <= 0) {
        freeGamesEnded = true;
        freeSession = null;
      }
    } else if (!inFree) {
      const table = this.math.freeGamesByScatter;
      if (scatters >= 3 && table[scatters] != null) {
        freeGamesAwarded = table[scatters]!;
        freeSession = {
          remaining: freeGamesAwarded,
          totalAwarded: freeGamesAwarded,
          longhornInjected: 0,
          stampedeBoost: 0,
          buyTier: null,
          sessionBet: bet,
        };
        enteredFreeGames = true;
        longhornHerd = 0;
      }
    }

    let longhornsOnGrid = 0;
    for (const reel of grid) {
      for (const s of reel) {
        if (s === SymbolId.LONGHORN) longhornsOnGrid++;
      }
    }

    const features: SpinFeatures = {
      freeGamesAwarded: buyEntered ? buyPackageSpins : freeGamesAwarded,
      freeGamesRemaining: freeSession?.remaining ?? 0,
      freeGamesTotal: freeSession?.totalAwarded ?? 0,
      stampede,
      supercoin,
      buyTier: buyTier ?? freeSession?.buyTier ?? null,
      enteredFreeGames,
      buyEntered,
      freeGamesEnded,
      sessionBet: freeSession?.sessionBet ?? null,
      longhornHerd,
      longhornsOnGrid,
    };

    void retriggerAwarded;

    const result: Omit<SpinResult, 'roundId' | 'balance'> = {
      mathVersion: this.math.version,
      mathContentHash: this.cachedMathHash,
      mode: stampede ? 'STAMPEDE' : inFree || buyEntered ? 'FREE' : 'BASE',
      bet: payBet,
      grid,
      heights,
      stops,
      wins,
      totalWin,
      features,
      wildMults,
      rngMeta: this.rng.meta(),
    };

    return {
      result,
      nextFreeSession: freeSession,
      debitAmount,
    };
  }

  /** Async wrapper for RGS call sites that prefer Promise. */
  async spin(input: SpinEngineInput): Promise<SpinEngineOutput> {
    return this.spinSync(input);
  }

  private rollSupercoin(
    session: FreeGameSession,
  ): { session: FreeGameSession; result: SupercoinResult } {
    const values = this.math.features.supercoinWheelValues;
    const idx = this.rng.nextInt(values.length, 'feature.supercoin.wheel');
    const wheelValue = values[idx]!;
    const room = Math.max(
      0,
      this.math.features.supercoinCap - session.longhornInjected,
    );
    const awarded = Math.min(wheelValue, room);
    const next = {
      ...session,
      longhornInjected: session.longhornInjected + awarded,
    };
    return {
      session: next,
      result: {
        awardedLonghorns: awarded,
        totalLonghornsInjected: next.longhornInjected,
        wheelValue,
      },
    };
  }

  private rollChance(p: number, purpose = 'feature.chance'): boolean {
    if (p <= 0) return false;
    if (p >= 1) return true;
    const roll = this.rng.nextInt(1_000_000, purpose);
    return roll < Math.floor(p * 1_000_000);
  }
}

function ensureFiveOfAKind(grid: SymbolId[][], symbol: SymbolId): SymbolId[][] {
  return grid.map((reel) => {
    const copy = [...reel];
    copy[Math.floor(copy.length / 2)] = symbol;
    return copy;
  });
}

function forceScatters(grid: SymbolId[][], count: number): SymbolId[][] {
  const copy = grid.map((r) => [...r]);
  let placed = 0;
  for (let r = 0; r < copy.length && placed < count; r++) {
    copy[r]![0] = SymbolId.SCATTER;
    placed++;
  }
  return copy;
}
