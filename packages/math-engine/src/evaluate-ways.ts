import {
 isScatterLike,
 isWild,
 SymbolId,
 type PaytableEntry,
 type WinDetail,
} from '@ws/shared';

export interface WildMultCell {
 reel: number;
 row: number;
 mult: number;
}

/**
 * Left-to-right ways evaluation.
 * Wilds substitute for all pay symbols (not scatters).
 * Wild multipliers on a way are multiplied together.
 * Pays are (paytable × bet × ways × mult), rounded down to integer credits.
 */
export function evaluateWays(
 grid: SymbolId[][],
 bet: number,
 paytable: PaytableEntry[],
 wildMults: WildMultCell[],
): WinDetail[] {
 const payMap = new Map(paytable.map((p) => [p.symbol, p.pays]));
 const multAt = new Map<string, number>();
 for (const w of wildMults) {
 multAt.set(`${w.reel},${w.row}`, w.mult);
 }

 const paySymbols = paytable.map((p) => p.symbol);
 const wins: WinDetail[] = [];

 for (const symbol of paySymbols) {
 const pays = payMap.get(symbol);
 if (!pays) continue;

 // Count matching positions per reel (symbol or wild)
 const reelMatches: number[][] = [];
 for (let r = 0; r < grid.length; r++) {
 const rows: number[] = [];
 for (let row = 0; row < grid[r]!.length; row++) {
 const s = grid[r]![row]!;
 if (s === symbol || isWild(s)) rows.push(row);
 }
 reelMatches.push(rows);
 }

 // Longest left-to-right consecutive reels with ≥1 match
 let count = 0;
 for (let r = 0; r < reelMatches.length; r++) {
 if (reelMatches[r]!.length === 0) break;
 count++;
 }

 if (count < 3) continue;
 const payX = pays[count as 3 | 4 | 5];
 if (payX == null || payX <= 0) continue;

 // Ways = product of match counts on reels 0..count-1
 // But pure-wild ways should not pay as this symbol if no actual symbol —
 // require at least one non-wild of the symbol somewhere on the way path.
 // Simpler industry approach: each combination of positions forms a way;
 // if entire way is only wilds, skip (wilds don't pay alone as longhorn etc).
 const ways = countWaysWithSymbol(reelMatches, count, grid, symbol);
 if (ways <= 0) continue;

 const mult = averageWayMultiplier(reelMatches, count, multAt, grid);
 const amount = Math.floor(bet * payX * ways * mult);
 if (amount <= 0) continue;

 wins.push({
 symbol,
 count,
 ways,
 mult: Math.round(mult * 100) / 100,
 amount,
 });
 }

 return wins;
}

function countWaysWithSymbol(
 reelMatches: number[][],
 count: number,
 grid: SymbolId[][],
 symbol: SymbolId,
): number {
 // DFS count of position paths that include at least one real symbol
 let total = 0;
 function dfs(reel: number, hasSymbol: boolean): void {
 if (reel === count) {
 if (hasSymbol) total++;
 return;
 }
 for (const row of reelMatches[reel]!) {
 const s = grid[reel]![row]!;
 dfs(reel + 1, hasSymbol || s === symbol);
 }
 }
 dfs(0, false);
 return total;
}

function averageWayMultiplier(
 reelMatches: number[][],
 count: number,
 multAt: Map<string, number>,
 grid: SymbolId[][],
): number {
 // Product of wild mults averaged across valid ways that include the pay symbol —
 // use expected product: for each reel, average mult of matching cells.
 let product = 1;
 for (let r = 0; r < count; r++) {
 let sum = 0;
 for (const row of reelMatches[r]!) {
 const s = grid[r]![row]!;
 if (isWild(s)) {
 sum += multAt.get(`${r},${row}`) ?? 1;
 } else {
 sum += 1;
 }
 }
 const n = reelMatches[r]!.length;
 product *= n > 0 ? sum / n : 1;
 }
 return product;
}

export function countScatters(grid: SymbolId[][]): number {
 let n = 0;
 for (const reel of grid) {
 for (const s of reel) {
 if (isScatterLike(s)) n++;
 }
 }
 return n;
}

export function hasSupercoinOnReel0(grid: SymbolId[][]): boolean {
 return grid[0]?.some((s) => s === SymbolId.SUPERCOIN) ?? false;
}
