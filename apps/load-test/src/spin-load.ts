/**
 * Concurrent spin load against a running RGS.
 *
 * Usage:
 *   RGS_URL=http://127.0.0.1:3000 pnpm --filter @ws/load-test run -- --spins 500 --concurrency 20
 */
const base = process.env.RGS_URL ?? 'http://127.0.0.1:3000';

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return Number(process.argv[i + 1]);
  return fallback;
}

const totalSpins = arg('spins', 200);
const concurrency = arg('concurrency', 10);

async function guest(): Promise<string> {
  const res = await fetch(`${base}/api/v1/auth/guest`, { method: 'POST' });
  if (!res.ok) throw new Error(`guest ${res.status}`);
  const j = (await res.json()) as { token: string };
  return j.token;
}

async function spin(token: string, i: number): Promise<{ ms: number; ok: boolean }> {
  const t0 = performance.now();
  const res = await fetch(`${base}/api/v1/game/spin`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      bet: 100,
      clientRoundId: `load-${i}-${Math.random().toString(36).slice(2)}`,
    }),
  });
  return { ms: performance.now() - t0, ok: res.ok };
}

async function main() {
  // health
  const h = await fetch(`${base}/health`);
  if (!h.ok) throw new Error('RGS not healthy');

  const tokens: string[] = [];
  for (let i = 0; i < concurrency; i++) {
    tokens.push(await guest());
  }

  const latencies: number[] = [];
  let ok = 0;
  let fail = 0;
  let next = 0;

  const t0 = performance.now();
  await Promise.all(
    tokens.map(async (token) => {
      while (true) {
        const i = next++;
        if (i >= totalSpins) break;
        const r = await spin(token, i);
        latencies.push(r.ms);
        if (r.ok) ok++;
        else fail++;
      }
    }),
  );
  const elapsed = performance.now() - t0;
  latencies.sort((a, b) => a - b);
  const pct = (p: number) =>
    latencies[Math.min(latencies.length - 1, Math.floor(p * latencies.length))]!;

  const successRate = totalSpins > 0 ? ok / totalSpins : 0;
  const p95 = Math.round(pct(0.95));
  // CI gate: zero hard fails preferred; allow tiny flake budget via LOAD_MAX_FAIL
  const maxFail = Number(process.env.LOAD_MAX_FAIL ?? 0);
  const maxP95 = Number(process.env.LOAD_MAX_P95_MS ?? 5_000);
  const pass =
    fail <= maxFail &&
    successRate >= 0.99 &&
    (latencies.length === 0 || p95 <= maxP95);

  const report = {
    base,
    totalSpins,
    concurrency,
    ok,
    fail,
    elapsedMs: Math.round(elapsed),
    spinsPerSec: Math.round((ok / elapsed) * 1000),
    latencyMs: {
      p50: Math.round(pct(0.5)),
      p95,
      p99: Math.round(pct(0.99)),
      max: Math.round(latencies[latencies.length - 1] ?? 0),
    },
    gate: {
      successRate,
      maxFail,
      maxP95,
      pass,
    },
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.gate.pass) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
