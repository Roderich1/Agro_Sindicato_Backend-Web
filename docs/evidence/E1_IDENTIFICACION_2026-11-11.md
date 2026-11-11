# E1 — Identificación de productos reportados: evidencia de la primera sesión (2026-11-11)

| Campo | Valor |
|---|---|
| Fecha real | 2026-11-11, de las 16:40Z a las 18:40Z (UTC) |
| Procedencia | **HOST** (Windows 11 Home 10.0.26200, Node 25.9.0, Flutter 3.47.2) y **EMULADOR** Pixel_8 (`emulator-5554`, Android 16) sólo para la pantalla de activación. **Nada se probó en un teléfono físico.** |
| Bases | Back/Web `feat/web-rediseno-integracion` `11bffd7` → `feat/etapa1-identificacion-productos`; Mobile `feat/f09-voz-formulario-unico` `73a927b` → `feat/etapa1-productos-identificacion-foto` |
| Contrato | `docs/architecture/E1_IDENTIFICACION_PRODUCTOS_CONTRATO.md` (Propuesto; §9 con las resoluciones de la implementación) |
| Entorno | Aislado y sintético: contenedor `agro_et1_pg` (PostgreSQL 16.13, puerto 15434, volumen `agro_et1_pgdata`, base `agro_demo` sembrada con `tool/demo-rica/demo-rica.cjs`), API 3350 (`dist/main.js` del worktree, secretos efímeros sólo en el entorno del proceso), Web 5175 (Vite, proxy a 3350), fotos en `%TEMP%/agro_et1/photos`. No se tocó la DEMO oficial (3330/5190) ni la copia «rica» (15433/3342/5199). Supervisor: `tool/etapa1/et1.sh`. |
| Origen | Trabajo nuevo de esta sesión (no reconstruido). |

## 1. Pruebas automatizadas

| Dónde | Comando | Resultado |
|---|---|---|
| Back, unitarias E1 | `npx jest src/modules/product-identification --testPathIgnorePatterns postgres` | 4 suites, **33/33** |
| Back, PostgreSQL E1 | `E1_PG_TEST_URL=postgresql://postgres@127.0.0.1:15434/agro_et1_test npx jest product-identification.postgres.spec.ts --runInBand` | **15/15** (dos ejecuciones) |
| Back, suite completa | `npm test` | 52 suites, 497 pruebas, 0 fallos (28 suites PostgreSQL omitidas sin su variable, como en CI) |
| Back, tipos/compilación/OpenAPI | `npx tsc -p tsconfig.build.json --noEmit`, `npm run build`, `npm run openapi:generate` + `npm run openapi:check` | correctos; subconjunto nuevo `docs/api/openapi-e1-identification.json` |
| Back, lint | `npm run lint` | 37 errores y 5 avisos **preexistentes** (ninguno en archivos nuevos; p. ej. `URL` en `env.schema.ts:81`) |
| Web | `npx vitest run --no-file-parallelism` | **50 archivos, 456/456** (15 nuevas: `product-identification.page.test.tsx` 13 + `catalog.page.test.tsx` 2) |
| Web | `npx tsc -b --noEmit`, `npm run lint`, `npm run build` | tsc OK; lint 0 errores (7 avisos antiguos); build OK |
| Mobile | `flutter analyze` | sin incidencias |
| Mobile, nuevas | `flutter test test/e1_*.dart test/migration_test.dart test/schema_equivalence_test.dart test/voice_evidence/voice_evidence_exclusion_test.dart` | 70 pruebas en verde (10 foto, 19 store, 18 emisor y lista de rutas, 1 vínculo sin tocar registros privados, 1 pantalla de vínculos, 1 catálogo, 21 migración/esquema/exclusión de voz) |
| Mobile, suite completa | `flutter test` | dos ejecuciones completas en `_wt/ET1-MOB` con código de salida 0 (todas en verde; la ejecución intermedia del agente contó 2 911 aprobadas y 3 omitidas tras ajustar `rec_039` a la versión 15) |

Lo que cubren las PostgreSQL: idempotencia del `PUT` (mismo id, reenvío, id ajeno 409), separación de tenants y roles (agricultor 403 en rutas institucionales; otro tenant 404), foto (tipo falso, tamaño, hash distinto, sin consentimiento 409, reemplazo borra la anterior, retiro → 404, otro tenant 404, almacenamiento no configurado 503 sin bloquear los datos), vincular / crear / diferir con eventos y `AuditLog`, nombre repetido 409, corrección del vínculo, candidatos sin escritura.

## 2. Recorrido del agricultor por la API real (HOST)

`tool/etapa1/farmer_e1.cjs` abre una sesión v2 con registro de cliente (igual que una instalación de la app y que la propia siembra) para `agricultor15` y ejecuta las llamadas del §4.1. Resultado completo en `e1_identificacion/host_agricultor_api.json`:

