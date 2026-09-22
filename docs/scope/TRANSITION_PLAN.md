# Plan de transición controlada

Regla invariable: ningún `DROP` ocurre en la misma entrega que introduce el reemplazo. Cada fase conserva un punto de rollback y requiere evidencia antes de avanzar.

| Phase | Outcome | Exit evidence | Rollback point |
|---|---|---|---|
| PHASE 0 — baseline | Alcance, datos, contratos y riesgos inventariados | Baseline revisada y ADR-001 ACCEPTED | Revertir sólo la PR documental |
| PHASE 1 — expand | URS/SRS y decisiones F01 formalizados; detalles implementables asignados | Requisitos BASELINED y DEC-F01-01–12 congeladas | Mantener contratos legacy sin expansión |
| PHASE 2 — parallel API/contracts | Contratos versionados de proyección, ACK, propuesta y backup metadata | Contract tests y documentación | Deshabilitar ruta nueva mediante configuración; legacy sigue operativo |
| PHASE 3 — controlled backfill | Proyección mínima derivada con lote, métricas y auditoría | Conteos, hashes/reconciliación y muestra revisada | Borrar/revertir sólo proyección nueva conforme a retención; origen intacto |
| PHASE 4 — Flutter switch | Mobile emite/consume contrato nuevo | Pruebas offline, idempotencia, conflicto y dispositivo | Volver cliente a contrato anterior sin perder outbox |
| PHASE 5 — Web switch | Web usa vistas colectivas y deja CRUD de agricultor | Roles, privacidad y aceptación Directiva | Volver lecturas Web; escrituras legacy aún controladas |
| PHASE 6 — block legacy writes | Escrituras privadas centrales rechazadas de forma explícita | Telemetría sin consumidores legítimos y runbook | Rehabilitación temporal y auditada |
| PHASE 7 — reconciliation | Divergencias resueltas y autoridades coherentes | Informe de diferencias y aceptación | Restaurar snapshot/proyección, nunca sobreescribir Mobile sin decisión |
| PHASE 8 — retention/export | Exportación, backup y plazos ejecutables | Export probado y aprobación de retención | Extender retención; no borrar si falla evidencia |
| PHASE 9 — contract/remove legacy | Retiro selectivo de rutas/tablas sólo después de precondiciones | Cero consumidores, backups, migración reversible revisada | Restaurar release/schema previo según runbook |
| PHASE 10 — final validation | Alcance, seguridad, sync, Mobile y Web validados | Gates y evidencia real | No promover release; conservar versión anterior |

## Controles transversales

- #81 permanece bloqueado hasta que la arquitectura y contratos responsables estén aprobados.
- Cada cambio separa lectura, escritura, backfill y eliminación.
- Los datos privados no se copian para “facilitar” migraciones.
- Las propuestas colectivas no crean inventario, deuda, pago ni compra individual.
- Un rollback preserva outbox, idempotency keys y auditoría.
