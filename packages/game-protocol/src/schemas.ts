import { z } from 'zod';

/** Protocol major version advertised by RGS and clients. */
export const PROTOCOL_VERSION = '1.0.0' as const;
export const GAME_CODE_WESTERN_STAMPEDE = 'western-stampede' as const;

export const spinRequestSchema = z.object({
  bet: z.number().int().positive(),
  clientRoundId: z.string().min(1).max(128),
  buyTier: z.enum(['standard', 'enhanced', 'premium']).optional(),
});

export type SpinRequestDto = z.infer<typeof spinRequestSchema>;

export const guestAuthResponseSchema = z.object({
  token: z.string().min(1),
  playerId: z.string().min(1),
  balance: z.number().int(),
  displayName: z.string(),
});

export const walletResponseSchema = z.object({
  balance: z.number().int(),
  currency: z.string().min(1),
});

export const topUpRequestSchema = z.object({
  amount: z.number().int().positive().max(1_000_000),
});

export const topUpResponseSchema = z.object({
  intentId: z.string().min(1),
  status: z.enum(['completed', 'pending']),
  balance: z.number().int(),
  amount: z.number().int(),
});

export const rngMetaSchema = z.object({
  provider: z.string(),
  streamId: z.string().optional(),
  algorithm: z.string().optional(),
  buildId: z.string().optional(),
  drawIds: z.array(z.string()).optional(),
  drawCount: z.number().int().optional(),
});

export const spinResultSchema = z.object({
  roundId: z.string().min(1),
  mathVersion: z.string().min(1),
  mathContentHash: z.string().length(64).optional(),
  mode: z.enum(['BASE', 'FREE', 'BUY', 'STAMPEDE']),
  bet: z.number().int().nonnegative(),
  grid: z.array(z.array(z.string())),
  heights: z.array(z.number().int().positive()),
  stops: z.array(z.number().int().nonnegative()),
  wins: z.array(z.record(z.unknown())),
  totalWin: z.number().int().nonnegative(),
  balance: z.number().int(),
  features: z.record(z.unknown()),
  wildMults: z.array(
    z.object({
      reel: z.number().int(),
      row: z.number().int(),
      mult: z.number().int(),
    }),
  ),
  rngMeta: rngMetaSchema,
});

export const errorBodySchema = z.object({
  error: z.string(),
  details: z.unknown().optional(),
});

/** Stable error codes used by RGS. */
export const ERROR_CODES = [
  'UNAUTHORIZED',
  'FORBIDDEN',
  'INVALID_BODY',
  'INVALID_BET',
  'INVALID_BUY_TIER',
  'INSUFFICIENT_FUNDS',
  'FREE_GAMES_ACTIVE',
  'BET_LOCKED',
  'PLAYER_NOT_FOUND',
  'NOT_FOUND',
  'RNG_UNAVAILABLE',
  'MATH_MUTATION_FORBIDDEN',
  'SIM_RNG_FORBIDDEN_IN_PRODUCTION',
  'SPIN_FAILED',
  'RATE_LIMITED',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];
