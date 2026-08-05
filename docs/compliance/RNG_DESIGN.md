# RNG Design Document — Western Stampede

**Document status:** Engineering design for lab pre-assessment  
**Algorithm ID:** `os-csprng+rejection-v1`  
**Build pin:** `rng-core@1.0.0`  
**Package:** `@ws/rng-core`  
**Language:** TypeScript (Node.js ≥ 20)

> This document is technical evidence for independent laboratory review (e.g. GLI / BMM / eCOGRA) and MGA technical readiness. It is not a legal opinion.

---

## 1. Scope

The RNG is responsible **only** for generating uniform random integers used by the game math engine. It does **not**:

- Know player identity, balance, bet amount, or win/loss outcomes
- Implement paytables, reel strips, or feature logic
- Accept client-supplied seeds for money outcomes

Game outcomes are a pure function of:

1. Released math configuration (`mathVersion` + `mathContentHash`)
2. Sequence of RNG draws with declared `purpose` tags

---

## 2. Architecture blocks

```
EntropySource (OS CSPRNG)
        │
        ▼
HealthMonitor (fail-closed)
        │
        ▼
UnbiasedIntegerMapper (rejection sampling)
        │
        ▼
Draw record (drawId, purpose, correlationId, rawHash, …)
        │
        ▼
RngStream (per round) → SpinEngine
```

| Block | Implementation | Notes |
| --- | --- | --- |
| Entropy | `node:crypto.randomBytes` (OpenSSL / OS CSPRNG) | `OsCspongeEntropy` |
| Scaling | Rejection sampling from 32-bit (or 48-bit) raw | `unbiasedInt` |
| Health | Consecutive failure counter → fail-closed | `HealthTracker` |
| Stream | Per-`roundId` correlation + purpose tags | `RngStream` |
| Audit | SHA-256 of raw bytes per accepted draw | `rawHash` on `RngDraw` |

---

## 3. Entropy source

**Production:** Node.js `crypto.randomBytes(n)`, which uses the platform CSPRNG (OpenSSL `RAND_bytes` / OS facilities).

**Properties relied upon:**

- Cryptographically secure
- Suitable for generating unpredictable game outcomes when combined with unbiased scaling
- Not reseeded by application game state

**Optional future:** HSM or certified external RNG behind the same `EntropySource` / `IRngService` interface (`RNG_PROVIDER=external` must be fully wired — **no silent fallback**).

**Forbidden in production money path:**

- `Math.random()`
- `SeededPrng` / Mulberry32 (simulation only)
- `SequenceRng` (unit tests only)

---

## 4. Unbiased integer mapping

### 4.1 Requirement

Map CSPRNG bits to an integer uniform on `{0, 1, …, n−1}` **without modulo bias**.

### 4.2 Algorithm (`os-csprng+rejection-v1`)

For `1 < n ≤ 2^32`:

1. Let `M = 2^32`.
2. Let `limit = ⌊M / n⌋ · n` (largest multiple of `n` not exceeding `M`).
3. Draw `u` as a big-endian unsigned 32-bit integer from 4 CSPRNG bytes.
4. If `u ≥ limit`, **reject** and repeat from step 3.
5. Return `u mod n`.

For `n = 1`, return `0` (degenerate distribution).

For `n > 2^32` (not required by current game ranges), a 48-bit analogue is used.

### 4.3 Correctness sketch

Accepted values of `u` are uniform on `{0, …, limit−1}`.  
`limit` is divisible by `n`, so there are exactly `limit/n` complete residue classes modulo `n`.  
Therefore `u mod n` is uniform on `{0, …, n−1}`.

Expected number of trials is `M / limit ≤ 2` and typically very close to 1. A hard cap of 64 rejection rounds aborts with `RNG_REJECTION_EXHAUSTED` (indicates broken entropy, not normal operation).

### 4.4 Probability scaling for features

Feature probabilities in `[0, 1]` are realized as:

```
roll = nextInt(1_000_000, purpose)
success = roll < floor(p * 1_000_000)
```

This yields resolution of `1e-6` with unbiased integers.

---

## 5. Draw identity and audit

Every draw records:

