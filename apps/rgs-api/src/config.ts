/**
 * Env + optional WS_PRESET.
 * Preset only fills *missing* knobs — explicit env always wins.
 *
 * casino = zero-config Portainer / LAN floor demo (play immediately).
 */
type PresetName = 'default' | 'casino';

function resolvePreset(): PresetName {
  const p = (process.env.WS_PRESET ?? 'casino').toLowerCase().trim();
  return p === 'casino' ? 'casino' : 'default';
}

function envOr(key: string, fallback: string): string {
  const v = process.env[key];
  if (v !== undefined && v !== '') return v;
  return fallback;
}

const preset = resolvePreset();

const casinoDefaults = {
  guestStartBalance: '100000',
  topupMode: 'demo',
  corsOrigin: '*',
  jwtSecret: 'dev-secret',
  adminToken: 'dev-admin-token',
} as const;

const defaultDefaults = {
  guestStartBalance: '10000',
  topupMode: 'demo',
  corsOrigin: '*',
  jwtSecret: 'dev-secret',
  adminToken: 'dev-admin-token',
} as const;

const d = preset === 'casino' ? casinoDefaults : defaultDefaults;

export const env = {
  /** Active preset name (for health/ops). */
  preset,
  port: Number(process.env.PORT ?? 3000),
  jwtSecret: envOr('JWT_SECRET', d.jwtSecret),
  /** local | production-csprng | external (external must be fully wired) */
  rngProvider: process.env.RNG_PROVIDER ?? 'local',
  topupMode: envOr('TOPUP_MODE', d.topupMode),
  guestStartBalance: Number(
    envOr('GUEST_START_BALANCE', d.guestStartBalance),
  ),
  realMoney: process.env.REAL_MONEY === 'true',
  complianceMode: process.env.COMPLIANCE_MODE === 'true',
  adminToken: envOr('ADMIN_TOKEN', d.adminToken),
  corsOrigin: envOr('CORS_ORIGIN', d.corsOrigin),
  /** When set, prefer Postgres (async boot). Empty = MemoryStore. */
  databaseUrl: process.env.DATABASE_URL ?? '',
  /** Require durable store when real money or compliance. */
  requireDurableStore:
    process.env.REQUIRE_DURABLE_STORE === 'true' ||
    process.env.REAL_MONEY === 'true',
};
