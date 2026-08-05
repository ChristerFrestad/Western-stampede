import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type express from 'express';
import {
  createOperatorSpinLimiter,
  createRateLimiter,
} from './middleware.js';

function mockReq(partial: Partial<express.Request> = {}): express.Request {
  return {
    ip: '1.2.3.4',
    socket: { remoteAddress: '1.2.3.4' },
    ...partial,
  } as unknown as express.Request;
}

function mockRes() {
  const headers: Record<string, string> = {};
  let statusCode = 200;
  let body: unknown;
  return {
    setHeader(k: string, v: string) {
      headers[k.toLowerCase()] = v;
    },
    status(c: number) {
      statusCode = c;
      return this;
    },
    json(b: unknown) {
      body = b;
      return this;
    },
    headers,
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    },
  };
}

/** Invoke async middleware and wait until next() or res.json(). */
async function invoke(
  lim: express.RequestHandler,
  req: express.Request,
): Promise<{ nexted: boolean; res: ReturnType<typeof mockRes> }> {
  const res = mockRes();
  let nexted = false;
  await new Promise<void>((resolve) => {
    const origJson = res.json.bind(res);
    res.json = (b: unknown) => {
      origJson(b);
      resolve();
      return res;
    };
    lim(req, res as unknown as express.Response, () => {
      nexted = true;
      resolve();
    });
  });
  return { nexted, res };
}

describe('rate limiters', () => {
  it('limits by IP', async () => {
    const suffix = `ip-test-${Date.now()}-${Math.random()}`;
    const lim = createRateLimiter({
      windowMs: 60_000,
      max: 2,
      keyFn: () => suffix,
    });
    const a = await invoke(lim, mockReq());
    const b = await invoke(lim, mockReq());
    const c = await invoke(lim, mockReq());
    assert.equal(a.nexted, true);
    assert.equal(b.nexted, true);
    assert.equal(c.nexted, false);
    assert.equal(c.res.statusCode, 429);
  });

  it('limits per operator and player after auth', async () => {
    const id = `pl-test-${Date.now()}-${Math.random()}`;
    const lim = createOperatorSpinLimiter({
      windowMs: 60_000,
      maxPerOperator: 100,
      maxPerPlayer: 2,
    });
    const req = mockReq() as express.Request & {
      operatorId: string;
      playerId: string;
    };
    req.operatorId = `op-${id}`;
    req.playerId = `p-${id}`;

    const a = await invoke(lim, req);
    const b = await invoke(lim, req);
    const c = await invoke(lim, req);
    assert.equal(a.nexted, true);
    assert.equal(b.nexted, true);
    assert.equal(c.nexted, false);
    assert.equal(c.res.statusCode, 429);
    assert.equal((c.res.body as { scope: string }).scope, 'player');
  });
});
