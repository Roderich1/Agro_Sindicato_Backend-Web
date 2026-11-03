# F12-EST-07-MOB (Mobile #164): contrato de la copia de la estimación para la app móvil

- **Fecha real:** 2026-11-02 (UTC).
- **Estado:** **implementado** en AppMovilAgroquimico `main` `c2ac44a` (PR Roderich1/AppMovilAgroquimico#180), integrado el 2026-11-03 (UTC). No cambia el contrato INT-09 (`F12_EST_01_ESTIMATION_CONTRACT.md` §9), que es el que manda. Evidencia: `docs/evidence/F12_EST_07_MOB_ESTIMACION_2026-11-02.md` del repositorio Mobile; alcance de las pruebas en §6.
- **Referencia implementada:** la copia de la PWA (F12-EST-07-WEB, #180, `Web/src/lib/estimation-copy.ts`) y `GET /estimation/download` en el servicio.
- **No es una aprobación institucional.**
  - Con datos reales, el perfil `FARMER` solo se entrega cuando la política institucional (F07-POL-01, #107, dentro de las decisiones institucionales de GOV-02, #185) contemple esta proyección (`x-policy-requirement` de la operación).
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

- **Dónde:** SQLite de la app, en Inventario (contrato §9). **Esquema 13**, aditivo e idempotente, tras el 12 de F04-AV:
  - `estimation_copies`: la copia, con el titular que la descargó y el contexto y la generación de cuando se pidió;
  - `estimation_copy_access`: el contexto local (`context_id` aleatorio y generación);
  - `estimation_copy_retirements`: las campañas retiradas por un 404 en un contexto.
- **Una fila por** `(member_ref, tenant_ref, target_campaign_ref)`, con:
  - la respuesta tal como llegó;
  - `downloaded_at`, que se usa para reemplazar;
  - la versión del formato local;
  - la identidad de la sesión que la descargó.
- **Sin credenciales:** ni token, ni PIN, ni clave.
- **Respaldo privado:** queda **fuera** (`storage.backup: EXCLUDED_FROM_PRIVATE_BACKUP`, decisión del autor del 2026-10-31). La exportación del respaldo de F08 borra las tres tablas de la base empaquetada y la compacta con `VACUUM`. La restauración nunca trae copias: después aparece «Sin copia descargada».

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

Lista original, conservada como antecedente (las realizadas están en §6):
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

## 6. Implementación y pruebas realizadas (2026-11-03)

**Código.** AppMovilAgroquimico `main` `c2ac44a` (PR Roderich1/AppMovilAgroquimico#180). Implementación en `c127c45`; código final de `lib/` en `5594599`.

**CI de `main`:** falló en `c2ac44a` (run 41566802912, conservado) por una prueba de pantalla ajena a la copia (`operation_mode_onboarding_test`), que siguió tras una espera agotada sin fallar. La espera se corrigió en Roderich1/AppMovilAgroquimico#181, sin cambios en `lib/`. La CI de `main` pasó en `5b5b318`: run 41577902321, 2233 correctas, 0 fallidas y 4 omitidas. Mobile #164 se cerró sobre `5b5b318`.

**Regla de lectura.** Una copia se lee solo con:
- la instalación activada y la sesión del mismo Member y sindicato que el **titular vigente**;
- el **contexto local vigente**;
- que su campaña no se retirara después de pedirla.

**Retirada persistente, aparte del borrado físico:**
- cerrar la sesión, un 401, 403 o 409, o un perfil que no es FARMER renuevan el contexto;
- un 404 retira esa campaña;
- cambiar de titular la borra en su misma transacción.

Esa escritura va primero. El borrado físico va después y puede quedar pendiente: si **solo** falla el borrado, la copia no reaparece al reiniciar. Si SQLite tampoco admite la retirada, una marca en el almacenamiento seguro impide mostrar cifras hasta completarla. Si el almacenamiento seguro no se puede leer, no se muestra ninguna cifra.

| Procedencia | Qué se comprobó |
|---|---|
| **HOST** (Windows 11, Flutter 3.47.2) | Suite completa 2237/2237 sobre `095684e`. Regresión de reinicio: 5 de 5 fallan sobre `267592a` y pasan corregidas, con fallos de SQLite **inyectados**. Alteraciones de las reglas: fallan todas las válidas |
| **DEVICE con el Backend real** (POCO X5 Pro 5G, Android 12; app aislada `.est164`) | Central propio y desechable de este repositorio (`main` `635cc8f`, datos sintéticos) por un túnel HTTPS temporal. Pasos:<br>• activación;<br>• `/results` FARMER y `/download` 200, sin naive, cobertura ni serie en el JSON guardado;<br>• lectura en modo avión tras cerrar y reabrir;<br>• un producto sin datos suficientes, sin cifra;<br>• **404 y 409 reales**, con la retirada persistente tras reiniciar;<br>• una nueva descarga autorizada.<br>APK de `c127c45` (SHA-256 `281117cb…`) y de `5594599` (`9fab4a7a…`) |
| **DEVICE con servidor simulado** | `integration_test` 5/5, también con el respaldo `.agrobackup` y la restauración en Android |
| **EMULADOR** | No ejecutado |

**Límites que se conservan:**
- **Sesión, no persona:** la copia la lee quien use la sesión del titular.
- **Revocaciones sin conexión:** no se conocen.
- **Fallos de almacenamiento:** solo se inyectaron en HOST.
- **Fallo doble (limitación excepcional del alcance académico, aceptada por el autor el 2026-11-03):** si SQLite y el almacenamiento seguro rechazan ambos la escritura de la retirada, la lectura queda bloqueada durante esa ejecución, pero **la retirada no persiste tras reiniciar**. Sin conexión, la copia anterior puede volver a leerse para la misma identidad hasta la siguiente invalidación que sí se pueda escribir. No es una aprobación de producción ni cambia ningún gate (evidencia Mobile §13).
