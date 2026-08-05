import { randomBytes as nodeRandomBytes } from 'node:crypto';
import type { EntropySource } from './types.js';

/**
 * Production entropy: Node.js / OpenSSL CSPRNG (OS-backed).
 * Documented for lab review in docs/compliance/RNG_DESIGN.md.
 */
export class OsCspongeEntropy implements EntropySource {
  readonly id = 'node-crypto.randomBytes';

  randomBytes(size: number): Uint8Array {
    if (!Number.isInteger(size) || size <= 0) {
      throw new Error('ENTROPY_INVALID_SIZE');
    }
    return nodeRandomBytes(size);
  }

  healthy(): boolean {
    try {
      // Touch the CSPRNG; any throw means unavailable.
      const probe = nodeRandomBytes(16);
      return probe.length === 16;
    } catch {
      return false;
    }
  }
}

/**
 * Deterministic entropy for unit tests only — NOT for production or certification.
 * Uses a simple xorshift128+ over a seeded state to fill bytes.
 */
export class SeededEntropy implements EntropySource {
  readonly id = 'test-seeded-entropy';
  private s0: bigint;
  private s1: bigint;

  constructor(seed: number | bigint = 1n) {
    const s = BigInt(seed) === 0n ? 1n : BigInt(seed);
    this.s0 = s & 0xffff_ffff_ffff_ffffn;
    this.s1 = (s * 0x9e37_79b9_7f4a_7c15n) & 0xffff_ffff_ffff_ffffn;
    if (this.s1 === 0n) this.s1 = 1n;
  }

  randomBytes(size: number): Uint8Array {
    const out = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      out[i] = Number(this.nextU64() & 0xffn);
    }
    return out;
  }

  healthy(): boolean {
    return true;
  }

  private nextU64(): bigint {
    let s1 = this.s0;
    const s0 = this.s1;
    this.s0 = s0;
    s1 ^= s1 << 23n;
    s1 ^= s1 >> 17n;
    s1 ^= s0;
    s1 ^= s0 >> 26n;
    this.s1 = s1 & 0xffff_ffff_ffff_ffffn;
    return (this.s1 + s0) & 0xffff_ffff_ffff_ffffn;
  }
}

/**
 * Entropy that always fails health probe — used to test immediate fail-closed.
 */
export class FailingEntropy implements EntropySource {
  readonly id = 'test-failing-entropy';

  randomBytes(_size: number): Uint8Array {
    throw new Error('ENTROPY_UNAVAILABLE');
  }

  healthy(): boolean {
    return false;
  }
}

/**
 * Entropy that claims healthy but throws on read — tests consecutive-failure
 * path before fail-closed engages.
 */
export class ThrowingEntropy implements EntropySource {
  readonly id = 'test-throwing-entropy';

  randomBytes(_size: number): Uint8Array {
    throw new Error('ENTROPY_UNAVAILABLE');
  }

  healthy(): boolean {
    return true;
  }
}
