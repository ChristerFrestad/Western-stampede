import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SymbolId } from '@ws/shared';
import { countScatters, evaluateWays } from './evaluate-ways.js';
import { DEFAULT_PAYTABLE } from './config/default-math.js';

describe('evaluateWays', () => {
 it('pays 5 LONGHORN across ways', () => {
 const grid: SymbolId[][] = [
 [SymbolId.LONGHORN, SymbolId.NINE, SymbolId.TEN, SymbolId.J],
 [SymbolId.LONGHORN, SymbolId.NINE, SymbolId.TEN, SymbolId.J, SymbolId.Q, SymbolId.K],
 [SymbolId.LONGHORN, SymbolId.NINE, SymbolId.TEN, SymbolId.J, SymbolId.Q, SymbolId.K],
 [SymbolId.LONGHORN, SymbolId.NINE, SymbolId.TEN, SymbolId.J, SymbolId.Q, SymbolId.K],
 [SymbolId.LONGHORN, SymbolId.NINE, SymbolId.TEN, SymbolId.J],
 ];
 const wins = evaluateWays(grid, 100, DEFAULT_PAYTABLE, []);
 const buf = wins.find((w) => w.symbol === SymbolId.LONGHORN);
 assert.ok(buf);
 assert.equal(buf!.count, 5);
 assert.equal(buf!.ways, 1);
 assert.equal(buf!.amount, Math.floor(100 * 2.667 * 1));
 assert.ok(buf!.cells && buf!.cells.length >= 5);
 });

 it('wild substitutes and multiplies', () => {
 const grid: SymbolId[][] = [
 [SymbolId.LONGHORN, SymbolId.NINE, SymbolId.TEN, SymbolId.J],
 [SymbolId.WILD, SymbolId.NINE, SymbolId.TEN, SymbolId.J, SymbolId.Q, SymbolId.K],
 [SymbolId.LONGHORN, SymbolId.NINE, SymbolId.TEN, SymbolId.J, SymbolId.Q, SymbolId.K],
 [SymbolId.NINE, SymbolId.TEN, SymbolId.J, SymbolId.Q, SymbolId.K, SymbolId.A],
 [SymbolId.NINE, SymbolId.TEN, SymbolId.J, SymbolId.Q],
 ];
 const wins = evaluateWays(grid, 100, DEFAULT_PAYTABLE, [
 { reel: 1, row: 0, mult: 3 },
 ]);
 const buf = wins.find((w) => w.symbol === SymbolId.LONGHORN);
 assert.ok(buf);
 assert.equal(buf!.count, 3);
 assert.ok(buf!.amount > 0);
 assert.ok(buf!.cells?.some((c) => c.reel === 1 && c.row === 0));
 });

 it('counts scatters', () => {
 const grid: SymbolId[][] = [
 [SymbolId.SCATTER, SymbolId.NINE, SymbolId.TEN, SymbolId.J],
 [SymbolId.SCATTER, SymbolId.NINE, SymbolId.TEN, SymbolId.J, SymbolId.Q, SymbolId.K],
 [SymbolId.SUPERCOIN, SymbolId.NINE, SymbolId.TEN, SymbolId.J, SymbolId.Q, SymbolId.K],
 [SymbolId.NINE, SymbolId.TEN, SymbolId.J, SymbolId.Q, SymbolId.K, SymbolId.A],
 [SymbolId.NINE, SymbolId.TEN, SymbolId.J, SymbolId.Q],
 ];
 assert.equal(countScatters(grid), 3);
 });
});
