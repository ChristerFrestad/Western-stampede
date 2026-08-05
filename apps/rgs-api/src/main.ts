import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import { buildOpenApiDocument, spinRequestSchema } from '@ws/game-protocol';
import { env } from './config.js';
import { gameService } from './game-service.js';
import {
  createOperatorSpinLimiter,
  createRateLimiter,
  requestId,
  securityHeaders,
} from './middleware.js';
import { initRateLimitStore, getRateLimitStore } from './rate-limit-store.js';
import { buildOpsSnapshot, buildPublicVersion } from './ops-status.js';
import {
  getStore,
  setStore,
  MemoryStore,
  hashApiKey,
} from './store/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
/** Client public admin console (monorepo path; Docker copies to rgs-api/public). */
const adminHtmlCandidates = [
  resolve(__dirname, '../public/admin.html'), // dist/ → ../public (Docker + local)
  resolve(__dirname, '../../client/public/admin.html'), // src/ or dist/ → apps/client
  resolve(__dirname, '../../../apps/client/public/admin.html'),
  resolve(process.cwd(), 'public/admin.html'),
  resolve(process.cwd(), '../client/public/admin.html'),
];

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(requestId);
app.use(securityHeaders);
app.use(
  cors({
    origin: env.corsOrigin === '*' ? true : env.corsOrigin.split(','),
  }),
);
app.use(express.json({ limit: '32kb' }));
app.use(
  createRateLimiter({
    windowMs: 60_000,
    max: env.realMoney ? 120 : 600,
  }),
);

async function auth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'UNAUTHORIZED' });
    return;
  }
  const token = header.slice(7);
  try {
    const session = await getStore().getSession(token);
    if (!session) {
      res.status(401).json({ error: 'UNAUTHORIZED' });
      return;
    }
    const r = req as express.Request & {
      playerId: string;
      operatorId: string;
    };
    r.playerId = session.playerId;
    r.operatorId = session.operatorId;
    next();
  } catch (e) {
    next(e);
  }
}

async function admin(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  try {
    const { resolveAdmin } = await import('./admin-auth.js');
    const ctx = await resolveAdmin(req);
    if (!ctx) {
      res.status(403).json({ error: 'FORBIDDEN' });
      return;
    }
    (req as express.Request & { admin: typeof ctx }).admin = ctx;
    next();
  } catch (e) {
    next(e);
  }
}

function requireSuperAdmin(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  const adminCtx = (req as express.Request & { admin?: { role: string } })
    .admin;
  if (!adminCtx || adminCtx.role !== 'super') {
    res.status(403).json({ error: 'SUPER_ADMIN_REQUIRED' });
    return;
  }
  next();
}

const bootStartedMs = Date.now();

app.get('/health', (_req, res) => {
  const rng = gameService.rngHealth();
  const store = getStore();
  res.json({
    ok: rng.status !== 'failed',
    service: 'western-stampede-rgs',
    preset: env.preset,
    demoOnly: !env.realMoney,
    complianceMode: env.complianceMode,
    store: store.kind,
    rateLimit: getRateLimitStore().backend,
    guestStartBalance: env.guestStartBalance,
    rng: {
      status: rng.status,
      algorithm: rng.algorithm,
      buildId: rng.buildId,
      failClosed: rng.failClosed,
      totalDraws: rng.totalDraws,
    },
  });
});

app.get('/ready', async (_req, res) => {
  const rng = gameService.rngHealth();
  const store = getStore();
  let storeOk = true;
  try {
    storeOk = await store.ready();
  } catch {
    storeOk = false;
  }
  if (
    (env.realMoney || env.complianceMode) &&
    store.kind !== 'postgres'
  ) {
    storeOk = false;
  }
  const ready = !rng.failClosed && rng.status !== 'failed' && storeOk;
  res.status(ready ? 200 : 503).json({
    ready,
    rngStatus: rng.status,
    storeOk,
    store: store.kind,
    rateLimit: getRateLimitStore().backend,
  });
});

/** Public build/version pins (no secrets). */
app.get('/version', (_req, res) => {
  res.json(buildPublicVersion(process.env.npm_package_version ?? '1.0.0'));
});

