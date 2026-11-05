# F07-WEB-03 (#25): agricultores vinculados y último envío aceptado. Verificado el 2026-11-05

- **Rama:** `feat/directiva-agricultores-sincronizacion`, desde `origin/main` `5973b49`.
- **Commit de código verificado:** `7fd3365`.
- **Origen:** `Live`. Lo pidió Roderich Rendón el 2026-11-05 para la Web de la defensa.
- **Datos:** sólo sintéticos, en una base PostgreSQL aislada y desechable: contenedor propio `postgres:16` en 127.0.0.1:55520 y una base nueva por suite. No se tocaron la DEMO oficial, sus copias (55500, 55510 y 55511), el móvil ni el PR #172.

## 1. Antecedente de #25

- **Tarjeta antigua:** pedía el estado por agricultor y la «fecha y hora de la última sincronización aceptada», no la de un intento rechazado o pendiente.
- **Decisión del 2026-10-16** ([F07_GATE.md](F07_GATE.md), «Decisiones del 2026-10-16»): sólo se construyó la cobertura agregada («N de M»). El estado por agricultor quedó como **alcance condicionado y no habilitado**, y #25 se cerró con ese alcance.
- **Esta entrega habilita ese alcance** por la petición explícita del 2026-11-05. El texto anterior se conserva como antecedente y no se reescribe.
- **Contrato F06 §5:**
  - permite «el listado de agricultores vinculados … desde IAM con autorización propia», pero «no autoriza unirlo a cantidades individuales»;
  - define `last_sync` como la «hora de aceptación central derivada».
  - La consulta respeta ambas condiciones: nombre desde IAM, fecha desde la aceptación central y ninguna cantidad (véase el §4 para el riesgo que queda).

## 2. Qué evidencia conserva el servidor

| Fuente | ¿Prueba un envío aceptado? | Uso |
|---|---|---|
| `SyncV1OperationJournal` con `outcome = APPLIED` y `serverAcceptedAt` (F05 §7: «aceptación duradera») | **Sí**. Una fila por operación aceptada (`PUBLISH`, `SUPERSEDE` o `CANCEL`). Un reenvío (`ALREADY_APPLIED`) no crea otra fila ni cambia la hora. `CONFLICT` y `REJECTED` tienen `serverAcceptedAt = null` | **Fuente única** de la fecha |
| `SyncV1Contribution.acceptedAt` | Sólo la última aceptación de cada contribución, sin el historial | No se usa |
| `User.lastLoginAt`, `AuthSession`, `ClientRegistration.lastSeenAt` | No: muestran un inicio de sesión o actividad del dispositivo | Excluidas |
| `SyncOperation` (cola heredada, `APLICADA`/`appliedAt`) | No es el contrato vigente (F05, tabla de reutilización: `SyncOperation.appliedAt` = `ADAPT_LATER`) | Excluida |
| `CollectiveRelease.releasedAt` | Es la hora en que se publicó una cifra, no la de un envío | Excluida |

**Qué no existe:**
- un registro de conexión en vivo;
- un registro de intentos que no llegaron al servidor;
- una marca de «sincronización completa» del teléfono.

Por eso sólo hay dos estados, y la fecha se rotula **«Último envío aceptado»**, no «última sincronización». El journal no se purga mientras no exista la garantía de reenvío (F05 §12, `R_CAUSAL`). Si algún día se purgara, un agricultor podría pasar a «Sin registro de sincronización» aunque antes hubiera enviado. Hoy eso no ocurre.

## 3. La consulta

`GET /api/v1/collective/farmers/sync-status`. Es de sólo lectura y responde con `Cache-Control: no-store`.

- **Quién la consulta:** DIRECTIVA o ADMINISTRADOR (ADR-003) del tenant de la credencial. El tenant nunca se toma de la petición.
- **A quién lista:** a los mismos «vinculados» que el denominador de la cobertura: Member `AGRICULTOR` activo con User activo.
- **Orden:** por nombre, nunca por fecha.

Ejemplo **ilustrativo** de la forma (nombres y horas de ejemplo, no salida registrada de una ejecución):

