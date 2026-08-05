# ADR-001: Certifiable RNG core as isolated package

## Status

Accepted — 2026-03-26

## Context

Western Stampede’s original RNG was a thin `node:crypto.randomInt` wrapper without draw audit, purpose tags, health/fail-closed behaviour, or documented unbiased scaling. That is insufficient for MGA technical readiness and independent lab RNG certification.

## Decision

1. Introduce `@ws/rng-core` as the single production RNG implementation unit.
2. Use OS/OpenSSL CSPRNG (`randomBytes`) + **rejection sampling** (`os-csprng+rejection-v1`).
3. Scope draws per round via `RngStream` with `purpose` tags and `drawIds` on every `SpinResult`.
4. Fail-closed on entropy failure; **never** silently fall back from `RNG_PROVIDER=external`.
5. Keep `SeededPrng` / `SequenceRng` for sim and unit tests only.

## Consequences

- Math engine depends on `@ws/rng-core` only through `IRngProvider` / stream adapter.
- Lab can review a small, dependency-light package and `docs/compliance/RNG_DESIGN.md`.
- Later optional rewrite (Rust/HSM) can implement the same interface without rewriting game math.
