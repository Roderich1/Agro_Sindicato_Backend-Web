# E4 — Ejemplos de respuestas (hito A0)

| Campo | Valor |
|---|---|
| Fecha | 2026-11-13 |
| Contrato | [`E4_ACCESO_POR_ROL_Y_SIN_UMBRAL_CONTRATO.md`](E4_ACCESO_POR_ROL_Y_SIN_UMBRAL_CONTRATO.md) («E4») |
| Tipos | `Back/src/modules/joint-purchase-calls/application/call-views.ts` (sección «E4»), `Back/src/modules/joint-purchase-calls/api/rest/calls-openapi.schemas.ts`, `Back/src/modules/collective/api/rest/collective-openapi.schemas.ts` |
| Estado | **Forma de las respuestas.** Los ejemplos están escritos a mano a partir de los tipos y del contrato; no son salidas de un servidor. Las salidas reales irán en la evidencia del Backend. Un cambio posterior de forma es un commit nuevo que lo anuncia. |

Todos los identificadores, nombres y cantidades son sintéticos. Las cantidades van en la unidad base (`ML` o `G`) como cadenas de enteros.

---

## 0. Cadenas exactas de `CONV-4` (Mobile las copia byte a byte)

Fuente: `Back/src/modules/joint-purchase-calls/domain/consent.ts` (`CONSENT_V4_VERSION`, `CONSENT_V4_TEXT`, `CONSENT_V4_HELP`).

Versión:

```text
CONV-4
```

Texto (`consent.text`):

```text
Las personas de Administración habilitadas de su sindicato podrán ver su nombre y las cantidades que solicita para coordinar esta compra conjunta y su entrega. La Directiva podrá consultar los totales por producto, sin el detalle identificado de su participación. Los totales pueden mostrarse aunque participe una sola persona. Esta participación no genera una deuda.
```

Ayuda (`consent.help`):

```text
Aunque el total no muestre nombres, con pocas participaciones podría deducirse cuánto solicitó una persona.
```

Ambas usan «á», «ó», «í» precompuestas (UTF-8, NFC) y no terminan en salto de línea.

## 1. Códigos de error nuevos (lista cerrada, E4 §3)

| Código | HTTP | Rutas | Cuerpo |
|---|---|---|---|
| `GRANT_RETIRED` | 409 | `POST /joint-purchase-calls/{id}/collaborators`, `/collaborators/revoke`, `/collaborators/review` con `grant: "PARTICIPANTS"` | `{"errorCode":"GRANT_RETIRED"}` |
| `SUBSTITUTION_PERMISSION_RETIRED` | 409 | `POST /joint-purchase-substitution-permissions` y `/revoke` | `{"errorCode":"SUBSTITUTION_PERMISSION_RETIRED"}` |
| `CONSENT_VERSION_RETIRED` | 409 | `POST /me/joint-purchase-calls/{id}/participation/consent` con `scope: "COLLABORATORS"` (cualquier versión) o `authorize_responsible: true` | `{"errorCode":"CONSENT_VERSION_RETIRED"}` |
| `APP_UPDATE_REQUIRED` | 409 | Escrituras del agricultor con cabecera de contrato 1, 2 o 3 (o sin cabecera) sobre una participación con alcance `ADMINISTRATION` o `TOTALS_ONLY` | `{"errorCode":"APP_UPDATE_REQUIRED"}` |

Ninguno lleva datos de otras personas. Los dos del agricultor son definitivos: repetir la misma operación (`operation_id` y cuerpo iguales) devuelve el mismo 409. `403 PARTICIPANTS_FORBIDDEN` y `403 SUBSTITUTION_FORBIDDEN` se conservan.

```json
{ "errorCode": "GRANT_RETIRED" }
```

```json
{ "errorCode": "SUBSTITUTION_PERMISSION_RETIRED" }
```

```json
{ "errorCode": "CONSENT_VERSION_RETIRED" }
```

```json
{ "errorCode": "APP_UPDATE_REQUIRED" }
```

```json
{ "errorCode": "PARTICIPANTS_FORBIDDEN" }
```

```json
{ "errorCode": "SUBSTITUTION_FORBIDDEN" }
```

---

## 2. Institucional (`contractVersion: 2`)

Escenario común: convocatoria «Compra conjunta sintética», tenant A, dos productos.
- `P1` (`ML`): dos participaciones con `ADMINISTRATION`.
- `P2` (`G`): una participación con `ADMINISTRATION` y otra con `RESPONSIBLE_ONLY` (consentimiento anterior a E4).

Personas institucionales: Directiva «Directiva sintética D1» (`u-dir-1`), Administración «Administración sintética A1» (`u-adm-1`).

### 2.1 `GET /joint-purchase-calls/{id}` — Directiva, `OPEN`

