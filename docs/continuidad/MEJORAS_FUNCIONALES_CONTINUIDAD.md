# Mejoras funcionales de Agrocuentas — documento de continuidad

Léase al empezar cada sesión y **verifíquese el estado real** (ramas, commits, contenedor, pruebas) antes de continuar. Actualizado al cierre de la sesión del 2026-11-11 (noche).

## 1. Objetivo y reglas acordadas

Implementar, sobre el código real de Mobile, Back y Web y conservando el trabajo local reciente (voz, formulario único, rediseño Web), las capacidades acordadas el 2026-11-11:

- **A/B. Productos e identificación con foto opcional** (etapa 1): producto local ≠ producto colectivo; la persona autorizada vincula, crea o deja pendiente; la similitud sólo sugiere; foto con consentimiento aparte, sin metadatos, acceso autorizado, reintentos sin duplicar, una foto fallida no bloquea los datos.
- **C/D/E. Convocatorias de compra conjunta** (etapa 2): entidad distinta de la campaña; Borrador/Abierta/Cerrada/Cancelada; producto único entre convocatorias abiertas de una campaña; participación identificada con consentimiento CONV-1; permiso específico del responsable; sin conexión con estados claros; plazo y cierre con hora del servidor; «Consolidado al cierre» inmutable; avisos dentro de la app.
- **F. Estimación integrada en el borrador** (etapa 3) y **avisos adicionales** (etapa 4): sin empezar.
- Transversales: sin push (salvo la rama de evidencia móvil autorizada), PR, fusiones a `main`, despliegues, cierre de issues ni cambios al documento de grado; sin tocar voz ni formularios fuera del alcance; datos sintéticos y entornos aislados; no modificar la DEMO oficial; distinguir pruebas automatizadas, emulador y teléfono físico; commits como Roderich1 sin trailers.
- **Recursos del equipo** (pedido de Roderich, 2026-11-11): no correr varias suites ni compilaciones a la vez; agentes de uno en uno con pruebas focalizadas; el emulador se resiente con más carga.

## 2. Etapa actual

- **Etapa 1: cerrada** (recorrido real en el emulador, no en teléfono). Limitaciones A y B corregidas; decisiones E1-P1…P4 resueltas con los criterios del autor.
- **Etapa 2: implementada** en Back, Web y Mobile y recorrida en API real + Web + emulador (ver `docs/evidence/E2_CONVOCATORIAS_EMULADOR_2026-11-11.md`). Contrato E2 **Propuesto**, pendiente de aceptación.
- Etapas 3 y 4: sin empezar.

## 3. Ramas, worktrees y commits (nada publicado salvo la rama de evidencia)

| Repo | Worktree | Rama | Desde | Commits |
|---|---|---|---|---|
| Back/Web | `_wt/ET1-BE` | `feat/etapa1-identificacion-productos` | `feat/web-rediseno-integracion` `11bffd7` | `f395fcd` back · `9672b80` web · `2ce79db` `62779e8` docs · `71f17de` sharp y ciclo de vida · `839c7a6` herramientas · `ee1ecc1` cierre en emulador |
| Back/Web | `_wt/ET2-BE` | `feat/etapa2-convocatorias` | `62779e8` + fusión de ET1 | `74bae31` back E2 · `f42ffe2` web E2 · fusión de etapa 1 · `f95b34e` privacidad E2-P1 · `cd22bf7` web alineada · `edbd543` supervisor · (+ cierre de esta sesión) |
| Mobile | `_wt/ET1-MOB` | `feat/etapa1-productos-identificacion-foto` | `feat/f09-voz-formulario-unico` `73a927b` | `7257816` E1 · `8a45484` «Enviar ahora» · `bce8e59` aviso de respaldo |
| Mobile | `_wt/ET2-MOB` | `feat/etapa2-convocatorias` | `bce8e59` | `6bac5a3` E2 |
| Mobile | `_wt/EV-UI-MOB` | `evidence/ui-actual-2026-11-11` (**publicada**) | `origin/main` `279b46b` | `910448d`, `4b04a6f`: sólo capturas e índice |

Índice de capturas: https://github.com/Roderich1/AppMovilAgroquimico/blob/evidence/ui-actual-2026-11-11/docs/evidence/ui-actual/2026-11-11/README.md

Ramas de Back no incluidas (decisión): `feat/directiva-agricultores-sincronizacion`, `test/f07-variante-necesidad-postgres`, `demo/oe3-demostracion`.

## 4. Contratos y migraciones

