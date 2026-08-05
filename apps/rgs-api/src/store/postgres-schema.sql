-- Western Stampede RGS — durable schema (Postgres 16+)
-- Applied by apps/rgs-api when DATABASE_URL is set.

CREATE TABLE IF NOT EXISTS players (
  id            UUID PRIMARY KEY,
  display_name  TEXT NOT NULL,
  balance       BIGINT NOT NULL CHECK (balance >= 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  version       INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sessions (
  token         TEXT PRIMARY KEY,
  player_id     UUID NOT NULL REFERENCES players(id),
  expires_at    TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id            UUID PRIMARY KEY,
  player_id     UUID NOT NULL REFERENCES players(id),
  type          TEXT NOT NULL,
  amount        BIGINT NOT NULL,
  ref           TEXT NOT NULL,
  balance_after BIGINT NOT NULL,
  at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ledger_player ON ledger_entries(player_id, at DESC);

CREATE TABLE IF NOT EXISTS rounds (
  id              UUID PRIMARY KEY,
  player_id       UUID NOT NULL REFERENCES players(id),
  client_round_id TEXT NOT NULL,
  result          JSONB NOT NULL,
  debit           BIGINT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (player_id, client_round_id)
);

CREATE INDEX IF NOT EXISTS idx_rounds_player ON rounds(player_id, created_at DESC);

CREATE TABLE IF NOT EXISTS free_sessions (
  player_id   UUID PRIMARY KEY REFERENCES players(id),
  session     JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS topup_intents (
  id          UUID PRIMARY KEY,
  player_id   UUID NOT NULL REFERENCES players(id),
  amount      BIGINT NOT NULL,
  status      TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_events (
  seq         BIGSERIAL PRIMARY KEY,
  type        TEXT NOT NULL,
  payload     JSONB NOT NULL,
  at          TIMESTAMPTZ NOT NULL,
  prev_hash   CHAR(64) NOT NULL,
  hash        CHAR(64) NOT NULL
);

CREATE TABLE IF NOT EXISTS math_releases (
  version       TEXT PRIMARY KEY,
  content_hash  CHAR(64) NOT NULL,
  payload       JSONB NOT NULL,
  approved_at   TIMESTAMPTZ,
  sim_report_uri TEXT
);
