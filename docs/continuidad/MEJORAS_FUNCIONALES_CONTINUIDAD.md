# Mejoras funcionales de Agrocuentas — documento de continuidad

Léase al empezar cada sesión y **verifíquese el estado real** (ramas, commits, contenedor, pruebas) antes de continuar. Actualizar al terminar cada sesión.

## 1. Objetivo y reglas acordadas

Implementar, sobre el código real de Mobile, Back y Web y conservando el trabajo local reciente (voz, formulario único, rediseño Web), las capacidades acordadas el 2026-11-11:

- **A. Productos e identificación**: el agricultor crea productos locales; publicar uno desconocido no lo vuelve oficial; la persona autorizada lo vincula a un producto existente, crea un producto colectivo o lo deja pendiente; la similitud sólo sugiere; identidades local y colectiva distintas; sin reescribir registros privados; sin duplicados ante reenvíos; quién decide queda registrado; cifras publicadas y selladas intactas.
- **B. Fotografía opcional de la etiqueta**: tomar o elegir, revisar, reemplazar y quitar; local sin conexión; comprimida y sin metadatos de ubicación; consentimiento explícito y aparte para compartirla; sólo imágenes de productos cuya publicación corresponda; reintentos sin duplicar; una foto fallida no bloquea los datos; acceso central autorizado, sin URL pública; una imagen recibida no es la oficial; validación de tipo real, tamaño y contenido; nunca en logs ni base64 en eventos.
- **C. Convocatorias de compra conjunta**, **D. Participación identificada y reparto**, **E. Offline, plazo y cierre**, **F. Estimación integrada en el borrador**: etapas 2–4 (ver el encargo original; reglas íntegras en el mensaje del autor del 2026-11-11).
- Transversales: sin push, PR, fusiones a `main`, despliegues, cierre de issues ni cambios al documento de grado; sin tocar motores de voz ni formularios existentes fuera de lo necesario; datos sintéticos y entornos aislados; no modificar la DEMO oficial; distinguir pruebas automatizadas, emulador y teléfono físico; no declarar probado en teléfono lo visto sólo en emulación; commits como Roderich1 sin trailers.

## 2. Etapa actual

**Etapa 1 implementada de punta a punta en HOST** (API real + Web real + sesión de app simulada); pendiente el recorrido en el emulador con el origen HTTPS real y la aceptación del contrato por Roderich. Etapas 2–4 sin empezar.

## 3. Ramas, worktrees y commits

| Repo | Worktree | Rama | Base | Commits de la etapa |
|---|---|---|---|---|
| Back/Web | `_wt/ET1-BE` | `feat/etapa1-identificacion-productos` | `feat/web-rediseno-integracion` `11bffd7` (incluye `main` `5973b49`, panel Web, xlsx, rediseño) | ver `git log 11bffd7..HEAD` (anotados al final de esta sección) |
| Mobile | `_wt/ET1-MOB` | `feat/etapa1-productos-identificacion-foto` | `feat/f09-voz-formulario-unico` `73a927b` (incluye `main` `279b46b`, UXJ, F09 voz y formulario único) | ver `git log 73a927b..HEAD` |

Ramas de Back **no** incluidas en la base (decisión: no mezclar en esta etapa): `feat/directiva-agricultores-sincronizacion` (7fd3365, estado de sincronización de agricultores), `test/f07-variante-necesidad-postgres` (variante «threshold-only», experimental), `demo/oe3-demostracion` (tool/demo).

Commits de esta sesión (2026-11-11): Back/Web `f395fcd` (back), `9672b80` (web), `2ce79db` (docs, tool) y el commit de cierre de documentación; Mobile `7257816`.

## 4. Contratos y migraciones

