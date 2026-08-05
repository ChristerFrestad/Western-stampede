import { test, expect } from '@playwright/test';

/**
 * API-level free-path coverage (fast, deterministic).
 * Complements UI tests without waiting full Pixi free loops.
 */
test.describe('Buy / free path via RGS API', () => {
  test('E2E-04 buy standard starts free session and drains', async ({
    request,
  }) => {
    const guest = await request.post('http://127.0.0.1:3000/api/v1/auth/guest');
    expect(guest.ok()).toBeTruthy();
    const g = await guest.json();
    const headers = { Authorization: `Bearer ${g.token}` };

    const cfgRes = await request.get('http://127.0.0.1:3000/api/v1/game/config');
    const cfg = await cfgRes.json();
    const standard = cfg.buyOptions.find(
      (o: { tier: string }) => o.tier === 'standard',
    );
    expect(standard.costX).toBe(19);

    const bet = 100;
    const cost = Math.floor(bet * standard.costX);
    const balBefore = g.balance;

    let res = await request.post('http://127.0.0.1:3000/api/v1/game/spin', {
      headers,
      data: {
        bet,
        clientRoundId: `buy-std-${Date.now()}`,
        buyTier: 'standard',
      },
    });
    expect(res.ok()).toBeTruthy();
    let spin = await res.json();
    expect(spin.features.buyEntered).toBeTruthy();
    expect(spin.balance).toBe(balBefore - cost + spin.totalWin);
    expect(spin.features.freeGamesRemaining).toBeGreaterThan(0);

    let guard = 0;
    while (spin.features.freeGamesRemaining > 0 && guard < 80) {
      guard++;
      res = await request.post('http://127.0.0.1:3000/api/v1/game/spin', {
        headers,
        data: {
          bet,
          clientRoundId: `fg-${Date.now()}-${guard}`,
        },
      });
      expect(res.ok()).toBeTruthy();
      spin = await res.json();
      // Session bet locked while free remain; may clear on freeGamesEnded
      if (spin.features.freeGamesRemaining > 0) {
        expect(spin.features.sessionBet).toBe(bet);
      }
    }

    expect(spin.features.freeGamesRemaining).toBe(0);
    expect(spin.mathContentHash).toHaveLength(64);
  });

  test('operator session isolation keys work with demo key', async ({
    request,
  }) => {
    // demo api key default hash is for 'demo-api-key-change-me'
    const res = await request.post(
      'http://127.0.0.1:3000/api/v1/operators/session',
      {
        headers: { 'x-operator-key': 'demo-api-key-change-me' },
        data: {
          externalRef: `ext-${Date.now()}`,
          displayName: 'OpPlayer',
          startBalance: 5000,
        },
      },
    );
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.token).toBeTruthy();
    expect(body.balance).toBe(5000);
    expect(body.operatorCode).toBe('demo');

    const spin = await request.post('http://127.0.0.1:3000/api/v1/game/spin', {
      headers: { Authorization: `Bearer ${body.token}` },
      data: { bet: 100, clientRoundId: `op-spin-${Date.now()}` },
    });
    expect(spin.ok()).toBeTruthy();
    const sj = await spin.json();
    expect(sj.balance).toBe(5000 - 100 + sj.totalWin);
  });
});
