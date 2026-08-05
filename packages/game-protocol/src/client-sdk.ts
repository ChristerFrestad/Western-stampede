import {
  guestAuthResponseSchema,
  spinRequestSchema,
  spinResultSchema,
  walletResponseSchema,
  type SpinRequestDto,
} from './schemas.js';

export interface ProtocolClientOptions {
  baseUrl: string;
  token?: string;
  /** Optional fetch implementation (tests / non-browser). */
  fetchImpl?: typeof fetch;
}

/**
 * Thin typed client for frontends (Pixi, headless, second UI).
 * Does not interpret game math — only transports protocol messages.
 */
export class GameProtocolClient {
  private token: string | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: ProtocolClientOptions) {
    this.token = opts.token;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  setToken(token: string): void {
    this.token = token;
  }

  async guestAuth(): Promise<{
    token: string;
    playerId: string;
    balance: number;
    displayName: string;
  }> {
    const res = await this.fetchImpl(
      `${this.opts.baseUrl}/api/v1/auth/guest`,
      { method: 'POST' },
    );
    if (!res.ok) throw new Error(`guestAuth failed: ${res.status}`);
    const body = guestAuthResponseSchema.parse(await res.json());
    this.token = body.token;
    return body;
  }

  async getConfig(): Promise<unknown> {
    const res = await this.fetchImpl(
      `${this.opts.baseUrl}/api/v1/game/config`,
    );
    if (!res.ok) throw new Error(`getConfig failed: ${res.status}`);
    return res.json();
  }

  async spin(req: SpinRequestDto): Promise<unknown> {
    const parsed = spinRequestSchema.parse(req);
    const res = await this.fetchImpl(
      `${this.opts.baseUrl}/api/v1/game/spin`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
        },
        body: JSON.stringify(parsed),
      },
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(
        `spin failed: ${res.status} ${JSON.stringify(err)}`,
      );
    }
    return spinResultSchema.parse(await res.json());
  }

  async wallet(): Promise<{ balance: number; currency: string }> {
    const res = await this.fetchImpl(`${this.opts.baseUrl}/api/v1/wallet`, {
      headers: this.token
        ? { authorization: `Bearer ${this.token}` }
        : {},
    });
    if (!res.ok) throw new Error(`wallet failed: ${res.status}`);
    return walletResponseSchema.parse(await res.json());
  }
}