/** Ops console HTML (super-admin token entered in browser; not a secret page). */
app.get(['/admin', '/admin.html'], (_req, res) => {
  for (const p of adminHtmlCandidates) {
    if (existsSync(p)) {
      res.type('html').sendFile(p);
      return;
    }
  }
  res.status(404).type('text').send(
    'admin.html not found in image — open client /admin.html or rebuild with client public assets',
  );
});

app.get('/openapi.json', (_req, res) => {
  res.json(buildOpenApiDocument(`http://localhost:${env.port}`));
});

app.post('/api/v1/auth/guest', async (_req, res) => {
  try {
    const store = getStore();
    await store.ensureDemoOperator();
    const { player, token } = await store.createGuest(env.guestStartBalance);
    res.json({
      token,
      playerId: player.id,
      operatorId: player.operatorId,
      balance: player.balance,
      displayName: player.displayName,
    });
  } catch (e) {
    res.status(500).json({
      error: e instanceof Error ? e.message : 'AUTH_FAILED',
    });
  }
});

/**
 * Operator launch (B2B): authenticate with X-Operator-Key, open player session.
 * Body: { externalRef, displayName?, startBalance? }
 */
app.post('/api/v1/operators/session', async (req, res) => {
  const apiKey = req.headers['x-operator-key'];
  if (typeof apiKey !== 'string' || !apiKey) {
    res.status(401).json({ error: 'OPERATOR_KEY_REQUIRED' });
    return;
  }
  const externalRef = String(
    (req.body as { externalRef?: string }).externalRef ?? '',
  ).trim();
  if (!externalRef || externalRef.length > 128) {
    res.status(400).json({ error: 'INVALID_EXTERNAL_REF' });
    return;
  }
  try {
    const store = getStore();
    await store.ensureDemoOperator();
    const op = await store.getOperatorByApiKeyHash(hashApiKey(apiKey));
    if (!op) {
      res.status(403).json({ error: 'OPERATOR_FORBIDDEN' });
      return;
    }
    const displayName = (req.body as { displayName?: string }).displayName;
    const startBalance = Number(
      (req.body as { startBalance?: number }).startBalance,
    );
    const { player, token } = await store.createOperatorSession({
      operatorId: op.id,
      externalRef,
      displayName,
      startBalance: Number.isFinite(startBalance) ? startBalance : undefined,
    });
    res.json({
      token,
      playerId: player.id,
      operatorId: player.operatorId,
      operatorCode: op.code,
      balance: player.balance,
      displayName: player.displayName,
    });
  } catch (e) {
    res.status(500).json({
      error: e instanceof Error ? e.message : 'OPERATOR_SESSION_FAILED',
    });
  }
});

app.get('/api/v1/game/config', (_req, res) => {
  res.json(gameService.getPublicConfig());
});

const spinLimiter = createOperatorSpinLimiter({
  windowMs: 60_000,
  maxPerOperator: env.realMoney ? 3_000 : 12_000,
  maxPerPlayer: env.realMoney ? 120 : 600,
});

app.post('/api/v1/game/spin', auth, spinLimiter, async (req, res) => {
  const parsed = spinRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: 'INVALID_BODY', details: parsed.error.flatten() });
    return;
  }
  const playerId = (req as express.Request & { playerId: string }).playerId;
  const requestIdHdr = (req as express.Request & { requestId?: string })
    .requestId;
  try {
    const result = await gameService.spin(playerId, parsed.data);
    if (requestIdHdr) res.setHeader('x-request-id', requestIdHdr);
    res.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'SPIN_FAILED';
    const status =
      msg === 'INSUFFICIENT_FUNDS'
        ? 402
        : msg === 'RATE_LIMITED'
          ? 429
          : msg === 'RNG_UNAVAILABLE' ||
              msg === 'SIM_RNG_FORBIDDEN_IN_PRODUCTION'
            ? 503
            : msg === 'INVALID_BET' ||
                msg === 'INVALID_BUY_TIER' ||
                msg === 'FREE_GAMES_ACTIVE' ||
                msg === 'BET_LOCKED'
              ? 400
              : 500;
    res.status(status).json({ error: msg });
  }
});

app.get('/api/v1/wallet', auth, async (req, res) => {
  const playerId = (req as express.Request & { playerId: string }).playerId;
  const p = await getStore().getPlayer(playerId);
  if (!p) {
    res.status(404).json({ error: 'PLAYER_NOT_FOUND' });
    return;
  }
  res.json({ balance: p.balance, currency: 'DEMO' });
});