```json
{
  "contractVersion": 2,
  "call_id": "6f1d6e3a-0000-4000-8000-000000000001",
  "name": "Compra conjunta sintética",
  "status": "OPEN",
  "campaign": { "campaign_ref": "c-0001", "name": "Campaña sintética 2026", "status": "ABIERTA" },
  "deadline_at": "2026-11-20T23:00:00.000Z",
  "opened_at": "2026-11-13T15:00:00.000Z",
  "closed_at": null,
  "cancelled_at": null,
  "cancel_reason": null,
  "created_at": "2026-11-13T14:00:00.000Z",
  "updated_at": "2026-11-13T15:00:00.000Z",
  "server_time": "2026-11-13T16:00:00.000Z",
  "responsible": { "user_ref": "u-dir-1", "name": "Directiva sintética D1", "role": "DIRECTIVA", "eligible": true, "version": 1 },
  "created_by": { "user_ref": "u-dir-1", "name": "Directiva sintética D1" },
  "opened_by": { "user_ref": "u-dir-1", "name": "Directiva sintética D1" },
  "cancelled_by": null,
  "source_proposal_ref": null,
  "participant_count": 3,
  "totals_source": "LIVE",
  "can_view_participants": false,
  "is_responsible": true,
  "can_manage": true,
  "can_cancel_or_close": true,
  "delegations_suspended": false,
  "my_grants": ["MANAGE"],
  "collaborator_count": 0,
  "can_substitute_responsible": false,
  "pending_delegation_reviews": 0,
  "pending_consent_count": 1,
  "responsible_changes": [],
  "products": [
    {
      "position": 0, "product_ref": "p-0001", "name": "Producto sintético P1", "unit": "L", "base_unit": "ML",
      "is_active": true, "reference": null,
      "totals": { "participant_count": 2, "total_quantity_base": "45000", "visibility": "VISIBLE", "totals_basis": "ROLE_CONSENT" }
    },
    {
      "position": 1, "product_ref": "p-0002", "name": "Producto sintético P2", "unit": "KG", "base_unit": "G",
      "is_active": true, "reference": null,
      "totals": { "participant_count": 2, "total_quantity_base": null, "visibility": "PENDING_CONSENT", "totals_basis": null }
    }
  ],
  "origin": null,
  "origin_differs_from_current": false,
  "history": [
    { "at": "2026-11-13T14:00:00.000Z", "kind": "CREATED", "actor": { "user_ref": "u-dir-1", "name": "Directiva sintética D1" }, "detail": "Borrador creado." },
    { "at": "2026-11-13T14:00:00.001Z", "kind": "RESPONSIBLE_ASSIGNED", "actor": { "user_ref": "u-dir-1", "name": "Directiva sintética D1" }, "detail": "Responsable asignado: Directiva sintética D1." },
    { "at": "2026-11-13T15:00:00.000Z", "kind": "OPENED", "actor": { "user_ref": "u-dir-1", "name": "Directiva sintética D1" }, "detail": "Convocatoria abierta." }
  ]
}
```

Notas:
- La responsable es Directiva: coordina (`can_manage`) pero no ve nombres (`can_view_participants: false`), E4 §9.1.
- `P2` tiene una participación anterior, así que en vivo es `PENDING_CONSENT` para todos (regla T, punto 3).
- Un borrador (`DRAFT`, `totals_source: "NONE"`) no tiene participaciones: cada producto sale `{"participant_count":0,"total_quantity_base":"0","visibility":"VISIBLE","totals_basis":"ROLE_CONSENT"}` (ninguna participación que no cubra los totales; el cero es real).

### 2.2 `GET /joint-purchase-calls/{id}` — Administración, `OPEN`

Igual que 2.1, salvo:

```json
{
  "can_view_participants": true,
  "is_responsible": false,
  "can_manage": false,
  "can_cancel_or_close": false,
  "my_grants": [],
  "can_substitute_responsible": false,
  "pending_consent_count": 1
}
```

Los totales son los mismos (`P1` `VISIBLE`/`ROLE_CONSENT`, `P2` `PENDING_CONSENT`): la regla T no depende del rol en vivo.

Si la responsable deja de estar habilitada y la convocatoria no está cancelada, la Administración recibe `"can_substitute_responsible": true` y `"responsible": {..., "eligible": false}`; la Directiva sigue con `false`.

### 2.3 `GET /joint-purchase-calls/{id}` — `CLOSED`, todas las participaciones cubren los totales (`ROLE_CONSENT`)

Para Directiva y Administración (cambian sólo `can_view_participants`, `is_responsible`, `can_manage` y `my_grants`):

```json
{
  "contractVersion": 2,
  "status": "CLOSED",
  "closed_at": "2026-11-20T23:00:00.000Z",
  "participant_count": 1,
  "totals_source": "CLOSING",
  "pending_consent_count": 0,
  "products": [
    {
      "position": 0, "product_ref": "p-0001", "name": "Producto sintético P1", "unit": "L", "base_unit": "ML",
      "is_active": true, "reference": null,
      "totals": { "participant_count": 1, "total_quantity_base": "20000", "visibility": "VISIBLE", "totals_basis": "ROLE_CONSENT" }
    }
  ]
}
```

