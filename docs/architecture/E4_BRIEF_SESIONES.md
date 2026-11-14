# E4 — Encargos de las sesiones A (Backend), B (Web) y C (Mobile)

| Campo | Valor |
|---|---|
| Fecha | 2026-11-13 |
| Contrato | [`E4_ACCESO_POR_ROL_Y_SIN_UMBRAL_CONTRATO.md`](E4_ACCESO_POR_ROL_Y_SIN_UMBRAL_CONTRATO.md) («E4»). Las decisiones de E4 §0 no las reabre ninguna sesión: una duda o una discrepancia se anota y se lleva al orquestador. |
| Reparto de archivos | [`E4_IMPACTO_POR_ARCHIVO.md`](E4_IMPACTO_POR_ARCHIVO.md). Cada archivo tiene un solo dueño. |
| Bases | Backend y Web: rama `feat/acceso-rol-sin-k`, desde el commit que añade este documento o uno posterior (contrato `e0a41c7`, notas `a8ebcdf`). Mobile: rama `feat/acceso-rol-sin-k-mob` desde `507efc8`. El orquestador asigna los worktrees dentro de `_wt/`. |

---

## 1. Reglas comunes

### 1.1 Recursos

- **Un solo proceso pesado a la vez en la máquina** (`nest build`/`tsc`, suites PostgreSQL, `vitest`, `vite build`, `flutter test`, `flutter analyze`, Gradle). Antes de lanzar uno, se pide turno al orquestador.
- **Servidores sólo en los puertos asignados:**
  - **A:** API de pruebas en `3400`, con PostgreSQL en `15440` (contenedor y base propios de la sesión);
  - **B:** Vite en `5184`;
  - **C:** **sin emulador** hasta que lo coordine el orquestador.
  - Ningún otro puerto ni servidor.
- Los servidores se detienen por puerto o PID. **Nunca** se lee la línea de comandos del proceso padre de la API: expone secretos.
- En Windows, borrar `tsbuildinfo` antes de `nest build`. En la Web, `vitest` con `--no-file-parallelism`. Las suites PostgreSQL necesitan su URL y bases propias, que no se comparten con otras sesiones.

### 1.2 Reglas de `CLAUDE.md` (obligatorias)

1. **No fabricar evidencia.** Evidencia en `docs/evidence/` con SHA, comando, salida resumida, fecha real y, si aplica, el modelo del dispositivo. Decide la cobertura real, no sólo que las pruebas pasen.
2. **No retro-fechar.** Lo hecho antes se describe como «verificado el <fecha real> sobre <sha>».
3. **Gates:** la sesión redacta y deja `Gate = Pending` + `Status = Validation`. Sólo Roderich pone Passed, Failed o Waived.
4. **Lenguaje:** prohibido «Prompt NN», «auditoría independiente» y «aprobado por el sistema».
5. **PR** con `Closes #N` o `Refs Roderich1/<repo>#N`. No se fusiona sin el visto bueno de Roderich. **No hay push** salvo que el orquestador lo indique.
6. **No borrar** issues, ítems ni ramas ajenas.
7. **Trazabilidad** sólo con RU, RN, CU, RF, RNF, INT y DAT. E4 cita RF-24, RNF-05 y RU-18/RU-19; los demás IDs los confirma Roderich.
8. **Operaciones masivas** (más de 5 cambios en GitHub): primero un dry-run y esperar aprobación.
9. **Secretos:** nunca en archivos, logs, evidencias ni commits. Siempre por variables de entorno.
10. **Autoría:** la identidad git configurada de Roderich1, **sin** trailers `Co-Authored-By`, «Generated with Claude Code» ni enlaces de sesión. Comprobar con `git log -1 --format=%B` antes de cualquier push.
11. Si un encargo contradice un contrato F05/F06, gana el contrato. F06 §5 ya está enmendado por decisión del autor (E4 §0, D-00).

### 1.3 Lo que **no** cambia en ninguna sesión