| Field | Description |
| --- | --- |
| `drawId` | UUID v4 |
| `value` | Result in `[0, maxExclusive)` |
| `maxExclusive` | Requested range |
| `purpose` | Consumer tag (e.g. `reel.stop.2`, `feature.stampede`) |
| `correlationId` | Round id |
| `algorithm` | `os-csprng+rejection-v1` |
| `buildId` | `rng-core@1.0.0` |
| `rawHash` | SHA-256 of accepted raw entropy bytes |
| `rejections` | Rejection count before accept |
| `drawnAt` | ISO-8601 UTC |

`SpinResult.rngMeta` includes `provider`, `algorithm`, `buildId`, `streamId` (= roundId), and `drawIds[]`.

---

## 6. Purpose tags (game consumption)

| Purpose | Use |
| --- | --- |
| `reel.stop.{0-4}` | Virtual reel stop indices |
| `feature.stampede` | Stampede trigger (1e6 scale) |
| `wild.mult.{reel}.{row}` | Wild 2× vs 3× weight draw |
| `feature.supercoin.wheel` | Supercoin wheel index |

Adding new RNG uses **must** introduce a stable purpose string and be reflected in this document before certification freeze.

---

## 7. Health and fail-closed

- Probe entropy source health on demand (`/health`, `/ready`).
- On entropy/draw failure, increment consecutive failure counter.
- After `maxConsecutiveFailures` (default **3**), enter **fail-closed**:
  - New draws throw `RNG_UNAVAILABLE`
  - RGS `/ready` returns HTTP 503
  - Money spins are refused

There is **no** automatic silent fallback to a weaker generator.

---

## 8. Independence from game logic

- `@ws/rng-core` has **zero** dependencies on math, wallet, or player modules.
- `SpinEngine` requests integers only; it never feeds win amounts back into the RNG.
- Admin math mutation is forbidden when `REAL_MONEY=true` or `COMPLIANCE_MODE=true`.

---

## 8a. Performance notes (host class)

On multi-core workstations (e.g. 8C/16T Ryzen), the production draw path is **synchronous** (`drawSync` / `spinSync`) so Node Promise overhead does not dominate. Monte Carlo uses `worker_threads` with default `availableParallelism() - 2` workers. GPU is unused for RNG.

## 8b. Simulation generators (NOT for money)

Offline RTP / CI simulation uses **PCG64 XSL RR 128/64** (`SeededPrng` / `pcg64-xsl-rr-sim-only`):

- Based on Melissa E. O'Neill’s PCG (reference: imneme/pcg-c)
- Unbiased range mapping via rejection sampling on 64-bit outputs
- Marked `simOnly = true`; RGS production path uses `assertProductionRng` / only CSPRNG streams
- **Never** configure PCG as `RNG_PROVIDER` for real-money

Rationale: PCG/Xoshiro are excellent for large, reproducible Monte Carlo; they are not a substitute for OS CSPRNG in regulated money games.

---

## 9. Statistical testing

Repository gates (CI):

| Test | Location | N (smoke) |
| --- | --- | --- |
| Range invariant | `unbiased-int.test.ts` | continuous |
| Chi-square uniformity | `unbiased-int.stat.test.ts` | 1e5 per range |
| Fail-closed | `service.test.ts` | — |
| Live OS smoke | `service.test.ts` | 50 draws |

Release / lab package (larger N):

- Chi-square / frequency for all production ranges (reel lengths, 2, 1e6, wheel size)
- NIST SP 800-22 on raw bit streams from `randomBytes` (lab harness)
- Full game simulation ≥ 1e8 spins for RTP (separate math cert package)

---

## 10. Configuration

| Env | Meaning |
| --- | --- |
| `RNG_PROVIDER=local` \| `production-csprng` | Use `@ws/rng-core` OS CSPRNG path |
| `RNG_PROVIDER=external` | **Must** be fully implemented; process refuses to start if not wired |
| `COMPLIANCE_MODE=true` | Forbids live math mutation |
| `REAL_MONEY=true` | Same + demo restrictions (see RGS gates) |

---

## 11. Change control

Any change to:

- Entropy source
- Scaling algorithm
- Draw record fields that affect reproducibility claims

requires:

1. Bump `RNG_BUILD_ID` / algorithm id if behavioural
2. Update this document
3. Re-run statistical suite + lab package
4. New lab submission before production real-money use

---

## 12. References

- NIST SP 800-22 Rev. 1a — Statistical Test Suite for RNGs  
- GLI-19 — Standards for Interactive Gaming Systems (RNG chapter)  
- Node.js `crypto.randomBytes` / OpenSSL RAND  
- Project plan: production RGS + MGA technical readiness  
