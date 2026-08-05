# ADR-002: PCG64 for simulation only; CSPRNG for money

## Status

Accepted — 2026-03-26

## Context

Research lists PCG / Xoshiro as the best general PRNGs. Mulberry32 was too weak for serious Monte Carlo. Real-money certification still requires unpredictable draws with full audit.

## Decision

1. **Production money path:** `@ws/rng-core` OS CSPRNG + rejection sampling.  
2. **Offline sim / CI RTP:** PCG64 XSL RR 128/64 (`SeededPrng`, algorithm `pcg64-xsl-rr-sim-only`).  
3. Enforce separation with `simOnly` flag + `assertProductionRng()` on every RGS spin stream.

## Consequences

- Faster, higher-quality sims without weakening the cert path.  
- Lab packages document both generators and their roles.  
- Xoshiro can be added later as an alternate sim backend if desired; PCG is the default.
