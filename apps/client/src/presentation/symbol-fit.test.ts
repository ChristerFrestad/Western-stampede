import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { coverFit, containFit, CELL_INNER_W, CELL_INNER_H } from './symbol-fit.js';

describe('symbol-fit cover', () => {
  it('fills inner cell for square texture', () => {
    const f = coverFit(512, 512);
    assert.ok(f.drawW >= CELL_INNER_W - 0.01);
    assert.ok(f.drawH >= CELL_INNER_H - 0.01);
    // uniform
    assert.ok(Math.abs(f.drawW / 512 - f.drawH / 512) < 1e-9);
  });

  it('does not stretch wide texture (cover crops sides)', () => {
    const f = coverFit(800, 400);
    assert.ok(Math.abs(f.scale - CELL_INNER_H / 400) < 1e-9);
    assert.ok(f.drawH >= CELL_INNER_H - 0.01);
    assert.ok(f.drawW >= CELL_INNER_W - 0.01);
  });

  it('does not stretch tall texture (cover crops top/bottom)', () => {
    const f = coverFit(400, 800);
    assert.ok(Math.abs(f.scale - CELL_INNER_W / 400) < 1e-9);
    assert.ok(f.drawW >= CELL_INNER_W - 0.01);
  });

  it('contain never exceeds inner box', () => {
    const f = containFit(800, 400);
    assert.ok(f.drawW <= CELL_INNER_W + 0.01);
    assert.ok(f.drawH <= CELL_INNER_H + 0.01);
  });
});
