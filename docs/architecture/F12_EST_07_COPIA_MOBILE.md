# F12-EST-07-MOB (Mobile #164): contrato de la copia de la estimación para la app móvil

- **Fecha real:** 2026-11-02 (UTC).
- **Estado:** **especificado, no implementado**. Este documento fija lo que usará Mobile #164 cuando se construya. No cambia el contrato INT-09 (`F12_EST_01_ESTIMATION_CONTRACT.md` §9), que es el que manda.
- **Referencia implementada:** la copia de la PWA (F12-EST-07-WEB, #180, `Web/src/lib/estimation-copy.ts`) y `GET /estimation/download` en el servicio.
- **No es una aprobación institucional.**
  - Con datos reales, el perfil `FARMER` solo se entrega cuando la política institucional (GOV-02, #107) contemple esta proyección (`x-policy-requirement` de la operación).
  - Hoy solo hay datos sintéticos (`PROVISIONAL_SYNTHETIC`).

## 1. Petición

| Campo | Valor |
|---|---|
| Ruta | `GET /api/v1/estimation/download?target_campaign_ref=<uuid>` |
| Autenticación | Bearer de la sesión V2 de la instalación. El servidor revalida en la base, en cada petición, la cuenta, el Member, el sindicato y la sesión |
| Ámbito | El sindicato del Member autenticado. El cliente nunca envía `tenantId` |
| Perfil | Lo decide el servidor según el rol vigente: `FARMER` para el Agricultor, `INSTITUTIONAL` para la Directiva y el Administrador |
| Caché HTTP | `Cache-Control: no-store`. La única copia es la del almacén de §3 |

## 2. Respuesta (`FarmerDownload`, INT-09 v1)

**Campos obligatorios:**
- `contract_version` (1), `kind` (`ESTIMATION_DOWNLOAD`) y `profile` (`FARMER`);
- `scope.tenant_ref` y `subject` (`member_ref`, `role`);
- `downloaded_at` (hora del servidor);
- `target` (la campaña objetivo, que es el período) y `season`;
- `results[]`, con:
  - `product`, `base_unit` y `presentation_unit`;
  - `status`, `reason_code` y `method`;
  - `run_ref`, `generated_at` y `span_length`;
  - `estimate_base`;
  - `validity_reason` y `validity_at_download`;
- `may_be_outdated` (siempre `true`), `notice` y `storage`.

**Qué no trae:** ni `naive_base` ni `coverage`. Tampoco puntos de la serie, aportes ni cifras privadas de otros agricultores. El servicio lo prueba en PostgreSQL y en el recorrido real de la Web: `download-perfiles.json` de `docs/evidence/f12_est_07/`.

**Cantidades:** son texto exacto en la unidad base (mL o g). La estimación lleva hasta 6 decimales (EST-D-07).
- Se presentan sin pasar por números de coma flotante, como en `Web/src/lib/quantity.ts`.
- Una cifra `null` es una ausencia: nunca se muestra como cero.

## 3. Almacén local

- **Dónde:** SQLite de la app, en Inventario (contrato §9). Será el esquema 13 si integra después de F04-AV.
- **Una fila por** `(member_ref, tenant_ref, target_campaign_ref)`, con:
  - la respuesta tal como llegó;
  - `downloaded_at`, que se usa para reemplazar;
  - la versión del formato local;
  - la identidad de la sesión que la descargó.
- **Sin credenciales:** ni token, ni PIN, ni clave.
- **Respaldo privado:** queda **fuera** (`storage.backup: EXCLUDED_FROM_PRIVATE_BACKUP`, decisión del autor del 2026-10-31). La exportación del respaldo de F08 debe excluir esta tabla, y una restauración nunca debe traer copias.

## 4. Reglas del cliente

**Identidad (`subject` y `scope`):**
- Se guarda **solo** si, al responder, la sesión de la instalación sigue siendo la que hizo la petición.
- `subject.member_ref` y `scope.tenant_ref` deben coincidir con ella.
- Una respuesta que llegue después de un cambio de sesión **no se guarda para nadie**. En la Web lo prueban `saveCopy` y el recorrido con la descarga retenida.

**Reemplazo:** solo por una descarga con `downloaded_at` posterior, de la misma identidad y la misma campaña (`NEWER_SAME_SUBJECT_AND_SCOPE`).

**Descarte:**
- Al cerrar la sesión y al cambiar de identidad o de titular (`discard_on`).
- Cuando el servidor responde:
  - **401** (sesión), **403** (permiso) o **409 `POLICY_PENDING`** (política): se borran las copias de esa identidad;
  - **404** (campaña inexistente o de otro sindicato): se retira la de esa campaña. La retirada del acceso se registra de forma persistente **antes** del borrado físico, que puede fallar o quedar pendiente; una recarga o una escritura tardía no la reactivan, y solo una descarga posterior autorizada por el servidor habilita otra copia (como en la PWA, `F12_EST_07_WEB_2026-11-02.md` §7).
- La copia **nunca** se ofrece como alternativa a un rechazo.

**Sin conexión:** se muestra la copia del contexto, si existe. Si no existe, se informa que no hay estimación disponible, **sin cifras**.

**Qué se muestra siempre:**
- la fecha de generación de cada resultado (`generated_at`), la fecha de descarga y el período;
- la vigencia **al descargar** (`validity_at_download` con su motivo), separada de la vigencia **actual**, que es desconocida sin conexión;
- el aviso de posible desactualización: sin conexión no se conocen revocaciones, cambios de política ni cambios de fuentes.

**Qué requiere conexión:** descargar y actualizar. La copia no es una autorización vigente.

## 5. Pruebas previstas para #164

Son orientativas, porque todavía no hay código:
- **Lectura sin conexión** con la copia: fechas, período, vigencia al descargar y aviso.
- **Sin copia:** el aviso sin cifras.
- **Otra identidad u otro titular** en el mismo teléfono: no ve la copia.
- **Cierre de sesión:** la copia se borra.
- **Respuesta tardía** durante un cambio de sesión: no se guarda.
- **Rechazos** 401, 403 y 409: la copia se retira.
- **Perfil `FARMER`:** sin naive ni cobertura.
- **Respaldo privado:** no contiene la tabla.
- **Fidelidad:** de cifras, unidades y ausencias.

Siguiendo la regla del proyecto, la evidencia deberá indicar su procedencia: HOST, EMULADOR o DEVICE, con el modelo cuando aplique.
