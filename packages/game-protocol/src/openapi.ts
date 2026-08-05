import { PROTOCOL_VERSION, GAME_CODE_WESTERN_STAMPEDE } from './schemas.js';

/**
 * Minimal OpenAPI 3.1 document for multi-frontend integration.
 * Kept as a plain object so it can be served at GET /openapi.json without codegen.
 */
export function buildOpenApiDocument(serverUrl = 'http://localhost:3000') {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Western Stampede RGS — Game Protocol',
      version: PROTOCOL_VERSION,
      description:
        'Server-authoritative slot RGS. Clients render only; never compute money outcomes.',
    },
    servers: [{ url: serverUrl }],
    paths: {
      '/health': {
        get: {
          summary: 'Liveness + RNG status',
          responses: { '200': { description: 'OK' } },
        },
      },
      '/ready': {
        get: {
          summary: 'Readiness (DB + RNG fail-closed)',
          responses: {
            '200': { description: 'Ready' },
            '503': { description: 'Not ready' },
          },
        },
      },
      '/api/v1/auth/guest': {
        post: {
          summary: 'Create guest session (demo)',
          responses: { '200': { description: 'GuestAuthResponse' } },
        },
      },
      '/api/v1/game/config': {
        get: {
          summary: `Public config for ${GAME_CODE_WESTERN_STAMPEDE}`,
          responses: { '200': { description: 'GameConfigResponse' } },
        },
      },
      '/api/v1/game/spin': {
        post: {
          summary: 'Authoritative spin',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['bet', 'clientRoundId'],
                  properties: {
                    bet: { type: 'integer' },
                    clientRoundId: { type: 'string' },
                    buyTier: {
                      type: 'string',
                      enum: ['standard', 'enhanced', 'premium'],
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'SpinResult' },
            '400': { description: 'Validation / business rule' },
            '402': { description: 'Insufficient funds' },
            '401': { description: 'Unauthorized' },
            '503': { description: 'RNG unavailable' },
          },
        },
      },
      '/api/v1/wallet': {
        get: {
          summary: 'Current balance',
          security: [{ bearerAuth: [] }],
          responses: { '200': { description: 'WalletResponse' } },
        },
      },
      '/api/v1/rounds/{id}': {
        get: {
          summary: 'Round recall',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': { description: 'SpinResult' },
            '404': { description: 'Not found' },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer' },
      },
    },
    'x-ws-protocol-version': PROTOCOL_VERSION,
    'x-ws-game-code': GAME_CODE_WESTERN_STAMPEDE,
  } as const;
}
