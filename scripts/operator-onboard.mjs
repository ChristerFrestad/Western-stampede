#!/usr/bin/env node
/**
 * Operator onboarding CLI — create or rotate operator keys via admin API.
 *
 *   ADMIN_TOKEN=... RGS_URL=http://127.0.0.1:3000 \
 *     pnpm operator:onboard -- --code acme --name "Acme Casino"
 *
 *   pnpm operator:onboard -- --code acme --rotate
 *   pnpm operator:onboard -- --code acme --smoke   # session + spin after create
 */
const base = (process.env.RGS_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const token = process.env.ADMIN_TOKEN ?? '';

function arg(name, fallback = '') {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) {
    return process.argv[i + 1];
  }
  return fallback;
}
function flag(name) {
  return process.argv.includes(`--${name}`);
}

const code = arg('code').trim().toLowerCase();
const name = arg('name', code ? `Operator ${code}` : '');
const walletMode = arg('walletMode', 'demo');
const doRotate = flag('rotate');
const doSmoke = flag('smoke');

if (!token) {
  console.error('ADMIN_TOKEN required');
  process.exit(1);
}
if (!code || !/^[a-z0-9_-]{2,32}$/.test(code)) {
  console.error(
    'Usage: pnpm operator:onboard -- --code <code> [--name "..."] [--walletMode demo|seamless] [--rotate] [--smoke]',
  );
  process.exit(1);
}

async function main() {
  let apiKey;

  if (doRotate) {
    const res = await fetch(
      `${base}/api/v1/admin/operators/${encodeURIComponent(code)}/rotate-key`,
      {
        method: 'POST',
        headers: { 'x-admin-token': token },
      },
    );
    const body = await res.json();
    if (!res.ok) {
      console.error(JSON.stringify(body, null, 2));
      process.exit(1);
    }
    apiKey = body.apiKey;
    console.log(
      JSON.stringify(
        { ok: true, action: 'rotate', code: body.code, id: body.id, apiKey },
        null,
        2,
      ),
    );
  } else {
    const res = await fetch(`${base}/api/v1/admin/operators`, {
      method: 'POST',
      headers: {
        'x-admin-token': token,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ code, name, walletMode }),
    });
    const body = await res.json();
    if (!res.ok) {
      console.error(JSON.stringify(body, null, 2));
      process.exit(1);
    }
    apiKey = body.apiKey;
    console.log(
      JSON.stringify(
        {
          ok: true,
          action: 'create',
          id: body.id,
          code: body.code,
          name: body.name,
          walletMode: body.walletMode,
          apiKey,
          note: body.note,
        },
        null,
        2,
      ),
    );
  }

  if (doSmoke && apiKey) {
    const sess = await fetch(`${base}/api/v1/operators/session`, {
      method: 'POST',
      headers: {
        'x-operator-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        externalRef: `onboard-smoke-${Date.now()}`,
        displayName: 'Onboard Smoke',
        startBalance: 50_000,
      }),
    });
    const sbody = await sess.json();
    if (!sess.ok) {
      console.error('[smoke] session failed', sbody);
      process.exit(1);
    }
    const spin = await fetch(`${base}/api/v1/game/spin`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${sbody.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        bet: 100,
        clientRoundId: `onboard-${Date.now()}`,
      }),
    });
    const sp = await spin.json();
    if (!spin.ok) {
      console.error('[smoke] spin failed', sp);
      process.exit(1);
    }
    console.log(
      JSON.stringify(
        {
          smoke: true,
          playerId: sbody.playerId,
          operatorId: sbody.operatorId,
          balance: sp.balance,
          roundId: sp.roundId,
          mathHash: sp.mathContentHash?.slice?.(0, 16),
        },
        null,
        2,
      ),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
