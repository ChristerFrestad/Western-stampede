# Certification & commercial path

This document is **guidance**, not legal advice.

## What this codebase provides

- Server-authoritative outcomes
- Pluggable `IRngProvider`
- Versioned math configs
- Immutable-ish round records (in-memory today; promote to Postgres)
- Wallet debit/credit separation and top-up intent stub
- Admin hooks to retune feature weights / inspect empirical RTP

## What you must add for real-money markets

1. **Licensed operator** / supplier status in target jurisdictions 
2. **Independent lab testing** of RNG + math (GLI / BMM / eCOGRA / etc.) 
3. **GLI-19-style** interactive gaming controls: logging, integrity, player protection 
4. **Persistent durable storage** (Postgres), multi-node safe locks 
5. **KYC/AML**, RG limits, geo, tax as required 
6. **Payment provider** wired to `TopUpIntent` state machine 
7. **No client trust** audits, penetration test, secrets management 

## Swapping RNG

1. Implement `IRngProvider` calling your certified service 
2. Set `RNG_PROVIDER=external` 
3. Log `rngMeta` (stream/ticket IDs) on every round 
4. Re-run simulation harness against production math version 

## RTP control

- Adjust reel strips / feature weights via admin API or config deploy 
- Pin `mathVersion` on rounds 
- Run `pnpm math:sim <spins>` before activating a profile 
