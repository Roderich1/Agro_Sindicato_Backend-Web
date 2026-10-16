# F10-SEC-02 (#45), revisión parcial — política de divulgación F07-POL-01

- **Fecha real:** 2026-10-16.
- **Base:** `main` `063437d3ebe7f10110a5faaeee3f052e7d89d100`. Rama `fix/f07-pol-01-revision-temporal`.
- **Alcance:** sólo la regla de divulgación del agregado colectivo (F06 #21 / F07-POL-01 #107).
- **#45 NO queda completa.** Falta revisar los endpoints heredados que exponen datos centrales antiguos a DIRECTIVA y ADMINISTRADOR (ADR-003): `applications`, `reports`, `accounts-payable`, `audit-logs` y `sync` antiguo.
- **Revisión:** técnica automatizada por la sesión de Claude Code, con autorización delegada. No hay inspección personal de Roderich ni revisión del tutor.
- **La divulgación real sigue deshabilitada.** Por defecto el modo es `POLICY_PENDING`; en producción el modo provisional no se activa.

## Modelo de amenaza

- **Adversario considerado:** un lector autorizado (Directiva o Administrador del tenant) que compara cifras de una celda:
  - en el tiempo;
  - antes y después de una reagrupación canónica;
  - entre canales (JSON y CSV).

  Su objetivo es obtener el aporte o el cambio de **un** Member.
- **No considerado:** colusión de k − 1 aportantes, conocimiento externo de valores individuales, señales de actividad (`pending_changes`, retiradas, `data_as_of`, cobertura) y tenants muy pequeños.
- **k = 3 no da anonimato.**

## Hallazgo

La regla anterior tenía dos fallos:
- contaba como «cambiado» a todo Member con **secuencia** nueva, aunque su valor no cambiara;
- comparaba sólo con la **última** cifra.

Consecuencias, reproducidas por la API y descritas antes en el dominio por la revisión del PR #110:

1. **6000 → 6100.**
   - Partida: tres Members con 1000/2000/3000.
   - Uno cambia a 1100; los otros dos sustituyen con el mismo valor.
   - Resultado: tres secuencias nuevas, un solo cambio neto. Se publicaba 6100 y la diferencia aislaba el +100.
2. **Vuelta a una cifra anterior.**
   - Se publica R1 = 10000; cuatro cambios dan R2 = 10400.
   - Tres Members vuelven a su valor de R1, lo que son tres cambios frente a R2.
   - Se publicaba 10100, y R3 − R1 = 100 aislaba el cambio del Member restante.
3. **Sustituciones sin variación y cambios que vuelven** a su valor publicado. Generaban una divulgación nueva o dejaban `pending_changes` sin motivo. No es una fuga, pero es información de actividad innecesaria.

## Reproducción por la API

Casos nuevos en `Back/src/modules/collective/f06-coll-05-collective-aggregate.postgres.spec.ts` (bloque «F10-SEC-02 (#45)»).
- Usan PUBLISH y SUPERSEDE válidos por `POST /api/v1/sync/v1/push`, con predecesores reales.
- Leen el resultado con `GET /summary` y `/summary.csv` como Directiva.
- Corren sobre PostgreSQL desechable propio (`agro_a_pg`, 127.0.0.1:55441).

| Caso | Contra `063437d` (2026-10-16 15:01:56Z) | Con la corrección (15:05:13Z) |
|---|---|---|
| 6000 → 6100 con tres secuencias y un cambio neto | **FALLA**: se publica 6100 | PASS: 6000 con `pending_changes`; el CSV no contiene 6100 |
| Sustituciones con el mismo valor | **FALLA**: divulgación nueva (otro `released_at`) | PASS: la misma divulgación, sin pendientes |
| Un cambio que vuelve a su valor | **FALLA**: queda `pending_changes` | PASS: sin pendientes |
| Volver a los valores de R1 tras R2 | **FALLA**: se publica 10100 | PASS: 10400 con `pending_changes` |
| Reagrupación que sólo añade un Member, y su cierre | PASS (ya se cumplía) | PASS |

**Totales de la suite:** contra `063437d`, 4 fallan y 10 pasan de 14. Con la corrección pasan 14/14.

## Corrección

- **Regla** (`domain/disclosure-policy.ts`):
  - se cuenta el **cambio neto por Member**, como suma de sus aportes en la celda (altas, bajas o cantidad distinta);
  - una cifra nueva sólo se publica si, frente a **cada** divulgación anterior de la celda (retiradas incluidas), no cambió nada o cambiaron al menos k Members;
  - si no, se mantiene la última cifra con `pending_changes`, o se retira si hubo bajas.
- **Datos:**
  - cada fila de una divulgación guarda su cantidad, con la migración `20261016150500_f07_pol_01_release_item_quantity` (expand-only, columna nullable con CHECK ≥ 0);
  - el disparador de inmutabilidad sigue igual;
  - las filas anteriores sin cantidad contaban como cambio, lo que **no** era conservador. Se corrigió después: ver «Hallazgo sobre `0d16f12`».
- **Caso de uso:** carga el historial completo de cada celda y no sólo la última divulgación.
- **Prueba unitaria corregida.** El caso antiguo «tres Members cambiaron» contaba una sustitución de m2 con el mismo valor (7000). Era exactamente el defecto, y ahora m2 cambia de verdad (7500).
- **Canales.**
  - JSON y CSV siguen saliendo de la misma decisión: el CSV del caso 6000 → 6100 no contiene 6100.
  - No hay cambios en la API: `openapi:check` sin deriva.
- **Futura propuesta de compra conjunta (sesión B).**
  - Debe consumir sólo cifras `DISCLOSED` de esta decisión y no incluir cantidades de celdas suprimidas.
  - No puede guardar ni servir cifras por otro camino.
  - La propuesta de política recoge este requisito en R8.

## Verificación (2026-10-16, worktree `_wt/POL-REV`)

| Qué | Resultado |
|---|---|
| `npm run build` | OK, sin `test-support` en `dist` |
| `prisma validate` | válido |
| `eslint src/modules/collective` | sin errores |
| `npm test -- --runInBand` | 32 suites pasan y 8 omitidas; 193 pruebas pasan y 137 omitidas |
| PostgreSQL `f06-coll-05-collective-aggregate` | 14/14 |
| PostgreSQL `product-reconciliation` | 5/5 |
| PostgreSQL `sync-v1-journal` (8 migraciones, la nueva al final) | 30/30 |
| `openapi:check` | snapshots iguales; aserciones F02/F05/F06 |

**Mutaciones** (reemplazo exacto, restauración byte a byte verificada):

| Mutación | Resultado |
|---|---|
| P1: cualquier secuencia nueva cuenta (regla anterior) | detectada (13 fallos) |
| P2: sólo se compara con la última divulgación | detectada |
| P3: las divulgaciones retiradas no cuentan | detectada |
| P4: una cantidad desconocida no cuenta como cambio | detectada. Esa prueba fijaba justo el defecto del hallazgo siguiente; se sustituyó |
| P5: no se guarda la cantidad de cada aporte publicado | detectada (7 fallos en PostgreSQL) |

## Hallazgo sobre `0d16f12`: cantidades históricas NULL (2026-10-16)

**Origen.** Revisión técnica automatizada de Codex sobre el PR #112, transmitida por Roderich con la orden de no fusionar sobre `0d16f12`. No es una revisión personal de Roderich ni del tutor.

**Defecto.**
- La migración `20261016150500` deja en NULL la cantidad de las divulgaciones escritas antes de ella, y la regla de `0d16f12` contaba cada NULL como un cambio demostrado.
- Con una divulgación histórica de 6000 (tres cantidades NULL) y cantidades actuales 1100/2000/3000, la función devolvía RELEASE. Se publicaba 6100, aunque sólo un Member había cambiado: la diferencia revela su +100.
- **Una cantidad desconocida no prueba un cambio.**

**Corrección (`3559784`).**
- Frente a cada divulgación, cada Member se clasifica en:
  - **cambio demostrado:** alta, baja o cantidad conocida distinta;
  - **desconocido:** presente en ambos, con la cantidad publicada en NULL.
- Una cifra nueva sólo se publica si, frente a **cada** divulgación, se demuestra que nada cambió (0 cambios y 0 desconocidos) o que cambiaron al menos k Members (k cambios demostrados). Los desconocidos nunca ayudan a alcanzar el umbral.
- **Si no se puede demostrar:**
  - se mantiene la cifra anterior, con `pending_changes = true` («no se puede demostrar que coincida con los aportes actuales»);
  - o la celda sigue retirada, si su última cifra ya lo estaba;
  - o se retira, si hubo bajas (R4).
- **No se reconstruyen cantidades antiguas con valores actuales.** Tampoco se infiere una cantidad antigua de que la secuencia de un aporte no haya cambiado: sería reconstruirla a partir del valor actual.
- Se corrigen los comentarios del schema y de la migración, que decían «cuenta como cambio». La migración sigue siendo la misma: expand-only, sin valor por defecto ni relleno. Todavía no está fusionada y sólo se aplicó en bases desechables.

**Regresiones.**

1. **Unitaria:** `disclosure-policy.spec.ts`, «F10-SEC-02: an unknown released amount proves no change (rows before the migration)». Cubre:
   - el caso de Codex: 6000 con NULL y actuales 1100/2000/3000 → SHOW_PRIOR con pendientes;
   - los valores iguales a los de entonces, que tampoco se pueden demostrar;
   - una celda ya retirada, que sigue sin cifra;
   - dos altas, que no bastan;
   - tres altas: k cambios demostrados → RELEASE.
2. **PostgreSQL**, en el bloque «F07-POL-01: disclosures written before the quantity migration» de `f06-coll-05-collective-aggregate.postgres.spec.ts`:
   - Crea una base nueva migrada **sólo hasta `20261016043000`**. Los tres aportes 1000/2000/3000 entran por `POST /sync/v1/push`.
   - Escribe la divulgación de 6000 con la misma forma que la escribía el código de `063437d`, sin cantidades. Es un INSERT, que el disparador de inmutabilidad permite. Ninguna fila se modifica por SQL.
   - Ejecuta `prisma migrate deploy`, que aplica la migración nueva y deja las tres cantidades en NULL.
   - Aplica SUPERSEDE válidos 1100/2000/3000 y consulta `/summary` y `/summary.csv` como Directiva.
   - Después dan de alta dos Members, que no bastan, y luego un tercero, que permite publicar 7600 con las seis cantidades guardadas.

| Prueba | Contra `0d16f12` | Con la corrección |
|---|---|---|
| Unitaria (16:13:37Z) | **FALLA**: `RELEASE` en lugar de `SHOW_PRIOR` | PASS |
| PostgreSQL, primera ejecución (16:13:37Z) | **FALLA** antes de los SUPERSEDE: la primera consulta tras migrar volvía a publicar 6000 como cifra nueva (`pending_changes` false) | — |
| PostgreSQL, con la consulta después de los SUPERSEDE (16:16:29Z) | **FALLA**: `total_base` **6100**, `pending_changes` false | PASS (16:20:33Z): 6000 con `pending_changes`; el CSV no contiene 6100; una sola divulgación; 7600 tras la tercera alta |

En la primera ejecución en rojo, la consulta posterior a la migración se hacía antes de los SUPERSEDE y volvía a publicar la misma cifra. La prueba se reordenó para que la primera consulta tras la migración vea 1100/2000/3000, como en el caso de Codex.

**Mutaciones** (16:24:20Z; reemplazo exacto y restauración desde el commit):

| Mutación | Resultado |
|---|---|
| P6: una cantidad desconocida cuenta como cambio (regla de `0d16f12`) | detectada |
| P7: una cantidad desconocida cuenta como igual | detectada |
| P8: los desconocidos suman al umbral k | detectada |

**Verificación** (2026-10-16 entre 16:17Z y 16:30Z, sobre el árbol confirmado en `3559784`):

| Qué | Resultado |
|---|---|
| `prisma validate` / `npm run build` | válido / OK |
| `eslint src/modules/collective` | sin errores |
| `npm test -- --runInBand` | 32 suites pasan y 8 omitidas; 193 pruebas pasan y 138 omitidas (la nueva de PostgreSQL se omite sin URL) |
| PostgreSQL `f06-coll-05-collective-aggregate` | 15/15 |
| PostgreSQL `product-reconciliation` | 5/5 |
| PostgreSQL `sync-v1-journal` | 30/30 (8 migraciones; no cambia) |
| `openapi:check` (base recién migrada) | snapshots iguales; aserciones F02/F05/F06 |

**Límite.** Una celda con una divulgación anterior a la migración en su historial queda congelada en esa cifra, o sin cifra, hasta que al menos k Members cambien de forma demostrable frente a ella. Esto es intencionado.
- No existe un procedimiento de «nueva línea base» y no se propone en este bloque.
- Como la divulgación real sigue deshabilitada, esas divulgaciones antiguas sólo existen con datos sintéticos.

## Límites

- **Colusión.** Contra una colusión de k − 1 aportantes, la protección no cambia.
- **Señales que se mantienen** y quedan documentadas: `pending_changes` y las retiradas revelan que hubo cambios, no cuánto.
- **Coste.** El historial crece con cada divulgación de la celda; la comparación es lineal en su número. Para el volumen del piloto no es un problema medido; no se probó carga.
- **Pendiente de #45:** endpoints heredados, revisión con datos reales y decisión de divulgación real.

## CSV: neutralización de fórmulas (2026-10-16)

**Origen.** La sesión B lo señaló al revisar la frontera privada/colectiva para F07 Web. Revisión técnica automatizada; sin revisión personal de Roderich ni del tutor.

**Defecto.** `summaryCsv` entrecomillaba comas, comillas y saltos de línea, pero no neutralizaba los textos que una hoja de cálculo interpreta como fórmula. Un nombre de producto o de campaña como `=HYPERLINK(...)` se ejecutaba al abrir `summary.csv`. Las cifras y la política no cambiaban; era una inyección en el canal CSV.

**Corrección** (rama `fix/f07-csv-formula`, desde `main` `110b534`):
- un valor que empieza por `=`, `+`, `-`, `@`, tabulador o retorno de carro lleva delante un apóstrofo y va entre comillas;
- las cifras y las fechas nunca empiezan así y no cambian;
- el JSON no cambia.

| Prueba | Contra `110b534` (17:07:19Z) | Con la corrección (17:08:23Z) |
|---|---|---|
| `collective-config.spec.ts` «a name that starts like a formula is neutralized, not executed (CSV injection)» | **FALLA**: el CSV contiene `=1+1` | PASS |
| `npm test -- --runInBand` | — | 32 suites pasan y 8 omitidas; 194 pruebas pasan y 138 omitidas |
| PostgreSQL `f06-coll-05-collective-aggregate` (JSON y CSV con las mismas decisiones) | — | 15/15 |
| `npm run build` / `eslint src/modules/collective` | — | OK / sin errores |
