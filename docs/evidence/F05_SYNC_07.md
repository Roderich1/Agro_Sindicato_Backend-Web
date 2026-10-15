# Evidencia F05-SYNC-07 — referencias centrales para la vinculación móvil

Issue [#106](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/106). Endpoint de solo lectura con las referencias centrales (`campaign_ref`, `product_ref`) de las campañas y los productos del tenant del agricultor, para que Mobile vincule de forma explícita sus registros locales (contrato F06 §2 y §6).

Ejecución con Claude Code el 2026-10-15 (America/La_Paz). No es un PASS de GATE-F05 (#19).

## 1. Identidad de la ejecución

| Elemento | Valor |
| --- | --- |
| Rama | `feat/f05-sync-v1-push` (base `main` `d3911cea7c5a68decbb0ea0e970129efd553c38c`) |
| Commits | `0ed30b6318de423d6a2f63df787d2f7a7261ca57` (endpoint); `6a86c57c948e2f07422dd56abddaf2cc487cfd83` (refresh V2 real en el recorrido completo); `74bc47378cd310787654199d432c3e2392f8ec92` (sin escrituras ni cuerpo en logs; Member o cuenta inactivos); `a8e1cd7bb87c8a88ee55a51d5d36a0c0f7c4cb0a` (429 documentado); `720d1af0977ca7f74c8b9c585ff19abfb2b9bb52` (LF del snapshot); `db870043f072cb42bf3a5d7c1d83cdc196c0ae40` (el check OpenAPI exige la forma cerrada) |
| Prueba | `Back/src/modules/sync-v1/sync-v1-references.postgres.spec.ts`, 7 pruebas contra la aplicación Nest real y PostgreSQL 16 desechable, en una base nueva migrada desde cero |
| Comando | `cd Back && F05_SYNC_07_PG_TEST_URL=<servidor desechable> npx jest sync-v1-references.postgres.spec.ts --runInBand` |
| Resultado | **7/7** sobre `74bc473` y sobre el código final `db87004`. Sin la variable, la suite se omite (`describe.skip`), y eso no cuenta como PASS; esta evidencia registra la ejecución real. CI la ejecuta en cada push |
| Datos | Sintéticos. La contraseña del recorrido completo es sintética y no se registra |

## 2. Qué se implementó

`GET /api/v1/sync/v1/references`, con el mismo `SyncV1AuthGuard` que push y GET de operación (AGRICULTOR activo, Member, cuenta y tenant activos, sesión Auth V2 vinculada a un ClientRegistration vigente). El tenant sale de la sesión.

Respuesta cerrada (`additionalProperties: false` en OpenAPI):

| Bloque | Campos |
| --- | --- |
| Raíz | `contractVersion` (1), `campaigns`, `products` |
| Campaña | `campaign_ref`, `name`, `status`, `start_date`, `end_date` (cierre o fecha estimada de fin), `accepts_contributions` (`ABIERTA` e `isActive`, F06 §6) |
| Producto | `product_ref`, `name`, `unit` (unidad central), `base_unit` (`ML`/`G` sólo para `L`/`KG`; si no, null), `is_active`, `linkable` |

Orden estable: campañas por fecha de inicio descendente, productos por nombre, y el id como desempate. Sin escrituras ni logs. `Cache-Control: no-store`.

## 3. Criterios de aceptación de #106

| Criterio | Prueba | Resultado |
| --- | --- | --- |
| Sólo campañas y productos del tenant A, con exactamente la whitelist, sin `currentStock`, `minimumStock`, `safetyDataSheetUrl`, `safetyInstructions`, `qrCodeValue`, `notes`, `createdById`, `closedById`, lotes ni movimientos | «returns only the effective tenant's campaigns and products, with exactly the whitelist» | PASS. Las claves se comparan de forma exacta por objeto. Ni el texto completo ni los valores sembrados (QR, nota interna, URL de ficha) aparecen |
| Los datos del tenant B no aparecen; un `tenantId` en query, cabecera o cuerpo no amplía el ámbito | «isolates tenants …» | PASS. Un agricultor de B que envía el tenant A en query, en `X-Tenant-Id` y en el cuerpo recibe sólo lo de B |
| Token ausente o inválido: 401 sin datos | «401 without a valid credential …» | PASS. 401 AUTH_REQUIRED con el cuerpo cerrado |
| Cuenta o Member inactivos, o ClientRegistration revocado: «401 sin datos» | ídem | **PASS con 403**, por el contrato §9. Ver la discrepancia 1 |
| Usuario sin rol AGRICULTOR: 403 sin datos | ídem | PASS. Directiva y Administrador reciben 403 AUTH_CONTEXT_FORBIDDEN |
| Producto con unidad central distinta de `L`/`KG`: sin `base_unit` y no vinculable, sin conversión | «declares which campaigns admit contributions and which products are linkable» | PASS. `unidad` da `base_unit: null` y `linkable: false`. `kg` del catálogo da `G` (sólo se normaliza la caja) |
| Campaña cerrada o inactiva: no admite contribuciones | ídem | PASS. `CERRADA` da `accepts_contributions: false` y `end_date` igual al cierre |
| Dos consultas sin cambios en el catálogo: referencias idénticas | «gives identical references …, writes nothing and logs no body» | PASS |
| Ninguna consulta crea ni modifica registros; logs y auditoría sin el cuerpo de la respuesta | ídem | PASS. Campañas, productos, journal, contribuciones y auditoría quedan iguales. Ningún log (log, warn, error, debug, verbose) contiene nombres ni referencias de la respuesta |
| Recorrido completo con el login real | «end to end with the real login path: V1 login, client registration, V2 login, binding, refs, push and refresh» | PASS. Antes de vincular la sesión al registro: 403. Después: referencias, push APPLIED, refresh V2 real, y el mismo push da ALREADY_APPLIED con un solo journal |
| Límite real (matriz C29) | «C29 real rate limit › 429 RATE_LIMITED with Retry-After …» | PASS. 429 con el cuerpo cerrado y `Retry-After` mayor que 0 |

### Mutaciones

Cada mutación se aplicó con un reemplazo exacto en `src/`. Después se ejecutó esta suite y se restauró el archivo byte a byte, comprobando su SHA-256.

| Mutación | Resultado |
| --- | --- |
| E9 referencias sin filtro de tenant | detectada (2 pruebas) |
| E5 registro revocado admitido | detectada (ejecutada junto con la suite adversarial) |
| E6 Directiva y Administrador admitidos | detectada (ejecutada junto con la suite adversarial) |
| E19 la respuesta se escribe en el log | detectada |
| E20 el guard ignora el Member inactivo | detectada |

## 4. OpenAPI

- `docs/api/openapi-f05-sync-v1.json` es el subconjunto F05 (push, GET de operación y referencias), generado del mismo documento que `docs/api/openapi-f02.json`.
- `npm run openapi:check` comprueba que los dos snapshots no tengan deriva. Además, `scripts/openapi-contract.cjs` exige para `/references`:
  - bearer;
  - las respuestas 200, 401, 403 y 429;
  - desde `db87004`, `additionalProperties: false` y exactamente las claves de la whitelist en la raíz, en cada campaña y en cada producto.
- Resultado sobre `db87004`: «OpenAPI snapshots match generated documents.», «F02 OpenAPI contract assertions passed.», «F05 Sync v1 OpenAPI contract assertions passed.». Se ejecutó con `DATABASE_URL` y secretos JWT sintéticos, como en CI. Sin esas variables, el script sale con código 1 sin mensaje.
- Para probar esas aserciones se alteró una copia de los dos snapshots (`additionalProperties: true` en productos): la aserción falló. Después se restauraron los archivos, con el mismo SHA-256.
- Hallazgos corregidos durante esta entrega:
  - Antes de `a8e1cd7`, las dos consultas no declaraban 429, aunque el límite es global y C29 lo produce sobre `/references`.
  - Antes de `720d1af`, el snapshot F05 no tenía `eol=lf` en `.gitattributes`. En Windows con `core.autocrlf=true`, el check local marcaría deriva.

## 5. Discrepancias con #106 (gana el contrato)

1. **401 frente a 403.** #106 pide 401 para una cuenta o un Member inactivos o un registro revocado. El contrato Sync v1 §9 da 401 AUTH_REQUIRED sólo cuando la credencial falta, es inválida o expiró, y 403 AUTH_CONTEXT_FORBIDDEN cuando el contexto está revocado o inactivo, con la disposición KEEP_FOR_RECONCILIATION. Se aplica el contrato en las tres rutas v1, para que Mobile trate igual todas las llamadas: con 403 se detiene y no reintenta el refresh en bucle.
2. **Nombre del archivo OpenAPI.** #106 proponía `docs/api/openapi-f05-sync-references.json`. Se usa `openapi-f05-sync-v1.json` porque reúne las tres rutas v1. La ruta (`/api/v1/sync/v1/references`) quedaba para el PR.
3. **Ubicación de las pruebas.** #106 proponía `api/rest/sync-v1-references.controller.spec.ts` y `infrastructure/sync-v1-references.postgres.spec.ts`. Hay una sola suite, `sync-v1-references.postgres.spec.ts` en `src/modules/sync-v1/`, que prueba el controlador real por HTTP contra PostgreSQL. No hay una prueba unitaria aparte del controlador con mocks.
4. **Brief D2.** El brief listaba sólo las campañas abiertas. #106 devuelve todas, con `accepts_contributions`; se siguió #106.

## 6. Limitaciones

- La vinculación en Mobile (F05-SYNC-08) no está implementada; este endpoint es su precondición.
- La normalización de unidades sólo iguala mayúsculas y minúsculas (`kg` → `KG`). Otros símbolos (`lt`, `Kg.`) dan `base_unit: null` y no son vinculables hasta que la Directiva corrija el catálogo. No hay heurística.
- El límite es el global de la aplicación (20 por minuto y origen) y lo comparte con push.

## 7. Revisiones

- Ejecución automatizada: Claude Code, 2026-10-15.
- Revisión de Roderich Rendón: pendiente.
- Revisión del tutor: se registra aparte, por entregable o gate, en GOV-01.