Una sola persona con `ADMINISTRATION`: el total se ve (E4 §9.3, lo dicen el texto y la ayuda de `CONV-4`).

### 2.4 `GET /joint-purchase-calls/{id}` — `CLOSED`, consolidado anterior: `PREVIOUS_POLICY_K3` y `PENDING_CONSENT`

Producto `P3` congelado con 4 personas: 3 con `RESPONSIBLE_ONLY` y 1 con `ADMINISTRATION`. Producto `P4` congelado con 2 personas con `RESPONSIBLE_ONLY`.

Directiva (no ve a nadie por nombre):

```json
{
  "contractVersion": 2,
  "status": "CLOSED",
  "totals_source": "CLOSING",
  "can_view_participants": false,
  "pending_consent_count": 5,
  "products": [
    {
      "position": 0, "product_ref": "p-0003", "name": "Producto sintético P3", "unit": "L", "base_unit": "ML",
      "is_active": true, "reference": null,
      "totals": { "participant_count": 4, "total_quantity_base": "96000", "visibility": "VISIBLE", "totals_basis": "PREVIOUS_POLICY_K3" }
    },
    {
      "position": 1, "product_ref": "p-0004", "name": "Producto sintético P4", "unit": "KG", "base_unit": "G",
      "is_active": true, "reference": null,
      "totals": { "participant_count": 2, "total_quantity_base": null, "visibility": "PENDING_CONSENT", "totals_basis": null }
    }
  ]
}
```

Administración (ve por nombre a la persona con `ADMINISTRATION` de `P3`, así que restando obtendría la suma de las anteriores):

```json
{
  "contractVersion": 2,
  "status": "CLOSED",
  "totals_source": "CLOSING",
  "can_view_participants": true,
  "pending_consent_count": 5,
  "products": [
    {
      "position": 0, "product_ref": "p-0003", "name": "Producto sintético P3", "unit": "L", "base_unit": "ML",
      "is_active": true, "reference": null,
      "totals": { "participant_count": 4, "total_quantity_base": null, "visibility": "PENDING_CONSENT", "totals_basis": null }
    },
    {
      "position": 1, "product_ref": "p-0004", "name": "Producto sintético P4", "unit": "KG", "base_unit": "G",
      "is_active": true, "reference": null,
      "totals": { "participant_count": 2, "total_quantity_base": null, "visibility": "PENDING_CONSENT", "totals_basis": null }
    }
  ]
}
```

`pending_consent_count` cuenta participaciones (no personas por producto): aquí 5 de las 6 congeladas no tienen `ADMINISTRATION`.

### 2.5 `GET /joint-purchase-calls/{id}/participants` — Administración

```json
{
  "contractVersion": 2,
  "call_id": "6f1d6e3a-0000-4000-8000-000000000001",
  "status": "OPEN",
  "provisional": true,
  "notice": "Lista provisional: puede cambiar hasta el cierre",
  "participant_count": 3,
  "pending_consent_count": 1,
  "pending_consent_notice": "1 participación sin la autorización vigente para que la Administración vea su nombre y cantidades: sus datos no se muestran.",
  "participants": [
    {
      "participation_ref": "7a2b0000-0000-4000-8000-000000000011",
      "name": "Agricultor sintético F1",
      "status": "ACTIVE",
      "accepted_at": "2026-11-13T15:10:00.000Z",
      "lines": [
        { "product_ref": "p-0001", "product_name": "Producto sintético P1", "base_unit": "ML", "quantity_base": "20000" },
        { "product_ref": "p-0002", "product_name": "Producto sintético P2", "base_unit": "G", "quantity_base": "5000" }
      ]
    },
    {
      "participation_ref": "7a2b0000-0000-4000-8000-000000000012",
      "name": "Agricultor sintético F2",
      "status": "ACTIVE",
      "accepted_at": "2026-11-13T15:20:00.000Z",
      "lines": [
        { "product_ref": "p-0001", "product_name": "Producto sintético P1", "base_unit": "ML", "quantity_base": "25000" }
      ]
    }
  ]
}
```

### 2.6 `GET /joint-purchase-calls/{id}/participants` — Directiva (también la responsable, y también con un `PARTICIPANTS` concedido antes)

HTTP 403:

```json
{ "errorCode": "PARTICIPANTS_FORBIDDEN" }
```

Una Administración que deja de estar habilitada (Member, cuenta, rol o tenant) o pasa a Directiva recibe este mismo 403 desde la petición siguiente.

### 2.7 `GET /joint-purchase-calls/{id}/closing` — Administración

