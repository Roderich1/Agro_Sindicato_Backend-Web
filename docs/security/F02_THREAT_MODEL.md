# F02 identity threat model

This is a design/test threat model, not a measured production security assessment. Evidence references are in `docs/evidence/F02_IAM_01.md` through `F02_IAM_05.md`.

| Asset | Threat / attack path | Existing control | Evidence | Residual risk / owner |
|---|---|---|---|---|
| JWT access | theft or stale role claim | short access TTL and current User/Member/Tenant resolution per request; V2 Session checked | F02-D 25/25, final HTTP role test | stolen valid bearer before expiry; operations/security |
| Tenant/member authority | forged tenant/role claims | JWT signature plus DB-derived current context; no claim-as-authority | F02-D and final HTTP | multi-membership selector DELEGATED; future IAM |
| Private resources | cross-user/tenant IDOR | scoped repository/use-case access and 404 concealment | F02-D, final Plot HTTP checks | legacy central private endpoints retained; later scope review |
| DTOs | mass assignment of tenantId, ownerUserId, actorUserId, role | whitelist + forbidNonWhitelisted and server-derived authority | final HTTP checks | audit each new F05 DTO |
| V1 refresh | theft, reuse, raw logging | SHA-256 persistence, HttpOnly cookie, rotation; logs avoid raw token | F02-C and final V1 HTTP | V1 has no individual AuthSession; V1 User/Member/Tenant revalidated per request |
| V2 refresh | replay / concurrent rotation | hashed token, atomic consumption, session compromise response, separate contractVersion=2 | F02-C 12/12 | network/client storage risks remain; operations/Mobile |
| Session | compromise or revocation | per-session state and resolver check; one session does not revoke another by default | F02-C, final second-session test | device-bound threat response later |
| ClientRegistration | spoof/revocation/correlation | clientId is a pseudonymous installation UUID, not a secret or hardware ID; backend stores SHA-256; authorization also requires Member+Tenant | F02-B, final HTTP binding/revocation | backup/restore may duplicate installation identity; Mobile future phase |
| Device | restore / cloned client ID | server binding and revocation; not clientId-only authorization | Mobile F02-B reused evidence | remote auth and secure refresh storage DELEGATED |
| Legacy private modules | unreviewed compatibility surface | current authorization context in F02-D | F02-D 25/25 | endpoints remain compatibility surface, not target architecture; review later |

V1 and V2 refresh tokens are deliberately isolated. The compatibility selector remains `User.tenantId -> current Member`; a multi-membership selector is DELEGATED, not implemented in #14. No final Sync-operation binding is claimed.

## Dependency advisory triage (2026-09-28)

Reproduced with `npm ci`, `npm audit --json` and `npm audit --omit=dev --json` on PR #93's pre-review HEAD. The full audit found **15 package findings: 10 high, 3 moderate, 2 low, 0 critical**. Production-only audit still found **9 findings: 6 high, 2 moderate, 1 low**, but this includes Prisma CLI/config packages placed in `dependencies`; presence in that set does not prove request-time reachability. `npm explain` and source search were used to classify paths. “Fix” below reports npm audit availability, not permission to update in #14.

