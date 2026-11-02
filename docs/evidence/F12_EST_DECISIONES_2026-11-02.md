# EST-D-08, EST-D-10 y EST-D-12: decisión del autor y contraste con el código — evidencia

| Campo | Valor |
|---|---|
| Fecha real | 2026-11-02 (UTC) |
| Decisión | Aprobadas por Roderich en la sesión de trabajo del 2026-11-02, con las precisiones que se citan abajo. **No autoriza fusiones ni cierres de issues.** EST-D-10 **no** es la aprobación institucional de GOV-02 (#107) |
| Rama | `feat/f12-est-05-runs` (PR #190), sobre `05e2b3a` |
| Procedencia | **HOST**: Windows 11 Home 10.0.26200, Node 25.9.0. PostgreSQL 16.13 **desechable** en Docker (`agro_f12_est06_pg`, con `--rm`), solo con datos sintéticos |
| Evidencia anterior | `F12_EST_05_PROCESO_2026-11-02.md` §1 registraba las tres decisiones como pendientes. Era cierto en esa fecha y no se reescribe |

## 1. Decisiones registradas (contrato §11.1)

- **EST-D-08.** Una ejecución posterior calculada sustituye a la anterior; una fallida, no. El resultado anterior solo se entrega conforme a su vigencia, sus fuentes y los permisos actuales. No se reutilizan cifras anteriores como si pertenecieran a una ejecución nueva con datos insuficientes.
- **EST-D-10.** Mientras la política requerida esté pendiente, se bloquean con 409 las solicitudes, las lecturas de cifras y la descarga. Los trabajos en cola detienen su procesamiento conforme al contrato, y antes de reanudarlos se vuelven a comprobar las condiciones aplicables. No es la aprobación institucional de GOV-02.
- **EST-D-12.** Los cambios de fuentes, de clasificación o de la composición de la temporada desactualizan los resultados, incluida una campaña clasificada después. Si una fuente pierde la autorización, además no se entregan las cifras afectadas, SES y naive incluidos.

**Cambios en el contrato:**
- las tres pasan de §11.2 a §11.1, y §11.2 queda sin pendientes;
- §3 (punto 5) y §8 las citan como decididas;
- el §3 añade la nueva comprobación al reanudar y que EST-D-10 no aprueba GOV-02;
- revisión «octava».

## 2. Contraste: contrato, código y pruebas

| Precisión | Código | Prueba antes | Resultado |
|---|---|---|---|
| EST-D-08: una ejecución posterior calculada sustituye; una fallida, no | `estimation-reads.use-case.ts` (cadena y selección de `/results`), `domain/validity.ts` | Sí: «supersedes with a later calculated run, never with a later failed one» | Coincide |
| EST-D-08: el resultado anterior solo según su vigencia, fuentes y permisos actuales | Vigencia derivada al leer, retirada de cifras y permiso en cada petición | Sí: vigencias, retirada y permiso perdido | Coincide |
| EST-D-08: una ejecución nueva con datos insuficientes no reutiliza la cifra anterior | `/results` toma, por producto, la última ejecución calculada que lo incluye, con su propio estado | **No había prueba** | Coincide; **prueba añadida** |
| EST-D-10: 409 en solicitudes y lecturas de cifras | `requirePolicy` en lecturas; validación de la petición | Sí | Coincide. La descarga sigue sin implementarse, pero su especificación ya responde 409 |
| EST-D-10: los trabajos en cola se detienen | Parada `POLICY_PENDING` antes de calcular | Sí | Coincide |
| EST-D-10: antes de reanudar se vuelven a comprobar las condiciones | Cada intento (`attempt`, `fail`) vuelve a observar el permiso, la política y la campaña | **No había prueba** del intento retomado | Coincide; **prueba añadida** |
| EST-D-12: cambios de fuentes, clasificación o composición de la temporada, incluida una campaña clasificada después | Huella de las fuentes actuales (`SOURCES_CHANGED`) y versiones de clasificación (`CLASSIFICATION_CORRECTED`) | Sí: campaña nueva, asociación, corrección | Coincide |
| EST-D-12: una fuente que pierde la autorización no entrega SES ni naive | `figuresWithheld`: estimación, naive, α y criterio nulos; el punto se entrega `HIDDEN` | Sí: retirada después del sellado | Coincide |

**No hay diferencias de comportamiento entre lo aprobado y lo implementado.** Faltaban dos pruebas, ahora añadidas a `f12-est-05-runs.postgres.spec.ts`:
- **EST-D-08.** Fungicida estimado (6000 mL, `CURRENT`). Después se clasifica una campaña sin sellar entre las fuentes y el objetivo, y una ejecución nueva da `INSUFFICIENT_DATA` (`LAST_RELEVANT_CAMPAIGN_NOT_VERIFIED`).
  - `/results` entrega el resultado de la ejecución nueva, sin cifras (`estimate_base` y `naive_base` nulos, `NOT_USABLE`/`NO_FIGURE`).
  - La anterior se sigue leyendo en su propia ejecución como `SUPERSEDED`.
- **EST-D-10.** El primer intento falla con un error transitorio (P2034 inyectado) mientras la política pasa a pendiente.
  - El intento 2 vuelve a observar las condiciones y termina `NOT_EXECUTED`/`POLICY_PENDING`, sin ejecución y sin volver a calcular: el cálculo se alcanzó una sola vez.

## 3. Verificación

```text
npx jest f12-est-05-runs.postgres.spec.ts --runInBand   → «Tests: 16 passed, 16 total»
```

**Las dos pruebas fallan de verdad.** Dos alteraciones, una por caso, restauradas después:

| Alteración | Resultado |
|---|---|
| La consulta elige la ejecución más antigua | 4 pruebas fallan, entre ellas la nueva de EST-D-08 |
| Un intento retomado no vuelve a comprobar las paradas | Solo falla la nueva de EST-D-10: era una carencia real de cobertura |

El código de producción no cambia: sigue siendo el de `dc84f0a`. Solo cambian la prueba y la documentación. La CI del PR se registra en el PR.