```json
{
  "contractVersion": 2,
  "call_id": "6f1d6e3a-0000-4000-8000-000000000002",
  "name": "Compra conjunta sintética cerrada",
  "status": "CLOSED",
  "label": "Consolidado al cierre: cantidades solicitadas",
  "mode": "AUTOMATIC",
  "cutoff_at": "2026-11-20T23:00:00.000Z",
  "closed_at": "2026-11-20T23:00:05.000Z",
  "closed_by": null,
  "participant_count": 2,
  "can_view_participants": true,
  "lines": [
    { "product_ref": "p-0001", "product_name": "Producto sintético P1", "unit": "L", "base_unit": "ML",
      "participant_count": 2, "total_quantity_base": null, "visibility": "PENDING_CONSENT", "totals_basis": null }
  ],
  "participants": [
    {
      "participation_ref": "7a2b0000-0000-4000-8000-000000000021",
      "name": "Agricultor sintético F1",
      "accepted_at": "2026-11-18T10:00:00.000Z",
      "lines": [ { "product_ref": "p-0001", "product_name": "Producto sintético P1", "base_unit": "ML", "quantity_base": "20000" } ]
    }
  ],
  "pending_consent_count": 1,
  "pending_consent_notice": "1 participación sin la autorización vigente para que la Administración vea su nombre y cantidades: sus datos no se muestran."
}
```

### 2.8 `GET /joint-purchase-calls/{id}/closing` — Directiva

Mismo consolidado, sin detalle identificado:

```json
{
  "contractVersion": 2,
  "call_id": "6f1d6e3a-0000-4000-8000-000000000002",
  "name": "Compra conjunta sintética cerrada",
  "status": "CLOSED",
  "label": "Consolidado al cierre: cantidades solicitadas",
  "mode": "AUTOMATIC",
  "cutoff_at": "2026-11-20T23:00:00.000Z",
  "closed_at": "2026-11-20T23:00:05.000Z",
  "closed_by": null,
  "participant_count": 2,
  "can_view_participants": false,
  "lines": [
    { "product_ref": "p-0001", "product_name": "Producto sintético P1", "unit": "L", "base_unit": "ML",
      "participant_count": 2, "total_quantity_base": null, "visibility": "PENDING_CONSENT", "totals_basis": null }
  ],
  "participants": null,
  "pending_consent_count": 1,
  "pending_consent_notice": "1 participación sin la autorización vigente para que la Administración vea su nombre y cantidades: sus datos no se muestran."
}
```

Con 2 personas y una anterior, `P1` queda `PENDING_CONSENT` también para la Directiva (regla T: el punto 2 exige 3 o más).

### 2.9 `GET /joint-purchase-calls/{id}/collaborators` — con historia retirada

```json
{
  "contractVersion": 2,
  "call_id": "6f1d6e3a-0000-4000-8000-000000000001",
  "status": "OPEN",
  "responsible": { "user_ref": "u-dir-1", "name": "Directiva sintética D1" },
  "can_grant": true,
  "can_review": true,
  "responsible_version": 1,
  "collaborators": [
    {
      "user_ref": "u-dir-2", "name": "Directiva sintética D2", "role": "DIRECTIVA",
      "grants": [
        { "grant": "MANAGE", "label": "Administrar la convocatoria", "granted_at": "2026-11-13T15:30:00.000Z",
          "granted_by": { "user_ref": "u-dir-1", "name": "Directiva sintética D1" }, "status": "IN_FORCE", "responsible_version": 1 }
      ]
    }
  ],
  "retired_grants": [
    {
      "grant": "PARTICIPANTS", "label": "Consultar participantes y cantidades",
      "user": { "user_ref": "u-dir-1", "name": "Directiva sintética D1" },
      "granted_at": "2026-11-12T15:00:00.000Z", "granted_by": null, "responsible_version": 1,
      "retired": true, "notice": "Permiso de visualización retirado el 2026-11-13; no da acceso."
    },
    {
      "grant": "PARTICIPANTS", "label": "Consultar participantes y cantidades",
      "user": { "user_ref": "u-adm-1", "name": "Administración sintética A1" },
      "granted_at": "2026-11-12T16:00:00.000Z", "granted_by": { "user_ref": "u-dir-1", "name": "Directiva sintética D1" }, "responsible_version": 1,
      "retired": true, "notice": "Permiso de visualización retirado el 2026-11-13; no da acceso."
    }
  ],
  "history": [
    { "at": "2026-11-12T16:00:00.000Z", "action": "GRANTED", "grant": "PARTICIPANTS",
      "user": { "user_ref": "u-adm-1", "name": "Administración sintética A1" }, "actor": { "user_ref": "u-dir-1", "name": "Directiva sintética D1" },
      "retired": true, "notice": "Permiso de visualización retirado el 2026-11-13; no da acceso." },
    { "at": "2026-11-13T15:30:00.000Z", "action": "GRANTED", "grant": "MANAGE",
      "user": { "user_ref": "u-dir-2", "name": "Directiva sintética D2" }, "actor": { "user_ref": "u-dir-1", "name": "Directiva sintética D1" },
      "retired": false, "notice": null }
  ]
}
```

La fecha de `notice` es la de la migración de E4 en ese entorno (`_prisma_migrations.finished_at`), en `AAAA-MM-DD` (UTC).

### 2.10 `GET /joint-purchase-substitution-permissions` — sólo lectura