| Package | Severity | Root/path and exposure | Fix | F02 relevance and disposition |
|---|---|---|---|---|
| `@nestjs/platform-express` | HIGH | Direct runtime; pulls vulnerable `multer` into Nest HTTP adapter | Yes | **F02_RUNTIME_RELEVANT** dependency chain; review upload reachability below; future upgrade before production |
| `multer` | HIGH | Transitive runtime through Nest platform-express; multipart parser/upload DoS and limit advisories | Yes | **F02_RUNTIME_RELEVANT** HTTP stack, but no `FileInterceptor`, `MulterModule`, `@UploadedFile` or multipart auth route found in `src`; no exploit path through F02 JSON auth was established; future upgrade and route audit required |
| `js-yaml` | HIGH | Transitive in Swagger runtime and separately in Jest tooling; untrusted YAML parsing CPU DoS | Yes | **RUNTIME_NOT_F02_SPECIFIC**: Swagger documentation dependency, no F02 endpoint accepts YAML; keep as residual and upgrade later |
| `@prisma/config` | HIGH | Transitive through direct `prisma` CLI; configuration object merge | Conditional; audit suggests Prisma `6.12.0` | **DEV_TOOLING_ONLY** execution path, not Prisma Client request path; evaluate upgrade separately |
| `deepmerge-ts` | HIGH | Transitive through `@prisma/config`; recursive object merge stack exhaustion | Conditional with Prisma | **DEV_TOOLING_ONLY** configuration path; evaluate upgrade separately |
| `prisma` | HIGH | Direct dependency, but CLI/migration/generator rather than request-time Prisma Client | Conditional; audit suggests `6.12.0` | **DEV_TOOLING_ONLY** execution path even though listed under production dependencies; separate dependency review |
| `brace-expansion` | HIGH | Transitive build/test tooling glob expansion | Yes | **DEV_TOOLING_ONLY**; future tooling upgrade |
| `browserslist` | HIGH | Transitive build tooling browser-query processing | Yes | **DEV_TOOLING_ONLY**; future tooling upgrade |
| `fast-uri` | HIGH | Transitive development/CLI schema-validation tooling | Yes | **DEV_TOOLING_ONLY**; future tooling upgrade |
| `form-data` | HIGH | Transitive `supertest`/`superagent` test client, multipart field injection | Yes | **DEV_TOOLING_ONLY**; not a backend request parser; future tooling upgrade |
| `@nestjs/swagger` | MODERATE | Direct runtime docs dependency, affected via `js-yaml` | Yes | **RUNTIME_NOT_F02_SPECIFIC** documentation surface; no untrusted YAML accepted by F02 |
| `qs` | MODERATE | Transitive Express/body-parser runtime query parser; also test client | Yes | **RUNTIME_NOT_F02_SPECIFIC** request parsing. One advisory requires an untrusted parse-to-`stringify` round trip; no such F02 auth sink was found. Retain residual risk for other routes |
| `baseline-browser-mapping` | MODERATE | Transitive build tooling data parser | Yes | **DEV_TOOLING_ONLY**; future tooling upgrade |
| `body-parser` | LOW | Transitive Express HTTP body parser; invalid limit configuration DoS | Yes | **RUNTIME_NOT_F02_SPECIFIC**; no invalid dynamic limit configuration identified; review configuration before deployment |
| `@babel/core` | LOW | Transitive Jest/build source-map processing | Yes | **DEV_TOOLING_ONLY**; future tooling upgrade |

The **10 HIGH findings** thus comprise 2 package findings in the Nest HTTP runtime chain (`@nestjs/platform-express`, `multer`), 1 in Swagger's runtime documentation chain (`js-yaml`), and 7 in CLI/build/test paths. These are package findings, not 10 independent exploitable vulnerabilities. No HIGH audit path pointed directly to JWT signing, cookie parsing, authorization logic, or Prisma Client request-time queries. The Nest/Multer chain does affect an installed HTTP runtime package, so it is **not dismissed as harmless**: [Multer's multipart nesting advisory](https://github.com/advisories/GHSA-72gw-mp4g-v24j) describes a request-driven DoS when multipart parsing is invoked. The repository search found no Multer interceptor or multipart F02 IAM route; thus this review did not establish an exploitable path for F02 auth, but neither did it prove global non-exploitability. The [qs advisory](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g) and [js-yaml advisory](https://github.com/advisories/GHSA-h67p-54hq-rp68) are similarly conditional on vulnerable parse/use paths.

**Disposition:** no critical exploitable F02-specific dependency path was established, so the documentary #14 correction does not silently become a dependency-upgrade epic. All 15 findings remain unresolved and require an explicit dependency/security review before production deployment or a new multipart/YAML ingestion route. This is residual risk for independent GATE-F02 evaluation, not a claim that “preexisting” means safe. No `npm audit fix`, `npm update`, package version or lockfile edit was made.
