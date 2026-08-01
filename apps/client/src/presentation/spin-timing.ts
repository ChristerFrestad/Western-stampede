/**
 * Pure spin cadence plan (unit-testable, no Pixi).
 * All reels start together; stop left→right with optional anticipation.
 */

export interface SpinCadencePlan {
  /** All reels start spinning at t=0. */
  simultaneousStart: true;
  /** Min ms all reels spin before first stop. */
  minSimultaneousMs: number;
  /** Stop order (reel indices). */
  stopOrder: number[];
  /** Stop ease duration per reel. */
  stopDurationMs: number[];
  /** Gap after each stop before next stop begins. */
  gapAfterStopMs: number[];
}

export function buildSpinCadence(opts?: {
  anticipationReels?: number[];
  reelCount?: number;
}): SpinCadencePlan {
  const n = opts?.reelCount ?? 5;
  const antic = new Set(opts?.anticipationReels ?? []);
  const stopOrder = Array.from({ length: n }, (_, i) => i);
  const stopDurationMs = stopOrder.map((r) => (antic.has(r) ? 2200 : 700));
  const gapAfterStopMs = stopOrder.map((r) => (antic.has(r) ? 100 : 140));
  return {
    simultaneousStart: true,
    minSimultaneousMs: 550,
    stopOrder,
    stopDurationMs,
    gapAfterStopMs,
  };
}

/** Total wall-clock estimate for a spin animation. */
export function estimateSpinMs(plan: SpinCadencePlan): number {
  let t = plan.minSimultaneousMs;
  for (let i = 0; i < plan.stopOrder.length; i++) {
    t += plan.stopDurationMs[i]! + plan.gapAfterStopMs[i]!;
  }
  return t;
}