```json
{
  "contractVersion": 2,
  "retired_at": "2026-11-13T18:00:00.000Z",
  "notice": "Ya no se usa: sustituye la Administración habilitada",
  "can_grant": false,
  "holders": [
    { "user_ref": "u-dir-2", "name": "Directiva sintética D2", "role": "DIRECTIVA",
      "granted_at": "2026-11-12T19:00:00.000Z", "granted_by": { "user_ref": "u-adm-1", "name": "Administración sintética A1" },
      "reason": "Cobertura sintética de vacaciones" }
  ],
  "history": [
    { "at": "2026-11-12T19:00:00.000Z", "action": "GRANTED",
      "user": { "user_ref": "u-dir-2", "name": "Directiva sintética D2" }, "actor": { "user_ref": "u-adm-1", "name": "Administración sintética A1" },
      "reason": "Cobertura sintética de vacaciones" }
  ]
}
```

`POST` y `POST /revoke` responden `409 {"errorCode":"SUBSTITUTION_PERMISSION_RETIRED"}` y no escriben nada.

### 2.11 `POST /joint-purchase-calls/{id}/responsible` (sustitución)

Mismo cuerpo de petición que P-A (`request_id`, `expected_responsible_version`, `new_responsible_ref`, `reason`, `confirmed`). La respuesta 200 es el detalle de 2.1/2.2 con la versión nueva. Una Directiva, aunque tenga un permiso «Sustituir responsable» concedido antes, recibe `403 {"errorCode":"SUBSTITUTION_FORBIDDEN"}`. Los demás errores de P-A no cambian (`409 RESPONSIBLE_STILL_ELIGIBLE`, `409 RESPONSIBLE_CHANGED` con `responsible_version`, `409 REQUEST_ID_REUSED`, `409 INVALID_TRANSITION` en `CANCELLED`, `422 SUCCESSOR_NOT_ELIGIBLE`).

---

## 3. Agricultor (contrato 4)

Cabecera del teléfono: `X-Joint-Purchase-Contract: 4`.

### 3.1 `GET /me/joint-purchase-calls`

Servida con esta forma a **todos** los contratos (1, 2, 3, 4 o sin cabecera), E4 §7.1.

```json
{
  "contractVersion": 4,
  "server_time": "2026-11-13T16:00:00.000Z",
  "consent": {
    "version": "CONV-4",
    "text": "Las personas de Administración habilitadas de su sindicato podrán ver su nombre y las cantidades que solicita para coordinar esta compra conjunta y su entrega. La Directiva podrá consultar los totales por producto, sin el detalle identificado de su participación. Los totales pueden mostrarse aunque participe una sola persona. Esta participación no genera una deuda.",
    "help": "Aunque el total no muestre nombres, con pocas participaciones podría deducirse cuánto solicitó una persona."
  },
  "calls": [
    {
      "call_id": "6f1d6e3a-0000-4000-8000-000000000001",
      "name": "Compra conjunta sintética",
      "status": "OPEN",
      "campaign": { "campaign_ref": "c-0001", "name": "Campaña sintética 2026" },
      "opened_at": "2026-11-13T15:00:00.000Z",
      "deadline_at": "2026-11-20T23:00:00.000Z",
      "closed_at": null,
      "cancelled_at": null,
      "server_time": "2026-11-13T16:00:00.000Z",
      "accepts_operations": true,
      "responsible": { "name": "Directiva sintética D1" },
      "products": [
        { "product_ref": "p-0001", "name": "Producto sintético P1", "unit": "L", "base_unit": "ML" },
        { "product_ref": "p-0002", "name": "Producto sintético P2", "unit": "KG", "base_unit": "G" }
      ],
      "participation": {
        "status": "ACTIVE",
        "lines": [ { "product_ref": "p-0002", "base_unit": "G", "quantity_base": "4000" } ],
        "last_sequence": 2,
        "last_operation_id": "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed",
        "accepted_at": "2026-11-13T15:40:00.000Z",
        "consent": { "version": "CONV-3", "accepted_at": "2026-11-12T20:00:00.000Z", "received_at": "2026-11-12T20:00:02.000Z" },
        "consent_scope": { "scope": "RESPONSIBLE_ONLY", "version": "CONV-3", "decided_at": "2026-11-12T20:00:00.000Z", "received_at": "2026-11-12T20:00:02.000Z", "sequence": 0 }
      },
      "closing": null
    }
  ],
  "history": { "older_count": 0 }
}
```

Una participación con `consent_scope.scope` distinto de `ADMINISTRATION` y `TOTALS_ONLY` es «anterior»: la app ofrece «Revisar quién puede ver mi participación».

### 3.2 `GET /me/joint-purchase-calls/history`

