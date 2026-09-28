# F02 OpenAPI diff

Baseline: `931c7e565d51d669f0a1111c947beef25f2ca57c`. The baseline specification was generated from the unmodified Swagger metadata, then compared structurally with the final generated specification. Only the final snapshot is versioned at `docs/api/openapi-f02.json`.

| Comparison | Result |
|---|---|
| Baseline SHA-256 | `0824486E2CB0F01689755389667AF60BB237E6EB1FC7DF3AF97688FA57FCF52D` |
| Initial PR final SHA-256 (HEAD `50175a1`) | `7CF1EB4831ECF5DEBDF8FE6A8BBD8925EF68E941766F08A1DC927B5F1471A864` |
| Corrective-review final SHA-256 | `539E41558D6D8C4FC99273A8588DAD1C6DEC6166DD884EEB0F3733F80EC962BB` |
| Paths added / removed | 0 / 0 |
| Operations changed | 12 IAM operations, metadata and response schemas only |
| Schemas added | 0 named components; IAM responses have inline schemas |
| Security schemes added | `refresh_token` V1 cookie; existing Bearer and `refresh_token_v2` retained |
| Business endpoint removals | 0 |

The changed operations are V1 login/refresh/logout/me, V2 login/refresh/logout/me/session-client, and ClientRegistration create/list/revoke. The global description now distinguishes current central contracts from legacy compatibility endpoints. V1 and V2 response shapes, cookie/body semantics, relevant status codes, and bearer security are explicit. The generator shares `createOpenApiDocument` with runtime Swagger; `npm run openapi:check` regenerates and compares the entire document and runs contract assertions. No product version was invented: `info.version` remains `0.1.0`.

The baseline was generated as a temporary local artifact, not committed. No paths or methods were removed.

## Corrective review

The review updated no path or method (added/removed: **0/0**). It completed the 200 response schema for `GET /api/v1/auth/v2/me` and the 201 response schema for `POST /api/v1/auth/v2/session/client`. Login/refresh/me now reuse one TypeScript context schema with required account, member, tenant, role and session fields and their required nested fields. The session status is documented as `ACTIVE` in successful context responses because current-context validation rejects revoked or compromised sessions; those values remain valid database states. V1 nested tenant fields are now required. V2 refresh/logout body is explicitly optional, with cookie-or-BODY alternatives documented without changing runtime behavior. The contract guard asserts these schemas and nested requirements.
