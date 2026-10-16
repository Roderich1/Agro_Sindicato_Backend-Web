# Oráculo D4 (F06) reutilizado por F07

Copias literales, sin cambios, de los CSV escritos a mano para la reconciliación D4:

| Archivo | Origen | SHA-256 |
|---|---|---|
| `F06_EXPECTED_CONTRIBUTIONS.csv` | `Roderich1/AppMovilAgroquimico` `docs/evidence/`, commit `74d5539bbb5789f19d854a804536ee97df573858` (`main`) | `66b41b8c224600414edf20ba62e7cb4747bd62209c9970863189db6b4646bca6` |
| `F06_EXPECTED_CELLS.csv` | ídem | `3773a250dcc45125deba5afe7a3d5fbcd2d1212a8c10a7896b3f5aa803fe71d6` |

Evidencia original: [`docs/evidence/F06_RECONCILIATION.md`](../../../../../../docs/evidence/F06_RECONCILIATION.md). Datos sintéticos (F1–F3, campañas C1/C2). `f07-web-proposal.postgres.spec.ts` publica estas aportaciones por `POST /sync/v1/push` y compara el resumen y la propuesta con las etapas RAW y CANONICAL.
