import type express from 'express';
import { createHash } from 'node:crypto';
import { env } from './config.js';
import { getStore } from './store/index.js';
import { hashApiKey } from './store/memory-store.js';

export type AdminRole = 'super' | 'operator';

export interface AdminContext {
  role: AdminRole;
  operatorId?: string;
  operatorCode?: string;
}

function shaToken(t: string): string {
  return createHash('sha256').update(t).digest('hex');
}

/**
 * Super-admin: x-admin-token === ADMIN_TOKEN
 * Operator-admin: x-operator-key matches an operator (scoped metrics/history only)
 *
 * Math mutation requires super-admin.
 */
export async function resolveAdmin(
  req: express.Request,
): Promise<AdminContext | null> {
  const adminToken = req.headers['x-admin-token'];
  if (typeof adminToken === 'string' && adminToken === env.adminToken) {
    return { role: 'super' };
  }

  // Optional separate super token for rotation (falls back to ADMIN_TOKEN)
  const superTok = process.env.SUPER_ADMIN_TOKEN;
  if (
    typeof adminToken === 'string' &&
    superTok &&
    shaToken(adminToken) === shaToken(superTok)
  ) {
    return { role: 'super' };
  }

  const opKey = req.headers['x-operator-key'];
  if (typeof opKey === 'string' && opKey) {
    const store = getStore();
    await store.ensureDemoOperator();
    const op = await store.getOperatorByApiKeyHash(hashApiKey(opKey));
    if (op && op.status === 'active') {
      return {
        role: 'operator',
        operatorId: op.id,
        operatorCode: op.code,
      };
    }
  }

  return null;
}

export function requireSuper(ctx: AdminContext | null): boolean {
  return ctx?.role === 'super';
}

export function adminScopeOperatorId(
  ctx: AdminContext,
  requested?: string,
): string | undefined {
  if (ctx.role === 'operator') return ctx.operatorId;
  return requested; // super may filter by query
}