app.post('/api/v1/wallet/topup', auth, async (req, res) => {
  const amount = Number((req.body as { amount?: number }).amount);
  if (!Number.isInteger(amount) || amount <= 0 || amount > 1_000_000) {
    res.status(400).json({ error: 'INVALID_BODY' });
    return;
  }
  const playerId = (req as express.Request & { playerId: string }).playerId;
  const store = getStore();
  const intentId = randomUUID();

  const player = await store.getPlayer(playerId);
  if (!player) {
    res.status(404).json({ error: 'PLAYER_NOT_FOUND' });
    return;
  }

  if (env.topupMode === 'demo') {
    await store.credit(playerId, amount, `topup:${intentId}`);
    const p = await store.getPlayer(playerId);
    await store.saveTopUp({
      id: intentId,
      operatorId: player.operatorId,
      playerId,
      amount,
      status: 'completed',
      createdAt: new Date().toISOString(),
    });
    res.json({
      intentId,
      status: 'completed' as const,
      balance: p!.balance,
      amount,
    });
    return;
  }

  await store.saveTopUp({
    id: intentId,
    operatorId: player.operatorId,
    playerId,
    amount,
    status: 'pending',
    createdAt: new Date().toISOString(),
  });
  const p = await store.getPlayer(playerId);
  res.json({
    intentId,
    status: 'pending' as const,
    balance: p!.balance,
    amount,
  });
});

app.get('/api/v1/rounds/:id', auth, async (req, res) => {
  const playerId = (req as express.Request & { playerId: string }).playerId;
  const operatorId = (req as express.Request & { operatorId: string })
    .operatorId;
  const id = String(req.params.id);
  const store = getStore();
  // Tenant isolation: operator-scoped lookup
  const round =
    (await store.getRoundForOperator(operatorId, id)) ??
    (await store.getRound(id));
  if (!round || round.playerId !== playerId || round.operatorId !== operatorId) {
    res.status(404).json({ error: 'NOT_FOUND' });
    return;
  }
  res.json(round.result);
});

app.get('/api/v1/history', auth, async (req, res) => {
  const playerId = (req as express.Request & { playerId: string }).playerId;
  const limit = Math.min(Number(req.query.limit ?? 20), 100);
  const rounds = await getStore().listRounds(playerId, limit);
  res.json({
    rounds: rounds.map((r) => ({
      roundId: r.id,
      createdAt: r.createdAt,
      debit: r.debit,
      totalWin: r.result.totalWin,
      mode: r.result.mode,
    })),
  });
});

app.get('/api/v1/admin/math', admin, requireSuperAdmin, (_req, res) => {
  res.json(gameService.getMath());
});

app.put(
  '/api/v1/admin/math/features',
  admin,
  requireSuperAdmin,
  (req, res) => {
    try {
      const body = req.body as Record<string, number>;
      const math = gameService.getMath();
      gameService.updateMath({
        features: {
          ...math.features,
          ...body,
        },
      });
      res.json({ ok: true, features: gameService.getMath().features });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'UPDATE_FAILED';
      res
        .status(msg === 'MATH_MUTATION_FORBIDDEN' ? 403 : 500)
        .json({ error: msg });
    }
  },
);

app.post(
  '/api/v1/admin/players/:id/balance',
  admin,
  requireSuperAdmin,
  async (req, res) => {
    const amount = Number((req.body as { amount?: number }).amount);
    if (!Number.isFinite(amount)) {
      res.status(400).json({ error: 'INVALID_AMOUNT' });
      return;
    }
    const playerId = String(req.params.id);
    const store = getStore();
    const p = await store.getPlayer(playerId);
    if (!p) {
      res.status(404).json({ error: 'PLAYER_NOT_FOUND' });
      return;
    }
    if (amount >= 0) await store.credit(p.id, amount, 'admin-adjust');
    else await store.debit(p.id, Math.abs(amount), 'admin-adjust');
    gameService.audit.append({
      type: 'admin.balance',
      payload: { playerId, amount },
    });
    const updated = await store.getPlayer(p.id);
    res.json({ balance: updated!.balance });
  },
);