```json
{
  "contractVersion": 4,
  "server_time": "2026-11-13T16:00:00.000Z",
  "consent": { "version": "CONV-4", "text": "…(texto de §0)…", "help": "…(ayuda de §0)…" },
  "calls": [
    {
      "call_id": "6f1d6e3a-0000-4000-8000-000000000003",
      "name": "Compra conjunta sintética de 2025",
      "status": "CLOSED",
      "campaign": { "campaign_ref": "c-0000", "name": "Campaña sintética 2025" },
      "opened_at": "2025-03-01T12:00:00.000Z",
      "deadline_at": "2025-03-10T23:00:00.000Z",
      "closed_at": "2025-03-10T23:00:04.000Z",
      "cancelled_at": null,
      "server_time": "2026-11-13T16:00:00.000Z",
      "accepts_operations": false,
      "responsible": { "name": "Directiva sintética D1" },
      "products": [ { "product_ref": "p-0001", "name": "Producto sintético P1", "unit": "L", "base_unit": "ML" } ],
      "participation": {
        "status": "ACTIVE",
        "lines": [ { "product_ref": "p-0001", "base_unit": "ML", "quantity_base": "10000" } ],
        "last_sequence": 1,
        "last_operation_id": "9c858901-8a57-4791-81fe-4c455b099bc9",
        "accepted_at": "2025-03-05T09:00:00.000Z",
        "consent": { "version": "CONV-1", "accepted_at": "2025-03-05T09:00:00.000Z", "received_at": "2025-03-05T09:00:01.000Z" },
        "consent_scope": { "scope": "RESPONSIBLE_ONLY", "version": "CONV-1", "decided_at": "2025-03-05T09:00:00.000Z", "received_at": "2025-03-05T09:00:01.000Z", "sequence": 0 }
      },
      "closing": {
        "cutoff_at": "2025-03-10T23:00:00.000Z",
        "closed_at": "2025-03-10T23:00:04.000Z",
        "included": true,
        "lines": [ { "product_ref": "p-0001", "base_unit": "ML", "quantity_base": "10000" } ]
      }
    }
  ],
  "next_cursor": null
}
```

### 3.3 `PUT /me/joint-purchase-calls/{id}/participation` — primera confirmación con `CONV-4`

Petición:

```json
{
  "operation_id": "3f0e4c4a-5d1b-4e8b-9a77-2c1e0b6f9a01",
  "sequence": 1,
  "consent": { "version": "CONV-4", "accepted_at": "2026-11-13T16:05:00.000Z" },
  "lines": [ { "product_ref": "p-0001", "quantity_base": "20000" } ]
}
```

Respuesta 200 (contrato 4):

```json
{
  "outcome": "ACCEPTED",
  "participation": {
    "status": "ACTIVE",
    "lines": [ { "product_ref": "p-0001", "base_unit": "ML", "quantity_base": "20000" } ],
    "last_sequence": 1,
    "last_operation_id": "3f0e4c4a-5d1b-4e8b-9a77-2c1e0b6f9a01",
    "accepted_at": "2026-11-13T16:05:01.000Z",
    "consent": { "version": "CONV-4", "accepted_at": "2026-11-13T16:05:00.000Z", "received_at": "2026-11-13T16:05:01.000Z" },
    "consent_scope": { "scope": "ADMINISTRATION", "version": "CONV-4", "decided_at": "2026-11-13T16:05:00.000Z", "received_at": "2026-11-13T16:05:01.000Z", "sequence": 0 }
  }
}
```

Con `CONV-1`, `CONV-2` o `CONV-3` (operación guardada antes de actualizar) la participación se crea con el alcance de su texto (`RESPONSIBLE_ONLY` o `COLLABORATORS`), nunca como `CONV-4` (E4 §7.2, §9.9).

### 3.4 `POST …/participation/consent` — «Revisar quién puede ver mi participación» (`ADMINISTRATION`)

Petición (la `sequence` es el orden propio de las decisiones de consentimiento de esa participación, mayor que `consent_scope.sequence`):

```json
{
  "operation_id": "5d7c2b9e-1f3a-4c6d-8e9f-0a1b2c3d4e5f",
  "sequence": 1,
  "scope": "ADMINISTRATION",
  "consent": { "version": "CONV-4", "decided_at": "2026-11-13T16:10:00.000Z" }
}
```

Respuesta 200:

```json
{
  "outcome": "ACCEPTED",
  "participation": {
    "status": "ACTIVE",
    "lines": [ { "product_ref": "p-0002", "base_unit": "G", "quantity_base": "4000" } ],
    "last_sequence": 2,
    "last_operation_id": "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed",
    "accepted_at": "2026-11-13T15:40:00.000Z",
    "consent": { "version": "CONV-3", "accepted_at": "2026-11-12T20:00:00.000Z", "received_at": "2026-11-12T20:00:02.000Z" },
    "consent_scope": { "scope": "ADMINISTRATION", "version": "CONV-4", "decided_at": "2026-11-13T16:10:00.000Z", "received_at": "2026-11-13T16:10:01.000Z", "sequence": 1 }
  }
}
```