```json
{
  "contractVersion": 1,
  "basis": "SYNC_V1_ACCEPTED_SEND",
  "date_label": "Último envío aceptado",
  "generated_at": "2026-11-05T17:12:30.000Z",
  "farmers": [
    { "display_name": "Ana Sintética", "state": "WITH_ACCEPTED_SENDS", "state_label": "Con envíos aceptados", "last_accepted_send_at": "2026-11-05T17:12:29.481Z" },
    { "display_name": "Bruno Sintético", "state": "NO_SYNC_RECORD", "state_label": "Sin registro de sincronización", "last_accepted_send_at": null }
  ]
}
```

**No devuelve:**
- ids de Member o User, ni correo;
- cantidades, productos, campañas ni tipos de proyección;
- conexión en vivo;
- conteos.

Una lista vacía significa que no hay agricultores vinculados, no «cero».

## 4. Riesgo que queda declarado

La respuesta no incluye cantidades. Aun así, un lector autorizado puede cruzar la hora del último envío aceptado con el cambio de una cifra colectiva y atribuir ese cambio a una persona. El caso más claro es la variante `threshold-only` (PR #204): si la necesidad pasa de 30 L a 38 L y un solo agricultor tiene un envío aceptado en ese intervalo, se deduce que esos +8 L son suyos.

Con la regla vigente de combinaciones, el riesgo es menor, pero la fecha sigue mostrando quién participó y cuándo. Hay dos mitigaciones posibles, ninguna aplicada; las decide Roderich:
- que la Web muestre sólo el día;
- que no se active la variante junto con esta lista.

## 5. Comprobaciones (en `Back/`, sobre `7fd3365`)

| Comando | Resultado | Hora (UTC) |
|---|---|---|
| `F07_WEB_PG_TEST_URL=<base aislada> npx jest f07-web-03-farmer-sync-status.postgres.spec.ts --runInBand` | **5/5** | 2026-11-05 17:12:07–17:12:43Z |
| `npx jest src/modules/collective --testPathIgnorePatterns postgres` | 5 suites, 50/50 | 17:12:43Z |
| `npm run build` | OK | 17:13Z |
| `npx eslint` sobre los 5 archivos tocados | 0 problemas | 17:13:35Z |
| Mutaciones manuales, revertidas con `git checkout` | M1: fechar por cualquier fila del journal (`createdAt`, intentos incluidos): **2 fallan**. M2: quitar el filtro de User inactivo: **1 falla**. M3: quitar el tenant de la consulta: **3 fallan** | 17:14–17:16Z |

**Casos de la suite PostgreSQL** (envíos reales por `POST /sync/v1/push`):
- **Ana:** envío aceptado → «Con envíos aceptados» con la `serverAcceptedAt` del ACK.
  - Su reenvío (`ALREADY_APPLIED`) no mueve la fecha.
  - Un `CANCEL` aceptado posterior sí la mueve.
  - Un rechazo posterior no la mueve.
- **Sin registro de sincronización:**
  - Bruno, que sólo tiene rechazos (referencias ajenas y campaña cerrada);
  - Carla, con `lastLoginAt`, sesión y dispositivo, pero sin envíos;
  - Darío, que sólo tiene una fila heredada `SyncOperation` `APLICADA`;
  - los agricultores del fixture.
- **Forma de la respuesta:**
  - claves exactas;
  - sin cantidad, ids, producto, campaña, tipo ni correo;
  - orden por nombre;
  - no lista a la Directiva, al Administrador, a un Member inactivo, a un User inactivo ni a agricultores de otro tenant.
- **Roles:** ADMINISTRADOR 200, AGRICULTOR 403, sin token o con token inválido 401.
- **Otro sindicato:** la Directiva de B ve sólo a su agricultor, aunque envíe `?tenantId=`, `?tenant_id=` o `X-Tenant-Id` de A; la Directiva de A no ve al agricultor de B ni su fecha.
- **Tenant sin agricultores:** lista vacía.

La CI ejecuta la suite en el job `f07-proposal-postgres` de `.github/workflows/web.yml`.

## 6. Limitaciones

- No hay prueba DEVICE: la fecha procede de los envíos simulados por la API, no de un teléfono.
- Esta rama no incluye la vista Web (Web/React lo hace la sesión de interfaz).
- La fecha abarca todo el sindicato, no una campaña: incluye envíos de cualquier campaña y de los dos tipos.
- No es una revisión de privacidad ni una aprobación. `Gate` y `Evidence` del Project no se cambian aquí.