app.get('/api/v1/admin/metrics', admin, async (req, res) => {
  const adminCtx = (req as express.Request & {
    admin: { role: string; operatorId?: string; operatorCode?: string };
  }).admin;
  const store = getStore();
  const scopeOp =
    adminCtx.role === 'operator'
      ? adminCtx.operatorId
      : typeof req.query.operatorId === 'string'
        ? req.query.operatorId
        : undefined;
  const m = await store.metrics(scopeOp);
  const { getWalletBridge } = await import('./wallet-bridge.js');
  const wb = getWalletBridge();
  const outboxStats = await Promise.resolve(wb.outbox.stats());
  const { telemetrySnapshot } = await import('./telemetry.js');
  const rl = getRateLimitStore();
  res.json({
    ...m,
    store: store.kind,
    adminRole: adminCtx.role,
    operatorCode: adminCtx.operatorCode ?? null,
    operatorScope: scopeOp ?? null,
    empiricalRtp: m.wagered > 0 ? m.won / m.wagered : null,
    rateLimitBackend: adminCtx.role === 'super' ? rl.backend : undefined,
    auditEvents:
      adminCtx.role === 'super' ? gameService.audit.length : undefined,
    auditTip: adminCtx.role === 'super' ? gameService.audit.tip : undefined,
    auditOk: adminCtx.role === 'super' ? gameService.audit.verify().ok : undefined,
    telemetry:
      adminCtx.role === 'super' ? telemetrySnapshot() : undefined,
    wallet:
      adminCtx.role === 'super'
        ? {
            mode: wb.mode,
            circuit: wb.circuit.getStatus(),
            outbox: outboxStats,
            outboxBackend: wb.outboxBackend,
          }
        : undefined,
  });
});

/**
 * Super-admin: onboard operator (returns raw apiKey once).
 * Body: { code, name, walletMode?: 'demo'|'seamless' }
 */
