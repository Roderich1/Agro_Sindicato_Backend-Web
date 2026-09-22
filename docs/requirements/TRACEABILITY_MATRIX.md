# Matriz de trazabilidad F01

Esta matriz formaliza `Project/OE → URS → SRS → decisión → fase/issue → verificación`. `BASELINED` significa especificado y revisable, no implementado ni probado.

| OE | URS | SRS | ADR / Decision | Phase | GitHub Issue | Verification target | Status |
|---|---|---|---|---|---|---|---|
| OE1 | Conjunto URS F01 | Conjunto SRS F01 | ADR-001; DEC-F01-01–12 | F01 | #7, #8, #9 | REVIEW, TRACE | BASELINED |
| OE3 | URS-MOB-01 | SRS-MOB-01, SRS-COLL-02 | ADR-001; DEC-F01-06 | F04/F05/F06 | Mobile #24–#31/#34; #81 | REVIEW, UNIT, DEVICE | BASELINED |
| OE3 | URS-MOB-02 | SRS-MOB-01, SRS-COLL-01, SRS-PRIV-01 | ADR-001; DEC-F01-07/08/12 | F05/F06 | Backend #20/#81; Mobile #29–#33 | UNIT, INT, DEVICE, SECURITY | BASELINED |
| OE3/OE4 | URS-MOB-03 | SRS-COLL-02, SRS-JP-01 | ADR-001; DEC-F01-06/11 | F06/F07 | Backend #20/#26; Mobile #34 | CONTRACT, INT, E2E | BASELINED |
| OE3 | URS-MOB-04 | SRS-MOB-01, SRS-SYNC-01, SRS-SYNC-02 | ADR-001; DEC-F01-03/04/05 | F05 | Backend #16–#18; Mobile #29–#31 | UNIT, DEVICE, RECONCILIATION | BASELINED |
| OE2/OE4/OE5 | URS-SYNC-01 | SRS-DEVICE-01, SRS-SYNC-01, SRS-SYNC-02, SRS-COLL-01, SRS-TRANS-01 | ADR-001; DEC-F01-02/03/04/05/07/12 | F02/F05/F06 | #11, #16–#21, #42, #81 | CONTRACT, INT, E2E, SECURITY, RECONCILIATION | BASELINED |
| OE4 | URS-WEB-01 | SRS-WEB-01, SRS-COLL-03, SRS-IAM-02 | ADR-001; DEC-F01-07/08 | F02/F06/F07 | #12, #20, #23–#25, #81 | CONTRACT, E2E, SECURITY, USABILITY | BASELINED |
| OE4 | URS-JP-01 | SRS-COLL-02, SRS-JP-01, SRS-JP-02 | ADR-001; DEC-F01-06/11 | F06/F07 | #20, #26–#28 | UNIT, CONTRACT, E2E, REVIEW | BASELINED |
| OE2/OE4/OE5 | URS-PRIV-01 | SRS-COLL-01, SRS-COLL-03, SRS-PRIV-01, SRS-AUDIT-01 | ADR-001; DEC-F01-07/08/09 | F06/F10 | #20, #44–#45, #81 | REVIEW, CONTRACT, SECURITY, E2E | BASELINED |
| OE2/OE5 | URS-BKP-01 | SRS-IAM-02, SRS-BKP-01, SRS-BKP-02, SRS-TRANS-01 | ADR-001; DEC-F01-08/09/10/12 | F09/F10 | #37–#41, #46; Mobile #35–#36 | BACKUP_RESTORE, SECURITY, DEVICE, E2E | BASELINED |
| OE3 | URS-VOICE-01 | SRS-VOICE-01, SRS-PRIV-01 | ADR-001 | PRE-VOICE/EVO | Mobile #10–#17 | UNIT, DEVICE, SECURITY, USABILITY | BASELINED |
| OE2/OE4/OE5 | URS-SEC-01 | SRS-IAM-01, SRS-IAM-02, SRS-DEVICE-01, SRS-AUDIT-01 | ADR-001; DEC-F01-01/02/08/09 | F02/F06/F10 | #10–#14, #20, #44–#45 | REVIEW, UNIT, INT, SECURITY | BASELINED |
| OE4/OE5 | URS-REP-01 | SRS-COLL-03, SRS-PRIV-01, SRS-REP-01 | ADR-001; DEC-F01-07/08/09 | F06/F07/F10 | #20, #28, #45/#47 | CONTRACT, E2E, SECURITY, USABILITY | BASELINED |

## Cobertura SRS

Los 19 SRS aparecen al menos una vez en la matriz: `SRS-IAM-01/02`, `SRS-DEVICE-01`, `SRS-MOB-01`, `SRS-SYNC-01/02`, `SRS-COLL-01/02/03`, `SRS-WEB-01`, `SRS-JP-01/02`, `SRS-PRIV-01`, `SRS-AUDIT-01`, `SRS-BKP-01/02`, `SRS-VOICE-01`, `SRS-REP-01` y `SRS-TRANS-01`.

## Reglas de lectura

- Issues sin prefijo de repositorio pertenecen a `Roderich1/Agro_Sindicato_Backend-Web`.
- `Mobile #N` pertenece a `Roderich1/AppMovilAgroquimico`.
- Una verificación futura no acredita PASS hasta existir evidencia independiente.
- #81 coordina la transición y permanece bloqueado; esta matriz no inicia su ejecución.