Las cantidades, `last_sequence`, `accepted_at` y el `consent` inicial no cambian. Errores:
- otra versión que no sea `CONV-4` → `409 {"errorCode":"CONSENT_REQUIRED"}`;
- en `CANCELLED` → `409 {"errorCode":"WIDENING_NOT_ALLOWED","status":"CANCELLED"}`;
- con `authorize_responsible` → `400 {"errorCode":"PAYLOAD_INVALID"}`;
- sin participación → `409 {"errorCode":"PARTICIPATION_REQUIRED"}`;
- `sequence` no mayor que la última aceptada → `409 {"errorCode":"STALE_SEQUENCE","participation":{…la vigente…}}`.

Vale en `OPEN` y `CLOSED`, sin depender del plazo.

### 3.5 `POST …/participation/consent` — «Retirar la autorización» (`TOTALS_ONLY`)

Petición:

```json
{
  "operation_id": "8e1f2a3b-4c5d-4e6f-9a0b-1c2d3e4f5a6b",
  "sequence": 2,
  "scope": "TOTALS_ONLY",
  "consent": { "version": "CONV-4", "decided_at": "2026-11-13T17:00:00.000Z" }
}
```

Respuesta 200 (sólo cambia `consent_scope`):

```json
{
  "outcome": "ACCEPTED",
  "participation": {
    "status": "ACTIVE",
    "lines": [ { "product_ref": "p-0002", "base_unit": "G", "quantity_base": "4000" } ],
    "last_sequence": 2,
    "last_operation_id": "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed",
    "accepted_at": "2026-11-13T15:40:00.000Z",
    "consent": { "version": "CONV-3", "accepted_at": "2026-11-12T20:00:00.000Z", "received_at": "2026-11-12T20:00:02.000Z" },
    "consent_scope": { "scope": "TOTALS_ONLY", "version": "CONV-4", "decided_at": "2026-11-13T17:00:00.000Z", "received_at": "2026-11-13T17:00:01.000Z", "sequence": 2 }
  }
}
```

Se acepta con cualquier versión conocida (`CONV-1` a `CONV-4`), en `OPEN` y `CLOSED`; en `CANCELLED` → `409 WIDENING_NOT_ALLOWED`.

### 3.6 `POST …/participation/consent` — ampliar o autorizar (retirado)

Petición de una app anterior (o de una operación guardada):

```json
{
  "operation_id": "0f9e8d7c-6b5a-4c3d-8e2f-1a0b9c8d7e6f",
  "sequence": 1,
  "scope": "COLLABORATORS",
  "consent": { "version": "CONV-3", "decided_at": "2026-11-12T21:00:00.000Z" },
  "responsible_version": 1,
  "authorize_responsible": true
}
```

Respuesta 409 (definitiva; el mismo `operation_id` con el mismo cuerpo devuelve lo mismo):

```json
{ "errorCode": "CONSENT_VERSION_RETIRED" }
```

No se escribe ninguna decisión ni cambia el alcance.

### 3.7 Escrituras de los contratos 1, 2 y 3 (E4 §7.2)

- Sobre una participación inexistente o con alcance anterior: se aceptan como hoy y se responden **en la forma de su contrato** (`toLegacyFarmerBody`, `toContract2FarmerBody` o la forma 3 con `responsible_authorization`), con un alcance del enum anterior. Ejemplo (contrato 3, confirmación con `CONV-3`):

```json
{
  "outcome": "ACCEPTED",
  "participation": {
    "status": "ACTIVE",
    "lines": [ { "product_ref": "p-0001", "base_unit": "ML", "quantity_base": "15000" } ],
    "last_sequence": 1,
    "last_operation_id": "c56a4180-65aa-42ec-a945-5fd21dec0538",
    "accepted_at": "2026-11-13T16:20:01.000Z",
    "consent": { "version": "CONV-3", "accepted_at": "2026-11-13T16:20:00.000Z", "received_at": "2026-11-13T16:20:01.000Z" },
    "consent_scope": { "scope": "RESPONSIBLE_ONLY", "version": "CONV-3", "decided_at": "2026-11-13T16:20:00.000Z", "received_at": "2026-11-13T16:20:01.000Z", "sequence": 0 },
    "responsible_authorization": { "authorized": true, "version": 1 }
  }
}
```

  `responsible_authorization` se conserva en esa forma porque la app del contrato 3 la exige y se calcula como antes (E4 §4.3: `consentResponsibleVersion` queda como historia); desde E4 no da acceso a nadie. Sólo una participación creada con `CONV-4` lo deja en `null`.
- Sobre una participación con alcance `ADMINISTRATION` o `TOTALS_ONLY`: `409 {"errorCode":"APP_UPDATE_REQUIRED"}` antes de decidir.
- Ampliar o autorizar: `409 {"errorCode":"CONSENT_VERSION_RETIRED"}`.
- Un 2xx a un contrato 1–3 nunca lleva `ADMINISTRATION` ni `TOTALS_ONLY`.

---

## 4. Colectivo (`F07-POL-02` y lo sellado con `F07-POL-01`)

### 4.1 `GET /collective/campaigns/{campaignId}/summary` — campaña sin sellar, `F07-POL-02` activa

