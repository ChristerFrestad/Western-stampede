# GLI-19 Control Matrix — Western Stampede RGS

**Status:** Engineering self-assessment (not a lab certificate)  
**Standard:** GLI-19 Interactive Gaming Systems (RNG + system integrity themes)  
**Scope:** RGS, RNG core, math engine, audit

| Control theme | Requirement (summary) | Implementation | Evidence / tests |
| --- | --- | --- | --- |
| Server-authoritative outcomes | Client must not determine game result | SpinEngine on RGS only; client renders `SpinResult` | Architecture.md; client never sends grid |
| RNG independence | RNG independent of game state / player | `@ws/rng-core` has no math/wallet deps | RNG_DESIGN.md |
| RNG strength | Cryptographically suitable / lab-tested | OS CSPRNG + rejection sampling | `rng-core` tests + chi-square; lab package |
| Unbiased scaling | Mapping to game ranges without bias | `unbiasedInt` rejection sampling | `unbiased-int.test.ts`, stat tests |
| Draw audit | Ability to reconstruct / identify draws | `drawId`, `purpose`, `rawHash`, `correlationId` | SpinResult.rngMeta |
| Fail-closed | System refuses play if RNG fails | HealthTracker + `/ready` 503 | `service.test.ts` |
| Math versioning | Config used for outcome is identifiable | `mathVersion` + `mathContentHash` | math-hash tests; every spin |
| No live unversioned change | Production math not silently mutated | `MATH_MUTATION_FORBIDDEN` in REAL_MONEY/COMPLIANCE | game-service |
| Round recall | Player / operator can retrieve past rounds | `GET /api/v1/rounds/:id`, `/history` | main.ts |
| Idempotent bets | Retries do not double-charge | `clientRoundId` uniqueness | game-service.test.ts |
| Wallet separation | Debit/credit trail | Ledger entries (memory/Postgres) | store layer |
| Logging / audit | Essential regulatory records | HashChain audit events | `@ws/audit-core` |
| Access control | Admin operations protected | `x-admin-token` | main.ts |
| Sim vs prod RNG | Non-crypto PRNG not used for money | PCG simOnly + `assertProductionRng` | rng.ts |
| Durable records (prod) | Survive restart | Postgres schema + DATABASE_URL gate | postgres-schema.sql |
| Protocol versioning | Multi-frontend stable API | `@ws/game-protocol` + OpenAPI | `/openapi.json` |

## Gaps remaining for formal lab / MGA

1. Independent lab RNG certificate (ISO 17025 lab engagement).  
2. Full async Postgres spin transaction in hot path (schema ready; MemoryStore default).  
3. Pen test + ISMS operational evidence for ISO 27001.  
4. ≥100M spin sim report pinned to math release.  
5. Operator KYC/RG modules (interfaces only today).

## Related docs

- [RNG_DESIGN.md](./RNG_DESIGN.md)
- [ISMS_SCOPE.md](./isms/ISMS_SCOPE.md)
- [../architecture/ADR-001-rng-core.md](../architecture/ADR-001-rng-core.md)
