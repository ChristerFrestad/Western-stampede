/**
 * Ops / deploy status snapshot (admin + public version surface).
 */
import { PROTOCOL_VERSION } from '@ws/game-protocol';
import { MATH_VERSION } from '@ws/math-engine';
import { env } from './config.js';
import type { RateLimitStore } from './rate-limit-store.js';
import type { IStore } from './store/index.js';

export interface RngHealthLike {
  status: string;
  algorithm?: string;
  buildId?: string;
  failClosed: boolean;
  totalDraws?: number;
}

export interface OpsInput {
  rng: RngHealthLike;
  store: IStore;
  rateLimit: RateLimitStore;
  otlp: {
    enabled: boolean;
    endpoint: string | null;
    serviceName: string;
    queued: number;
    exportCount: number;
    exportErrors: number;
  };
  uptimeSec: number;
  packageVersion?: string;
}

export function buildPublicVersion(packageVersion = '1.0.0') {
  return {
    service: 'western-stampede-rgs',
    version: packageVersion,
    protocolVersion: PROTOCOL_VERSION,
    mathVersion: MATH_VERSION,
    node: process.version,
    demoOnly: !env.realMoney,
    complianceMode: env.complianceMode,
  };
}

export async function buildOpsSnapshot(input: OpsInput) {
  let storeOk = true;
  try {
    storeOk = await input.store.ready();
  } catch {
    storeOk = false;
  }

  const durableRequired = env.realMoney || env.complianceMode;
  const durableOk = !durableRequired || input.store.kind === 'postgres';
  const rngOk =
    !input.rng.failClosed && input.rng.status !== 'failed';

  const warnings: string[] = [];
  if (env.adminToken === 'dev-admin-token') {
    warnings.push('ADMIN_TOKEN is default dev-admin-token');
  }
  if (env.jwtSecret === 'dev-secret') {
    warnings.push('JWT_SECRET is default dev-secret');
  }
  if (env.corsOrigin === '*' && env.realMoney) {
    warnings.push('CORS_ORIGIN=* with REAL_MONEY=true');
  }
  if (durableRequired && input.store.kind !== 'postgres') {
    warnings.push('REAL_MONEY/COMPLIANCE requires Postgres store');
  }
  if (input.rateLimit.backend === 'memory' && process.env.REDIS_URL) {
    warnings.push('REDIS_URL set but rate-limit backend is memory (redis down?)');
  }

  const ready = rngOk && storeOk && durableOk;

  return {
    ready,
    uptimeSec: Math.round(input.uptimeSec),
    service: 'western-stampede-rgs',
    preset: env.preset,
    guestStartBalance: env.guestStartBalance,
    flags: {
      realMoney: env.realMoney,
      complianceMode: env.complianceMode,
      demoOnly: !env.realMoney,
      requireDurableStore: env.requireDurableStore,
    },
    rng: {
      status: input.rng.status,
      algorithm: input.rng.algorithm,
      buildId: input.rng.buildId,
      failClosed: input.rng.failClosed,
      totalDraws: input.rng.totalDraws ?? 0,
      ok: rngOk,
    },
    store: {
      kind: input.store.kind,
      ok: storeOk,
      durableOk,
    },
    rateLimit: {
      backend: input.rateLimit.backend,
    },
    otlp: input.otlp,
    versions: buildPublicVersion(input.packageVersion),
    warnings,
  };
}
