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