- `docs/architecture/E1_IDENTIFICACION_PRODUCTOS_CONTRATO.md` (§8 decisiones resueltas, §9 resoluciones, §10 ciclo de vida de fotos).
- `docs/architecture/E2_CONVOCATORIAS_COMPRA_CONJUNTA_CONTRATO.md` (Propuesto; §9 resoluciones E2-R1…R17; E2-P1 aplicado: totales en vivo sólo para el responsable).
- Back: migraciones aditivas `20261111170745_e1_product_identification` y `20261111201928_e2_joint_purchase_calls`. Dependencia `sharp 0.35.5`. Variables: `PRODUCT_PHOTO_STORAGE_DIR|PROVIDER|S3_PREFIX`, `PRODUCT_PHOTO_SWEEP_INTERVAL_MS`, `PRODUCT_PHOTO_RETENTION_DAYS_AFTER_LINK`, `JOINT_PURCHASE_CLOSE_INTERVAL_MS`.
- Mobile: esquema SQLite **v15** (E1) y **v16** (E2), dependencia `image >=4.9.2 <4.10.0`.
- API: `/api/v1/catalog/identification-requests…`, `/api/v1/joint-purchase-calls…`, `/api/v1/me/joint-purchase-calls…`; OpenAPI `docs/api/openapi-e1-identification.json`, `openapi-e2-joint-purchase-calls.json`.

## 5. Pruebas (última ejecución real)

| Ámbito | Resultado |
|---|---|
| Back E1 unitarias / PostgreSQL | 59/59 · 17/17 (tras la fusión, 17/17) |
| Back E2 dominio / PostgreSQL | 27/27 · 17/17 |
| Back `npm test` completo | 523 pruebas en ET1 antes de la fusión; **no** se repitió en ET2 (carga del equipo) |
| Web E1 / E2 | 456 (suite completa, ET1) · 28/28 focalizadas E2; tsc, lint y build correctos |
| Mobile E1 | suite completa con salida 0 (ET1) |
| Mobile E2 | 13 archivos focalizados en verde; **no** se corrió la suite completa ni `flutter analyze` del proyecto entero tras las últimas pruebas |
| Emulador E1 | recorrido completo (evidencia E1 emulador) |
| Emulador E2 | ver evidencia E2 |

## 6. Limitaciones y decisiones pendientes

1. Nada probado en teléfono físico (el POCO no está disponible).
2. Contrato E2 pendiente de aceptación; decisiones E2-P2 (180 días de visibilidad en el teléfono) y E2-P3 (más personas con permiso de ver participantes) abiertas; el umbral de E2-P1 (3) revisable.
3. Suites completas pendientes en ET2 (Back `npm test`, Web, Mobile `flutter test` y `flutter analyze`): no se repitieron por la temperatura del equipo.
4. Observaciones menores de interfaz (E1 emulador §5): hoja de foto sin refresco tras envío en segundo plano; texto «el sindicato conserva la foto que ya tenía» cuando no tenía; barra inferior resalta Inicio en subpantallas de Más; consulta de identificaciones en cada ciclo.
5. Barrido de fotos sin activar en el entorno (`PRODUCT_PHOTO_SWEEP_INTERVAL_MS` vacío).

## 7. Siguiente paso concreto

1. Correr, de uno en uno, las suites completas de ET2 (Back, Web, Mobile) y `flutter analyze`.
2. Recoger la aceptación del contrato E2 y las decisiones E2-P2/P3.
3. Etapa 3 (estimación integrada en el borrador): contrato a partir de `JointPurchaseProposal` y del módulo `estimation` (ejecución vigente y compatible, cálculo en segundo plano, vínculo del borrador a la ejecución, comparabilidad estricta).

## 8. Comandos para retomar el entorno sin perder datos

```bash
# Desde Git Bash (rutas absolutas dentro del script). Mismos puertos y base para E1 y E2.
bash _wt/ET2-BE/tool/etapa2/et2.sh up        # contenedor agro_et1_pg (15434), API 3350 (ET2), Web 5175 (ET2)
bash _wt/ET2-BE/tool/etapa2/et2.sh status
bash _wt/ET2-BE/tool/etapa2/et2.sh down      # conserva el volumen agro_et1_pgdata
# Túnel temporal (sólo /api/v1/, autorizado para pruebas con el emulador; cerrarlo al terminar):
bash _wt/ET2-BE/tool/etapa2/et2.sh tunnel | untunnel
bash _wt/ET2-BE/tool/etapa2/et2.sh build-app && bash _wt/ET2-BE/tool/etapa2/et2.sh install-app   # APK «AC ET1» atada al origen del túnel
# Pruebas focalizadas:
#   Back: E1_PG_TEST_URL=postgresql://postgres@127.0.0.1:15434/agro_et1_test npx jest product-identification.postgres.spec.ts --runInBand
#         E2_PG_TEST_URL=postgresql://postgres@127.0.0.1:15434/agro_et2_test npx jest joint-purchase-calls.postgres.spec.ts --runInBand
#   Web:  npx vitest run --no-file-parallelism <archivos>
#   Mobile: flutter test --concurrency=1 <archivo>
# Recorridos: tool/etapa1/{farmer_e1.cjs,web_e1.mjs,references_e1.cjs,type_password.cjs}; tool/etapa2/{web_e2.mjs,participate_e2.cjs}
```

La API arranca con secretos generados en el momento (nunca en archivos). La app aislada conserva sus datos entre instalaciones (`adb install -r`); el emulador conviene reiniciarlo (`adb reboot`) si lleva días encendido.