| Paso | HTTP | `errorCode` |
|---|---|---|
| `PUT` solicitud 1 con consentimiento `FOTO-1` | 201 | — |
| Reenvío idéntico | 200 | — |
| Misma solicitud con unidad distinta | 409 | `UNIT_IMMUTABLE` |
| `PUT` con clave extra (`local_id`) | 400 | `PAYLOAD_INVALID` |
| `PUT` solicitud 2 sin consentimiento | 201 | — |
| Foto sobre la solicitud 2 | 409 | `PHOTO_CONSENT_REQUIRED` |
| Foto con bytes que no son imagen | 422 | `IMAGE_INVALID` |
| Foto con `X-Content-SHA256` distinto | 422 | `CONTENT_HASH_MISMATCH` |
| Foto válida (PNG 1366×768, 128 440 bytes) | 201 | — |
| Misma foto otra vez | 200 | — (sin reescribir) |
| Foto enviada como JSON | 415 | `UNSUPPORTED_MEDIA_TYPE` |
| `PUT` solicitud 3 | 201 | — |
| `GET /` propias | 200 | 3 solicitudes; **sin** correo ni `memberId` en la respuesta |
| `GET /{id}/candidates` como agricultor | 403 | `AUTH_CONTEXT_FORBIDDEN` |
| `GET /?status=PENDING` como agricultor | 400 | `PAYLOAD_INVALID` |

La «foto» es una captura de pantalla sintética del repositorio (no hay etiquetas reales); sirve para el tipo, tamaño y hash, no para legibilidad.

## 3. Recorrido de la Directiva en la Web real (HOST, Edge sin interfaz)

`tool/etapa1/web_e1.mjs` inicia sesión como `directiva` (contraseña de un solo uso por tubería, nunca impresa) y abre `/colectivo/catalogo?vista=identificacion`. Capturas en `e1_identificacion/`:

| Acción | Capturas | Comprobado |
|---|---|---|
| Lista | `lista_01_lista.png` | tres solicitudes pendientes con nombre, ingrediente, unidad, fecha y estado de la foto; texto «No se muestra quién reportó cada producto»; ningún «@» en la vista |
| Foto | `foto_02_modal.png` | `GET …/photo` → 200 `image/png`, `Cache-Control: private, no-store`, `Content-Length` 128440; la imagen del modal es un `blob:` local (1366×768), no una URL de la API |
| Vincular | `vincular_02_dialogo.png`, `vincular_03_formulario.png`, `vincular_04_resultado.png` | cuatro candidatos del servidor con «Parecido medio/bajo» y la frase «Sugerencias por parecido del nombre; la decisión es suya.»; ninguno preseleccionado; motivo y casilla obligatorios; resultado «vinculado con “Herbicida 48 DEMO”. La decisión queda en la bitácora.» |
| Crear producto colectivo | `crear_03_formulario.png`, `crear_04_resultado.png` | unidad bloqueada (KG), nombre precargado; «Se creó el producto colectivo “Fertilizante foliar artesanal ZZ” y … quedó vinculado con él.» |
| Dejar pendiente | `pendiente_03_formulario.png`, `pendiente_04_resultado.png` | la solicitud sigue pendiente con «Pendiente por falta de información: …» |

Los dos errores de consola por recorrido son `POST /auth/refresh` → 401 antes de iniciar sesión (pendiente conocido «refresh sin cookie», no de este bloque).

**Estado en la base tras el recorrido** (consulta directa, sólo lectura):

```text
Herbicida 48 SL del agro (etiqueta) | LINKED  | LINKED_EXISTING | Herbicida 48 DEMO               | STORED
Fertilizante foliar artesanal ZZ     | LINKED  | CREATED_PRODUCT | Fertilizante foliar artesanal ZZ | NONE
Polvo azul sin etiqueta              | PENDING |                 |                                  | NONE   (nota pendiente: sí)
eventos: RECEIVED ×3, PHOTO_RECEIVED, LINKED (actor institucional), PRODUCT_CREATED (actor institucional), NOTE
AuditLog: 2 entradas OTRO/ProductIdentificationRequest con ownerUserId NULL (+1 por la nota)
Product nuevo: «Fertilizante foliar artesanal ZZ», KG, activo · fotos en disco: 1 objeto
```

## 4. Emulador

APK «AC ET1» (`com.comunidad.agro.agroquimicos.et1`, perfil x64) compilada desde `_wt/ET1-MOB` e instalada en `emulator-5554`. **El recorrido del agricultor en el emulador no se pudo ejecutar:** la app exige un origen HTTPS (`ApiEndpointConfig`) y su primera pantalla es «Activar en línea» (`emulador_activacion_sin_servidor.png`); el túnel HTTPS temporal (`et1.sh tunnel`, cloudflared como en sesiones anteriores) fue **denegado por el modo automático** de esta sesión (ingreso externo). La APK instalada apunta a un origen de relleno (`https://et1.invalid`) y debe recompilarse con el origen real (`et1.sh tunnel` → `build-app` → `install-app`) cuando el túnel esté autorizado. La transferencia teléfono → servidor queda, por tanto, acreditada sólo por las pruebas unitarias del emisor (`MockClient`) y por el recorrido HOST del §2, que usa la misma API y la misma sesión de app.

## 5. Commits locales

Back/Web (`_wt/ET1-BE`): `f395fcd` back, `9672b80` web, `2ce79db` docs (+ el commit de este ajuste). Mobile (`_wt/ET1-MOB`): `7257816`. Autoría Roderich1, sin trailers; sin push.

## 6. Limitaciones declaradas

- Sin teléfono físico; emulador sólo hasta la activación.
- «Decodificable» en Back se comprueba por cabecera (firma, SOF/IHDR, dimensiones), no por decodificación completa.
- El respaldo privado de Mobile no incluye todavía las fotos de producto.
- La identidad del agricultor no se muestra a la Directiva (E1-D5); decisión abierta E1-P1.
- Lint de Back con errores preexistentes fuera de este bloque.
