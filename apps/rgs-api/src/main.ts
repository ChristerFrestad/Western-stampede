import { randomUUID } from 'node:crypto';
import cors from 'cors';
import express from 'express';
import { z } from 'zod';
import { env } from './config.js';
import { gameService } from './game-service.js';
import { store } from './store.js';

const app = express();
app.use(
 cors({
 origin: env.corsOrigin === '*' ? true : env.corsOrigin.split(','),
 }),
);
app.use(express.json());

function auth(req: express.Request, res: express.Response, next: express.NextFunction) {
 const header = req.headers.authorization;
 if (!header?.startsWith('Bearer ')) {
 res.status(401).json({ error: 'UNAUTHORIZED' });
 return;
 }
 const token = header.slice(7);
 const session = store.getSession(token);
 if (!session) {
 res.status(401).json({ error: 'UNAUTHORIZED' });
 return;
 }
 (req as express.Request & { playerId: string }).playerId = session.playerId;
 next();
}

function admin(req: express.Request, res: express.Response, next: express.NextFunction) {
 const token = req.headers['x-admin-token'];
 if (token !== env.adminToken) {
 res.status(403).json({ error: 'FORBIDDEN' });
 return;
 }
 next();
}

app.get('/health', (_req, res) => {
 res.json({ ok: true, service: 'western-stampede-rgs', demoOnly: !env.realMoney });
});

app.get('/ready', (_req, res) => {
 res.json({ ready: true });
});

app.post('/api/v1/auth/guest', (_req, res) => {
 const { player, token } = store.createGuest(env.guestStartBalance);
 res.json({
 token,
 playerId: player.id,
 balance: player.balance,
 displayName: player.displayName,
 });
});

app.get('/api/v1/game/config', (_req, res) => {
 res.json(gameService.getPublicConfig());
});

const spinSchema = z.object({
 bet: z.number().int().positive(),
 clientRoundId: z.string().min(1).max(128),
 buyTier: z.enum(['standard', 'enhanced', 'premium']).optional(),
});

app.post('/api/v1/game/spin', auth, async (req, res) => {
 const parsed = spinSchema.safeParse(req.body);
 if (!parsed.success) {
 res.status(400).json({ error: 'INVALID_BODY', details: parsed.error.flatten() });
 return;
 }
 const playerId = (req as express.Request & { playerId: string }).playerId;
 try {
 const result = await gameService.spin(playerId, parsed.data);
 res.json(result);
 } catch (e) {
 const msg = e instanceof Error ? e.message : 'SPIN_FAILED';
 const status =
 msg === 'INSUFFICIENT_FUNDS'
 ? 402
 : msg === 'INVALID_BET' ||
 msg === 'INVALID_BUY_TIER' ||
 msg === 'FREE_GAMES_ACTIVE' ||
 msg === 'BET_LOCKED'
 ? 400
 : 500;
 res.status(status).json({ error: msg });
 }
});

app.get('/api/v1/wallet', auth, (req, res) => {
 const playerId = (req as express.Request & { playerId: string }).playerId;
 const p = store.getPlayer(playerId);
 if (!p) {
 res.status(404).json({ error: 'PLAYER_NOT_FOUND' });
 return;
 }
 res.json({ balance: p.balance, currency: 'DEMO' });
});

const topupSchema = z.object({
 amount: z.number().int().positive().max(1_000_000),
});

app.post('/api/v1/wallet/topup', auth, (req, res) => {
 const parsed = topupSchema.safeParse(req.body);
 if (!parsed.success) {
 res.status(400).json({ error: 'INVALID_BODY' });
 return;
 }
 const playerId = (req as express.Request & { playerId: string }).playerId;
 const amount = parsed.data.amount;

 if (env.topupMode === 'demo') {
 const intentId = randomUUID();
 store.credit(playerId, amount, `topup:${intentId}`);
 const p = store.getPlayer(playerId)!;
 store.topUps.set(intentId, {
 id: intentId,
 playerId,
 amount,
 status: 'completed',
 createdAt: new Date().toISOString(),
 });
 res.json({
 intentId,
 status: 'completed' as const,
 balance: p.balance,
 amount,
 });
 return;
 }

 // Future: create pending intent for PSP redirect
 const intentId = randomUUID();
 store.topUps.set(intentId, {
 id: intentId,
 playerId,
 amount,
 status: 'pending',
 createdAt: new Date().toISOString(),
 });
 res.json({
 intentId,
 status: 'pending' as const,
 balance: store.getPlayer(playerId)!.balance,
 amount,
 });
});

app.get('/api/v1/rounds/:id', auth, (req, res) => {
 const playerId = (req as express.Request & { playerId: string }).playerId;
 const id = String(req.params.id);
 const round = store.rounds.get(id);
 if (!round || round.playerId !== playerId) {
 res.status(404).json({ error: 'NOT_FOUND' });
 return;
 }
 res.json(round.result);
});

app.get('/api/v1/admin/math', admin, (_req, res) => {
 res.json(gameService.getMath());
});

app.put('/api/v1/admin/math/features', admin, (req, res) => {
 const body = req.body as Record<string, number>;
 const math = gameService.getMath();
 gameService.updateMath({
 features: {
 ...math.features,
 ...body,
 },
 });
 res.json({ ok: true, features: gameService.getMath().features });
});

app.post('/api/v1/admin/players/:id/balance', admin, (req, res) => {
 const amount = Number((req.body as { amount?: number }).amount);
 if (!Number.isFinite(amount)) {
 res.status(400).json({ error: 'INVALID_AMOUNT' });
 return;
 }
 const playerId = String(req.params.id);
 const p = store.getPlayer(playerId);
 if (!p) {
 res.status(404).json({ error: 'PLAYER_NOT_FOUND' });
 return;
 }
 if (amount >= 0) store.credit(p.id, amount, 'admin-adjust');
 else store.debit(p.id, Math.abs(amount), 'admin-adjust');
 res.json({ balance: store.getPlayer(p.id)!.balance });
});

app.get('/api/v1/admin/metrics', admin, (_req, res) => {
 const rounds = [...store.rounds.values()];
 const wagered = rounds.reduce((a, r) => a + r.debit, 0);
 const won = rounds.reduce((a, r) => a + r.result.totalWin, 0);
 res.json({
 rounds: rounds.length,
 players: store.players.size,
 wagered,
 won,
 empiricalRtp: wagered > 0 ? won / wagered : null,
 });
});

app.listen(env.port, () => {
 console.log(
 `[western-stampede-rgs] listening on :${env.port} demoOnly=${!env.realMoney} rng=${env.rngProvider}`,
 );
});