app.post('/api/v1/admin/operators', admin, requireSuperAdmin, async (req, res) => {
  const code = String((req.body as { code?: string }).code ?? '')
    .trim()
    .toLowerCase();
  const name = String((req.body as { name?: string }).name ?? '').trim();
  const walletMode = (req.body as { walletMode?: string }).walletMode;
  if (!/^[a-z0-9_-]{2,32}$/.test(code)) {
    res.status(400).json({ error: 'INVALID_CODE' });
    return;
  }
  if (!name || name.length > 128) {
    res.status(400).json({ error: 'INVALID_NAME' });
    return;
  }
  const mode =
    walletMode === 'seamless' || walletMode === 'demo' ? walletMode : 'demo';
  const rawKey = `ws_${code}_${randomUUID().replace(/-/g, '')}`;
  try {
    const store = getStore();
    const op = await store.createOperator({
      code,
      name,
      apiKeyHash: hashApiKey(rawKey),
      walletMode: mode,
    });
    gameService.audit.append({
      type: 'admin.operator.create',
      payload: { operatorId: op.id, code: op.code },
    });
    res.status(201).json({
      id: op.id,
      code: op.code,
      name: op.name,
      walletMode: op.walletMode,
      status: op.status,
      apiKey: rawKey,
      note: 'Store apiKey securely — it is not retrievable again',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'CREATE_FAILED';
    res
      .status(msg === 'OPERATOR_CODE_EXISTS' ? 409 : 500)
      .json({ error: msg });
  }
});

/**
 * Super-admin: rotate operator API key (returns new raw key once).
 */
app.post(
  '/api/v1/admin/operators/:code/rotate-key',
  admin,
  requireSuperAdmin,
  async (req, res) => {
    const code = String(req.params.code).trim().toLowerCase();
    const rawKey = `ws_${code}_${randomUUID().replace(/-/g, '')}`;
    try {
      const op = await getStore().rotateOperatorApiKey(code, hashApiKey(rawKey));
      gameService.audit.append({
        type: 'admin.operator.rotate_key',
        payload: { operatorId: op.id, code: op.code },
      });
      res.json({
        id: op.id,
        code: op.code,
        apiKey: rawKey,
        note: 'Previous key is invalid immediately. Store apiKey securely.',
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'ROTATE_FAILED';
      res
        .status(msg === 'OPERATOR_NOT_FOUND' ? 404 : 500)
        .json({ error: msg });
    }
  },
);

/**
 * Super-admin ops dashboard snapshot:
 * ready, rng, store, rate-limit backend, OTLP, deploy warnings.
 */
app.get('/api/v1/admin/ops', admin, requireSuperAdmin, async (_req, res) => {
  const { otlpStats } = await import('./otlp-export.js');
  const snap = await buildOpsSnapshot({
    rng: gameService.rngHealth(),
    store: getStore(),
    rateLimit: getRateLimitStore(),
    otlp: otlpStats(),
    uptimeSec: (Date.now() - bootStartedMs) / 1000,
    packageVersion: process.env.npm_package_version ?? '1.0.0',
  });
  res.status(snap.ready ? 200 : 503).json(snap);
});

/** Super-admin: OTLP/telemetry export snapshot (ring + exporter stats). */
app.get('/api/v1/admin/telemetry/export', admin, requireSuperAdmin, async (_req, res) => {
  const { telemetrySnapshot, getRecentSpans } = await import('./telemetry.js');
  const { flushOtlp, buildOtlpPayload, otlpEnabled, otlpStats } = await import(
    './otlp-export.js'
  );
  await flushOtlp();
  const snap = telemetrySnapshot();
  const recent = getRecentSpans(20);
  res.json({
    otlpEnabled: otlpEnabled(),
    otlp: otlpStats(),
    spins: snap.spins,
    spinErrors: snap.spinErrors,
    successRate: snap.successRate,
    latencyMs: snap.latencyMs,
    recentSpans: snap.recentSpans,
    sampleOtlpPayload: buildOtlpPayload(recent),
  });
});

/** Super-admin: force OTLP flush (best-effort remote export). */
app.post('/api/v1/admin/telemetry/flush', admin, requireSuperAdmin, async (_req, res) => {
  const { flushOtlp, otlpStats } = await import('./otlp-export.js');
  await flushOtlp();
  res.json({ ok: true, otlp: otlpStats() });
});

app.post(
  '/api/v1/admin/wallet/outbox/drain',
  admin,
  requireSuperAdmin,
  async (_req, res) => {
    const { processWalletOutbox, getWalletBridge } = await import(
      './wallet-bridge.js'
    );
    const result = await processWalletOutbox();
    const stats = await Promise.resolve(getWalletBridge().outbox.stats());
    res.json({
      ...result,
      outbox: stats,
      outboxBackend: getWalletBridge().outboxBackend,
    });
  },
);

async function boot() {
  if (env.requireDurableStore && !env.databaseUrl) {
    console.error(
      '[rgs] REQUIRE_DURABLE_STORE/REAL_MONEY requires DATABASE_URL',
    );
    process.exit(1);
  }

  // Rate limit: memory default; Redis when REDIS_URL is set (multi-node)
  const rl = await initRateLimitStore();
  console.log(`[rgs] rate-limit store: ${rl.backend}`);

  if (env.databaseUrl) {
    const { PostgresStore } = await import('./store/postgres-store.js');
    const pgStore = await PostgresStore.connect(env.databaseUrl);
    await pgStore.ensureDemoOperator();
    setStore(pgStore);
    const { initWalletOutbox } = await import('./wallet-bridge.js');
    await initWalletOutbox();
    console.log('[rgs] durable store: postgres (atomic spin TX + multi-tenant)');
  } else {
    if (env.realMoney || env.complianceMode) {
      console.error(
        '[rgs] COMPLIANCE_MODE/REAL_MONEY forbids MemoryStore — set DATABASE_URL',
      );
      process.exit(1);
    }
    const mem = new MemoryStore();
    await mem.ensureDemoOperator();
    setStore(mem);
    console.log('[rgs] store: memory (demo only, multi-tenant ready)');
  }

  const { otlpEnabled, otlpStats } = await import('./otlp-export.js');
  if (otlpEnabled()) {
    console.log('[rgs] OTLP export enabled', otlpStats());
  }

  app.listen(env.port, () => {
    console.log(
      `[western-stampede-rgs] listening on :${env.port} demoOnly=${!env.realMoney} rng=${env.rngProvider} compliance=${env.complianceMode} store=${getStore().kind} rateLimit=${getRateLimitStore().backend}`,
    );
  });
}

boot().catch((err) => {
  console.error('[rgs] boot failed', err);
  process.exit(1);
});
