# F02 final traceability

| Requirement / decision | F02 evidence | Boundary |
|---|---|---|
| OE2 / SRS-IAM-01 / #10 | `F02_IAM_01.md`, Member migration/backfill, F02-D 25/25 | Member is current authorization authority |
| OE5 / SRS-DEVICE-01 / #11 + Mobile #60 | `F02_IAM_02.md`, Mobile `F02_DEVICE_CLIENT_ID_EVIDENCE.md`, final HTTP registration/binding | Client ID is not an authorization secret |
| SRS-IAM-02 / #13 + #12 | `F02_IAM_03.md`, `F02_IAM_04.md`, F02-C 12/12, F02-D 25/25, final HTTP 2/2 | V1 remains compatible; V2 has Session |
| URS-SEC-01 | F02 authorization matrix, threat model, F02-D and final HTTP | runtime identity and scope checks |
| URS-SYNC-01 / SRS-SYNC-02 | Member + ClientRegistration + Session prerequisites | final DTO whitelist, ACK, conflict semantics, binding to SyncOperation, and versioned Sync contract: DELEGATED_F05 |
| DEC-F01-01 / 02 / 04 / 08 / 12 | F01 integration decisions, F01 semantic corrigendum, F02 IAM design and test evidence | no new target capability in #14 |

Mobile main `9e9cb2334eeaa4c710dc87feb7cfa847ea339724` was checked against the F02-B device evidence; PR #61 is merged and issue #60 completed. This reuses that physical evidence; no new physical test or Mobile-to-Backend E2E is claimed. Mobile remote login, JWT handling, secure refresh storage and remote ClientRegistration remain delegated. F05/F06/F07/F09/F10 are not started by this F02 verification.
