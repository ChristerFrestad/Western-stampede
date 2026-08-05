import { randomUUID } from 'node:crypto';
import {
  InsufficientFundsError,
  PlayerNotFoundError,
  type Money,
  type WalletPort,
  type WalletTx,
} from './types.js';

interface DemoAccount {
  balance: number;
  currency: string;
  version: number;
}

/**
 * In-process demo wallet for social play and integration tests.
 * Not for real money.
 */
export class DemoWalletPort implements WalletPort {
  private accounts = new Map<string, DemoAccount>();

  ensure(playerRef: string, startBalance: number, currency = 'DEMO'): void {
    if (!this.accounts.has(playerRef)) {
      this.accounts.set(playerRef, {
        balance: startBalance,
        currency,
        version: 0,
      });
    }
  }

  setBalance(playerRef: string, amount: number): void {
    const a = this.accounts.get(playerRef);
    if (!a) throw new PlayerNotFoundError();
    a.balance = amount;
    a.version++;
  }

  async getBalance(playerRef: string): Promise<Money> {
    const a = this.accounts.get(playerRef);
    if (!a) throw new PlayerNotFoundError();
    return { amount: a.balance, currency: a.currency };
  }

  async debit(
    playerRef: string,
    amount: number,
    ref: string,
  ): Promise<WalletTx> {
    if (amount < 0) throw new Error('INVALID_AMOUNT');
    const a = this.accounts.get(playerRef);
    if (!a) throw new PlayerNotFoundError();
    if (a.balance < amount) throw new InsufficientFundsError();
    a.balance -= amount;
    a.version++;
    return {
      txId: randomUUID(),
      playerRef,
      amount: -amount,
      type: 'debit',
      ref,
      balanceAfter: a.balance,
      at: new Date().toISOString(),
    };
  }

  async credit(
    playerRef: string,
    amount: number,
    ref: string,
  ): Promise<WalletTx> {
    if (amount < 0) throw new Error('INVALID_AMOUNT');
    const a = this.accounts.get(playerRef);
    if (!a) throw new PlayerNotFoundError();
    a.balance += amount;
    a.version++;
    return {
      txId: randomUUID(),
      playerRef,
      amount,
      type: 'credit',
      ref,
      balanceAfter: a.balance,
      at: new Date().toISOString(),
    };
  }
}