```json
{
  "contractVersion": 1,
  "campaign": { "campaign_ref": "c-0001", "name": "Campaña sintética 2026", "status": "ABIERTA" },
  "seal": null,
  "disclosure": { "mode": "PROVISIONAL_SYNTHETIC", "policy": "F07-POL-02", "approved": false, "threshold": null },
  "coverage": { "linked_members": 12, "members_with_contribution": 3, "suppressed_cells": false },
  "cells": [
    {
      "projection_type": "DECLARED_NEED", "product_ref": "p-0001", "product_name": "Producto sintético P1",
      "base_unit": "ML", "presentation_unit": "L", "status": "DISCLOSED",
      "total_base": "12500", "total_presentation": "12.5", "contributors": 1,
      "data_as_of": "2026-11-13T14:00:00.000Z", "released_at": "2026-11-13T16:00:00.000Z", "pending_changes": false
    },
    {
      "projection_type": "DECLARED_NEED", "product_ref": "p-0002", "product_name": "Producto sintético P2",
      "base_unit": "G", "presentation_unit": "KG", "status": "DISCLOSED",
      "total_base": "0", "total_presentation": "0", "contributors": 2,
      "data_as_of": "2026-11-13T14:30:00.000Z", "released_at": "2026-11-13T16:00:00.000Z", "pending_changes": false
    }
  ]
}
```

Sin `COLLECTIVE_DISCLOSURE_POLICY` (o con `F07-POL-01`) la respuesta sigue como antes: `"policy": "F07-POL-01"`, `"threshold": 3` y `SUPPRESSED_UNDER_THRESHOLD` por debajo de 3 aportantes. Con `POLICY_PENDING`: `"threshold": null`, `"coverage": null`, `"cells": []`, y `policy` la configurada.

### 4.2 `GET /collective/campaigns/{campaignId}/summary` — campaña sellada con `F07-POL-01`

Aunque `F07-POL-02` esté activa, lo sellado se sirve con su política:

```json
{
  "contractVersion": 1,
  "campaign": { "campaign_ref": "c-0000", "name": "Campaña sintética 2025", "status": "CERRADA" },
  "seal": {
    "seal_ref": "9b2e0000-0000-4000-8000-000000000031",
    "version": 1,
    "sealed_at": "2026-10-30T12:00:00.000Z",
    "accepted_until": "2026-10-30T12:00:00.000Z",
    "sealed_by": { "user_ref": "u-dir-1", "name": "Directiva sintética D1", "role": "DIRECTIVA" },
    "policy": "F07-POL-01",
    "threshold": 3
  },
  "disclosure": { "mode": "PROVISIONAL_SYNTHETIC", "policy": "F07-POL-01", "approved": false, "threshold": 3 },
  "coverage": { "linked_members": 12, "members_with_contribution": 4, "suppressed_cells": true },
  "cells": [
    {
      "projection_type": "CONSUMPTION_TOTAL", "product_ref": "p-0001", "product_name": "Producto sintético P1",
      "base_unit": "ML", "presentation_unit": "L", "status": "DISCLOSED",
      "total_base": "84000", "total_presentation": "84", "contributors": 4,
      "data_as_of": "2026-10-29T18:00:00.000Z", "released_at": "2026-10-30T11:59:00.000Z", "pending_changes": false
    },
    {
      "projection_type": "CONSUMPTION_TOTAL", "product_ref": "p-0002", "product_name": "Producto sintético P2",
      "base_unit": "G", "presentation_unit": "KG", "status": "SUPPRESSED_UNDER_THRESHOLD",
      "total_base": null, "total_presentation": null, "contributors": null,
      "data_as_of": null, "released_at": null, "pending_changes": false
    }
  ]
}
```

`SUPPRESSED_UNDER_THRESHOLD` es aquí un estado histórico (no hay cifra que recuperar). La Web lo rotula «Sin cifra según la política anterior (mínimo de 3 aportantes)».

Un sellado nuevo con `F07-POL-02` lleva `"policy": "F07-POL-02", "threshold": null` en `seal` y en `disclosure`.

### 4.3 Borradores de propuesta y tendencias

- `GET /collective/proposals/{proposalId}`: `disclosure.policy` es la del borrador (`F07-POL-01` para los anteriores a E4; `F07-POL-02` para los generados con la política nueva activa). Las líneas `SUPPRESSED_UNDER_THRESHOLD` de un borrador anterior siguen sin cifra.
- `GET /collective/trends`: cada `campaigns[].seal` lleva su `policy` y su `threshold` sellados; `disclosure` es la política configurada (`threshold: null` con `F07-POL-02`).

### 4.4 Estimación

`GET /estimation/runs/{runId}` y `/results`: `disclosure.threshold` es `3` en las ejecuciones anteriores (con `policy: "F07-POL-01"`) y `null` en las ejecutadas con `F07-POL-02`. La vigencia de un punto ya no exige 3 aportantes; sólo que su entrada sellada siga `DISCLOSED` y visible.
