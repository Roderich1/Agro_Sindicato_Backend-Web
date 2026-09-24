# F02 final test matrix

Legend: PASS means an executed test or inspection, not merely an existing file. `REUSED_VERIFIED_EVIDENCE` applies only to Mobile device evidence from unchanged Mobile main. `NOT_MEASURED` is deliberately not a pass.

| Requirement | Risk | UNIT | INT | CONTRACT | E2E | SECURITY | DEVICE | Evidence | Result |
|---|---|---|---|---|---|---|---|---|---|---|
| SRS-IAM-01, Member authority | stale role / inactive context | PASS | PASS | N/A | PASS | PASS | N/A | F02-D 25/25, final HTTP suite 2/2 | PASS |
| SRS-DEVICE-01, logical client ID | spoofing / privacy / revocation | PASS | PASS | PASS | PASS | PASS | REUSED_VERIFIED_EVIDENCE | F02-B and Mobile `F02_DEVICE_CLIENT_ID_EVIDENCE.md`; final HTTP suite | PASS |
| SRS-IAM-02, V1/V2 auth | refresh reuse / session compromise | PASS | PASS | PASS | PASS | PASS | N/A | F02-C 12/12, F02-D 25/25, final HTTP suite | PASS |
| SRS-SYNC-02 F02 identity prerequisite | unauthorised central identity | PASS | PASS | PASS | PASS | PASS | N/A | final HTTP suite; final Sync contract delegated to F05 | PASS |
| Fresh migration / Prisma drift | release cannot install | N/A | PASS | N/A | N/A | N/A | N/A | four migrations on empty PostgreSQL 16; migrate diff none | PASS |
| Pre-F02 upgrade / legacy rows | data loss | N/A | PASS | N/A | N/A | N/A | N/A | three User rows, Member backfill, V1 RefreshToken preservation | PASS |
| Intermediate release upgrade | release boundary incompatibility | N/A | PASS | N/A | N/A | N/A | N/A | F02-A→current: Member=1/client=0/session=0; F02-B→current: Member=1/client=1/session=0 | PASS |
| Application rollback to F02-B | older application cannot use expanded schema | N/A | PASS | N/A | PASS | N/A | N/A | historical commit `c345690` built and booted on expanded DB; HTTP V1 login/me/refresh and ClientRegistration create passed | PASS |
| OpenAPI V1/V2/client contracts | undocumented contract drift | N/A | N/A | PASS | N/A | N/A | N/A | versioned snapshot, generator diff guard, contract assertions | PASS |
| Full Mobile-to-Backend auth/sync | premature F05 claim | N/A | N/A | N/A | NOT_MEASURED | N/A | N/A | remote auth, refresh storage, networking and Sync delegated | NOT_MEASURED |

The normal suite passed 25 suites / 105 tests; three opt-in PostgreSQL suites account for 39 skipped tests in that command. Independently, F02-C passed 12/12, F02-D passed 25/25, and the new final HTTP suite passed 2/2 against separate PostgreSQL 16 databases. Existing unit coverage includes refresh, ClientRegistration repository/use case, duration, DTO and relevant use cases; no percentage is claimed.
