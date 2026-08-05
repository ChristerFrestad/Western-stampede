import type express from 'express';
import { randomUUID } from 'node:crypto';
import { rateLimitIncr } from './rate-limit-store.js';

/** Attach X-Request-Id for audit correlation. */
export function requestId(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): void {
  const id =
    (typeof req.headers['x-request-id'] === 'string' &&
      req.headers['x-request-id']) ||
    randomUUID();
  (req as express.Request & { requestId: string }).requestId = id;
  res.setHeader('x-request-id', id);
  next();
}

/** Minimal security headers (no external helmet dependency required). */
export function securityHeaders(
  _req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): void {
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('x-frame-options', 'DENY');
  res.setHeader('referrer-policy', 'no-referrer');
  res.setHeader('permissions-policy', 'interest-cohort=()');
  res.setHeader('cache-control', 'no-store');
  next();
}

/**
 * Async rate limiter backed by memory or Redis (via rateLimitIncr).
 */
export function createRateLimiter(opts: {
  windowMs: number;
  max: number;
  keyFn?: (req: express.Request) => string;
  name?: string;
}): express.RequestHandler {
  const headerPrefix = opts.name ? `x-ratelimit-${opts.name}` : 'x-ratelimit';

  return (req, res, next) => {
    const key = `ip:${(opts.keyFn ?? defaultIpKey)(req)}`;
    void rateLimitIncr(key, opts.windowMs)
      .then((count) => {
        res.setHeader(`${headerPrefix}-limit`, String(opts.max));
        res.setHeader(
          `${headerPrefix}-remaining`,
          String(Math.max(0, opts.max - count)),
        );
        if (count > opts.max) {
          res.status(429).json({
            error: 'RATE_LIMITED',
            scope: opts.name ?? 'ip',
          });
          return;
        }
        next();
      })
      .catch(next);
  };
}

function defaultIpKey(req: express.Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/**
 * After auth: limit spins per operator and per player (multi-node safe with Redis).
 */
export function createOperatorSpinLimiter(opts: {
  windowMs: number;
  maxPerOperator: number;
  maxPerPlayer: number;
}): express.RequestHandler {
  return (req, res, next) => {
    const r = req as express.Request & {
      operatorId?: string;
      playerId?: string;
    };
    const opId = r.operatorId ?? 'unknown-op';
    const playerId = r.playerId ?? 'unknown-player';

    void (async () => {
      const opCount = await rateLimitIncr(
        `op:${opId}`,
        opts.windowMs,
      );
      const plCount = await rateLimitIncr(
        `pl:${playerId}`,
        opts.windowMs,
      );

      res.setHeader(
        'x-ratelimit-operator-limit',
        String(opts.maxPerOperator),
      );
      res.setHeader(
        'x-ratelimit-player-limit',
        String(opts.maxPerPlayer),
      );
      res.setHeader(
        'x-ratelimit-operator-remaining',
        String(Math.max(0, opts.maxPerOperator - opCount)),
      );
      res.setHeader(
        'x-ratelimit-player-remaining',
        String(Math.max(0, opts.maxPerPlayer - plCount)),
      );

      if (opCount > opts.maxPerOperator) {
        res.status(429).json({ error: 'RATE_LIMITED', scope: 'operator' });
        return;
      }
      if (plCount > opts.maxPerPlayer) {
        res.status(429).json({ error: 'RATE_LIMITED', scope: 'player' });
        return;
      }
      next();
    })().catch(next);
  };
}