- Compras privadas, inventarios, aplicaciones y consumo individual: no se amplía el acceso de Administración a ellos.
- Métodos y requisitos de la estimación F12.
- `POLICY_PENDING` en producción: la divulgación de datos reales sigue sin aprobar (#107).
- La palabra «anónimo» no se usa. Se dice «totales sin nombres» o «datos agregados».

---

## 2. Sesión A — Backend, migraciones, contratos de API y pruebas de autorización

### 2.1 Hito A0: lo que A publica primero, para que B y C trabajen

Un commit propio, antes de cualquier lógica, con:
- `Back/src/modules/joint-purchase-calls/application/call-views.ts`: las interfaces del contrato institucional v2 y del contrato 4 del agricultor;
- `Back/src/modules/joint-purchase-calls/api/rest/calls-openapi.schemas.ts` y `Back/src/modules/collective/api/rest/collective-openapi.schemas.ts`;
- `Back/src/modules/joint-purchase-calls/domain/consent.ts`, con el texto y la ayuda **definitivos** de `CONV-4` (C los copiará byte a byte);
- `Back/src/modules/joint-purchase-calls/domain/call-error.ts`, con los cuatro códigos nuevos;
- el documento NUEVO `docs/architecture/E4_EJEMPLOS_RESPUESTAS.md`, con un ejemplo JSON por respuesta, rol y caso:
  - detalle para Directiva y para Administración: `OPEN`, `CLOSED` con `ROLE_CONSENT`, `CLOSED` con `PREVIOUS_POLICY_K3` y `PENDING_CONSENT`;
  - `/participants` y `/closing` para Administración y el 403 de la Directiva;
  - colaboradores con historia retirada y `GET` de permisos de sustitución de sólo lectura;
  - cuerpos de los 409 nuevos;
  - lista e historia del agricultor (contrato 4);
  - respuestas de una decisión `ADMINISTRATION`, `TOTALS_ONLY` y `CONSENT_VERSION_RETIRED`;
  - resumen con `F07-POL-02` y campaña sellada con `F07-POL-01`.

A comunica el SHA de A0 al orquestador. Un cambio posterior de forma es un commit nuevo que lo anuncia.

### 2.2 Alcance

E4 §2–§8 en el servidor:
- matriz por rol;
- endpoints de permisos retirados (`GRANT_RETIRED`, `SUBSTITUTION_PERMISSION_RETIRED`) e historia de sólo lectura;
- sustitución por Administración habilitada sin permiso, conservando todas las validaciones de P-A;
- consentimiento `CONV-4` con `ADMINISTRATION` y `TOTALS_ONLY`;
- regla T;
- contrato 4 y compatibilidad de E4 §7, con `CONSENT_VERSION_RETIRED` y `APP_UPDATE_REQUIRED`;
- `F07-POL-02` con activación explícita y trazada (`COLLECTIVE_DISCLOSURE_POLICY` y `CollectiveDisclosurePolicyActivation`);
- trazas de política en divulgaciones, sellados, borradores y ejecuciones;
- `stillDisclosed` sin recuento.

Archivos: `E4_IMPACTO_POR_ARCHIVO.md` §2. A es también dueño de `docs/architecture/E4_*` y de las notas de sustitución.

### 2.3 Pruebas mínimas

- E4 §8, pruebas 1–13 en PostgreSQL y unitarias. Se sustituye `visibility-matrix.spec.ts` por la matriz de la regla T.
- Todas las suites existentes del Backend en verde. Las de `F07-POL-01` se fijan a esa política y se conservan como evidencia.
- Cobertura real de los módulos tocados en la evidencia.
- Recorrido de la API en `3400`/`15440` con datos sintéticos:
  - Directiva frente a Administración;
  - cambio de rol y deshabilitación en la petición siguiente;
  - sustitución;
  - contratos 1, 2, 3 y 4 con `curl`, sin tokens en la evidencia.

### 2.4 Evidencia

`docs/evidence/E4_ACCESO_ROL_BACKEND_<fecha>.md`.

---

## 3. Sesión B — Web

### 3.1 Alcance

`E4_IMPACTO_POR_ARCHIVO.md` §3:
- tipos del contrato institucional v2;
- pantallas de convocatorias por rol: panel de participantes sólo para Administración, colaboradores sólo con `MANAGE`, sustitución por rol, sin permisos de visualización ni gestión del permiso de sustitución, cuya historia queda plegada;
- totales con `totals_basis` y `PENDING_CONSENT`;
- textos del colectivo sin umbral, con la política sellada por campaña;
- Excel con «Política aplicada»;
- retirar «anónimo» de `seal-panel.tsx`.

Empieza desde el SHA de A0 con fixtures de `E4_EJEMPLOS_RESPUESTAS.md`. Contra la API real (`3400`, Vite en `5184`) sólo cuando el orquestador lo indique.

### 3.2 No toca

`Back/**` ni los documentos de A. Una duda de forma va a A por el orquestador.

### 3.3 Pruebas mínimas

- Con respuestas de Directiva, **ningún** nombre ni cantidad por persona en el DOM, `title`, `aria-*`, tooltips, búsquedas o Excel.
- Acciones retiradas ausentes. Un 403 borra lo mostrado. La comprobación periódica y al recuperar el foco se mantiene.
- Rótulos de `ROLE_CONSENT`, `PREVIOUS_POLICY_K3` y `PENDING_CONSENT`, y de la política anterior en lo sellado.
- No queda ningún texto «Menos de N agricultores» ni «aún no alcanzan el umbral» para decisiones de `F07-POL-02`.
- Toda la suite de la Web en verde (`vitest --no-file-parallelism`) y `vite build`.
- Capturas del recorrido como Directiva y como Administración cuando haya API.

### 3.4 Evidencia

`docs/evidence/E4_ACCESO_ROL_WEB_<fecha>.md`.

---

## 4. Sesión C — Mobile

### 4.1 Alcance

`E4_IMPACTO_POR_ARCHIVO.md` §4.2:
- contrato 4 (`X-Joint-Purchase-Contract: 4`);
- `CONV-4` y su ayuda copiados de A0 **byte a byte**;
- alcances `ADMINISTRATION` y `TOTALS_ONLY`;
- acciones «Revisar quién puede ver mi participación» (en `OPEN` y `CLOSED`, no en `CANCELLED`) y «Retirar la autorización»;
- textos de «Quién ve sus datos», con «usted», sin anunciar como aplicado lo pendiente;
- retirar el diálogo de autorización de la responsable (P-A C1);
- emisor: `CONSENT_VERSION_RETIRED`, `APP_UPDATE_REQUIRED` y `WIDENING_NOT_ALLOWED` definitivos y sin reintento;
- las operaciones antiguas pendientes se conservan y se envían tal cual;
- esquema v20 aditivo (tabla nueva para las decisiones del alcance nuevo, con el orden calculado sobre las dos colas).

### 4.2 No toca

Los archivos de `proyectoagro-52` (`E4_IMPACTO_POR_ARCHIVO.md` §4.1). Un cambio en ellos es una «petición a proyectoagro-52» por el orquestador. Antes de fijar `schemaVersion = 20`, confirmar con el orquestador que el número no choca.

### 4.3 Recursos

- Sin emulador ni dispositivo hasta que el orquestador lo coordine.
- Sin compilar APK en local salvo indicación: el servidor Dart del editor puede bloquear Gradle.
- Pruebas de pantalla con espera fija y consultas mínimas.
- Dentro de una transacción `sqflite`, sólo comparaciones síncronas.

### 4.4 Pruebas mínimas

- Migración v19 → v20 con datos y pendientes conservados (`test/migration_test.dart`, `schema_equivalence_test.dart`).
- Validador del contrato 4:
  - lista cerrada, con `help`;
  - `contractVersion` distinto de 4 → «Actualice la aplicación»;
  - alcance desconocido → rechazo entero.
- Emisor:
  - los tres códigos son definitivos;
  - una respuesta atrasada no pisa una decisión ni unas cantidades más nuevas;
  - un `CONFIRM` pendiente con `CONV-3` se envía tal cual.
- Almacén: orden único entre las dos colas; lo pendiente no se anuncia como aplicado.
- Pantallas: revisión y retirada con la casilla sin marcar y «Sus cantidades no cambian».
- Suite completa de Mobile en verde y `flutter analyze` sin errores nuevos.

### 4.5 Evidencia

En el repositorio Mobile (`docs/evidence/` o `docs/rediseno/`). Si hay recorrido, con el modelo del emulador o dispositivo.

---

## 5. Cierre de cada sesión

Resumen al orquestador con:
- lo hecho, con SHA;
- lo pendiente;
- lo que queda declarado como limitación;
- comandos y resultados reales.

PR y actualización del Project sólo cuando el orquestador lo indique, con `Gate = Pending`.
