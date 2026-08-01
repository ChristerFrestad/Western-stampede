export const env = {
 port: Number(process.env.PORT ?? 3000),
 jwtSecret: process.env.JWT_SECRET ?? 'dev-secret',
 rngProvider: process.env.RNG_PROVIDER ?? 'local',
 topupMode: process.env.TOPUP_MODE ?? 'demo',
 guestStartBalance: Number(process.env.GUEST_START_BALANCE ?? 10_000),
 realMoney: process.env.REAL_MONEY === 'true',
 adminToken: process.env.ADMIN_TOKEN ?? 'dev-admin-token',
 corsOrigin: process.env.CORS_ORIGIN ?? '*',
};
