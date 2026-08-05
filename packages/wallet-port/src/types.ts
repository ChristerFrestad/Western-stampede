export interface Money {
  amount: number;
  currency: string;
}

export interface WalletTx {
  txId: string;
  playerRef: string;
  amount: number;
  type: 'debit' | 'credit';
  ref: string;
  balanceAfter: number;
  at: string;
}

/**
 * Operator-facing wallet boundary.
 * RGS never assumes a specific PSP — only this port.
 */
export interface WalletPort {
  getBalance(playerRef: string): Promise<Money>;
  debit(playerRef: string, amount: number, ref: string): Promise<WalletTx>;
  credit(playerRef: string, amount: number, ref: string): Promise<WalletTx>;
}

export class InsufficientFundsError extends Error {
  constructor(message = 'INSUFFICIENT_FUNDS') {
    super(message);
    this.name = 'InsufficientFundsError';
  }
}

export class PlayerNotFoundError extends Error {
  constructor(message = 'PLAYER_NOT_FOUND') {
    super(message);
    this.name = 'PlayerNotFoundError';
  }
}