- Contrato: `docs/architecture/E1_IDENTIFICACION_PRODUCTOS_CONTRATO.md` (estado **Propuesto**; §2 decisiones E1-D1…D14, §8 decisiones abiertas E1-P1…P4, §9 resoluciones de la implementación). No modifica F05/F06/F07/F08.
- Back: migración `20261111170745_e1_product_identification` (sólo aditiva: 4 enums, `ProductIdentificationRequest`, `ProductIdentificationEvent`, CHECKs, trigger de historial inmutable). Variables nuevas: `PRODUCT_PHOTO_STORAGE_DIR`, `PRODUCT_PHOTO_STORAGE_PROVIDER`, `PRODUCT_PHOTO_S3_PREFIX`.
- API: `/api/v1/catalog/identification-requests` (§4 del contrato); OpenAPI en `docs/api/openapi-e1-identification.json` (+ subconjuntos regenerados).
- Mobile: esquema SQLite **v15** (`products.photo_path/photo_sha256/photo_updated_at`, tabla `product_identification_requests`), dependencia nueva `image >=4.9.2 <4.10.0`, rutas nuevas en `ApiEndpointConfig`.
- Web: vista `/colectivo/catalogo?vista=identificacion`.

## 5. Trabajo completado y pruebas

Ver `docs/evidence/E1_IDENTIFICACION_2026-11-11.md` (pruebas automatizadas, recorrido HOST del agricultor por la API, recorrido Web con capturas, estado en la base, emulador).

## 6. Limitaciones y decisiones pendientes

1. **Túnel HTTPS denegado** en la sesión del 2026-11-11: el emulador no pudo activar la app ni enviar nada. Para el recorrido completo: `tool/etapa1/et1.sh tunnel` → `ET1_SERIAL=emulator-5554 tool/etapa1/et1.sh build-app` → `install-app`; activar `agricultor15` (`et1.sh credential agricultor15` teclea la contraseña de un solo uso), vincular campaña, Catálogos → foto, Vínculos → «Pedir identificación», «Actualizar»; luego la Web decide y «Actualizar» en el teléfono muestra «Identificado como …» y **Vincular**.
2. Decisiones abiertas para Roderich: E1-P1 (identidad del agricultor ante la Directiva: hoy oculta), E1-P2 (2 MiB / 1600 px), E1-P3 (deshacer un vínculo: hoy sólo corregirlo), E1-P4 (retención del binario).
3. Respaldo privado sin `product_photos/` (Mobile). «Decodificable» por cabecera en Back. Lint de Back con errores preexistentes.
4. Aceptación del contrato E1 por Roderich antes de pasar a la etapa 2.

## 7. Siguiente paso concreto

1. Con el túnel autorizado, ejecutar el recorrido del §6.1 y añadir la evidencia **EMULADOR** (sin declararla de teléfono).
2. Recoger las decisiones E1-P1…P4.
3. Etapa 2 (convocatorias y participación identificada, cierre atómico): redactar su contrato partiendo de `JointPurchaseProposal` (borradores existentes), `AgriculturalCampaign`, los roles actuales y un permiso nuevo para consultar participantes; en Mobile, lectura al sincronizar (no push).

## 8. Comandos para retomar el entorno sin perder datos

```bash
# Desde cualquier Git Bash (rutas absolutas dentro del script)
bash _wt/ET1-BE/tool/etapa1/et1.sh up        # contenedor agro_et1_pg (15434), API 3350, Web 5175
bash _wt/ET1-BE/tool/etapa1/et1.sh status
bash _wt/ET1-BE/tool/etapa1/et1.sh seed      # idempotente; ya sembrado el 2026-11-11
bash _wt/ET1-BE/tool/etapa1/et1.sh down      # conserva el volumen agro_et1_pgdata
# Web: http://127.0.0.1:5175 → Catálogo y equivalencias → «Por identificar»
# Pruebas: Back `npm test`; PostgreSQL `E1_PG_TEST_URL=postgresql://postgres@127.0.0.1:15434/agro_et1_test npx jest product-identification.postgres.spec.ts --runInBand`
#          Web `npx vitest run --no-file-parallelism`; Mobile `flutter analyze && flutter test`
# Recorridos: node tool/etapa1/farmer_e1.cjs <png> <salida.json> (desde Back/, con DEMO_PG_ADMIN_URL y DEMO_API)
#             node tool/etapa1/web_e1.mjs <dir> lista|foto|vincular|crear|pendiente (WEB_URL, BROWSER_PATH, PUPPETEER_HOME, BE_DIR)
```

La API arranca con secretos generados en el momento (nunca en archivos). Si `dist/` está desactualizado: `cd Back && npm run build` (borrar `tsconfig*.tsbuildinfo` si el build se comporta raro).
