import { randomInt } from 'node:crypto';
import type { RngMeta } from '@ws/shared';

/** Pluggable RNG — swap implementation for certified external RNG later. */
export interface IRngProvider {
 nextInt(maxExclusive: number): Promise<number>;
 nextInts(maxExclusive: number, count: number): Promise<number[]>;
 meta(): RngMeta;
}

/** Cryptographically secure PRNG for realistic demo / pre-cert use. */
export class CryptoPrng implements IRngProvider {
 meta(): RngMeta {
 return { provider: 'local-crypto' };
 }

 async nextInt(maxExclusive: number): Promise<number> {
 if (maxExclusive <= 0) throw new Error('maxExclusive must be > 0');
 return randomInt(maxExclusive);
 }

 async nextInts(maxExclusive: number, count: number): Promise<number[]> {
 const out: number[] = [];
 for (let i = 0; i < count; i++) {
 out.push(await this.nextInt(maxExclusive));
 }
 return out;
 }
}

/** Deterministic sequence for tests and forced feature demos. */
export class SequenceRng implements IRngProvider {
 private i = 0;
 constructor(private readonly values: number[]) {}

 meta(): RngMeta {
 return { provider: 'sequence', streamId: `seq-${this.values.length}` };
 }

 async nextInt(maxExclusive: number): Promise<number> {
 const v = this.values[this.i % this.values.length]!;
 this.i++;
 return v % maxExclusive;
 }

 async nextInts(maxExclusive: number, count: number): Promise<number[]> {
 const out: number[] = [];
 for (let i = 0; i < count; i++) out.push(await this.nextInt(maxExclusive));
 return out;
 }
}

/** Mulberry32-style seeded RNG for mass simulation (faster than crypto). */
export class SeededPrng implements IRngProvider {
 private state: number;
 constructor(seed: number) {
 this.state = seed >>> 0;
 }

 meta(): RngMeta {
 return { provider: 'seeded-sim', streamId: String(this.state) };
 }

 async nextInt(maxExclusive: number): Promise<number> {
 let t = (this.state += 0x6d2b79f5);
 t = Math.imul(t ^ (t >>> 15), t | 1);
 t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
 const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
 return Math.floor(r * maxExclusive);
 }

 async nextInts(maxExclusive: number, count: number): Promise<number[]> {
 const out: number[] = [];
 for (let i = 0; i < count; i++) out.push(await this.nextInt(maxExclusive));
 return out;
 }
}
