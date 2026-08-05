import type { Money, WalletPort, WalletTx } from './types.js';

/**
 * Stub for operator seamless wallet over HTTP.
 * Contract tests only — implement real endpoints when integrating an operator.
 */
export class OperatorHttpWalletStub implements WalletPort {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  async getBalance(_playerRef: string): Promise<Money> {
    throw new Error(
      `OPERATOR_WALLET_NOT_WIRED: GET ${this.baseUrl}/balance (key=${this.apiKey.slice(0, 4)}…)`,
    );
  }

  async debit(
    _playerRef: string,
    _amount: number,
    _ref: string,
  ): Promise<WalletTx> {
    throw new Error('OPERATOR_WALLET_NOT_WIRED: debit');
  }

  async credit(
    _playerRef: string,
    _amount: number,
    _ref: string,
  ): Promise<WalletTx> {
    throw new Error('OPERATOR_WALLET_NOT_WIRED: credit');
  }
}
