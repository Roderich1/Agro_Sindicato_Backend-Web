# Evidencia de cierre — composición integrada (2026-11-13)

Recorrido y suites sobre la composición final de cierre. Todo con datos **sintéticos**, en un entorno aislado (PostgreSQL `agro_acc_pg` 127.0.0.1:15440, base `acc_api`; API 127.0.0.1:3400; Web Vite 127.0.0.1:5184 con proxy a 3400). Ninguna prueba en teléfono físico. Ninguna aceptación visual ni funcional del autor queda registrada aquí.

| Elemento | Commit probado |
|---|---|
| Backend (código) | `Back/` idéntico en `744930d`, `7afd574` y `0946d9f` (`git diff --stat 744930d 0946d9f -- Back` vacío) |
| Web | `0946d9f` (rama `integracion/cierre-be`) |
| Mobile | `aeeb4f0` (rama `integracion/cierre-mob`) |

## 1. Suites sobre los commits finales

| Comprobación | Commit | Resultado |
|---|---|---|
| Backend `npm run build` | `744930d` (Back = final) | exit 0 |
| Backend `npx jest --runInBand --coverage` con todas las variables `*_PG_TEST_URL` (F02 con tres bases propias migradas con `prisma migrate deploy`; el resto con `postgresql://postgres@127.0.0.1:15440/postgres`, una base por suite) | `744930d` | **86 suites pasan, 2 omitidas; 1015 pruebas pasan, 13 omitidas, 0 fallan.** Cobertura de líneas 92,88 % (sentencias 91,21 %, ramas 77,57 %, funciones 92,63 %). Las 2 omitidas necesitan variables propias que no se dieron (una es la herramienta de comparación k, `F07_K_COMPARE_PG_URL`) |
| Backend `npm run openapi:check` | `7afd574` | Primera ejecución: **falló** («OpenAPI drift») en un checkout de Windows: las instantáneas E1/E2 quedaban con CRLF (no tenían regla `eol=lf`). Contenido idéntico al generado (misma huella sin CR). Corregido en `7afd574` (`.gitattributes`); segunda ejecución: instantáneas iguales; aserciones F02, F05, F06, F08 y F12 pasan |
| Web `tsc -b --noEmit` | `0946d9f` | exit 0 |
| Web `eslint .` | `0946d9f` | 0 errores, 7 avisos (`react-refresh/only-export-components`, ya existentes) |
| Web `npm run build` | `0946d9f` | exit 0 (precache 32 entradas) |
| Web `vitest run --no-file-parallelism` | `0946d9f` | **72 archivos, 743/743** |
| Mobile `dart format --set-exit-if-changed lib test` | `aeeb4f0` | 0 cambios (la CI lo había rechazado en `64e1d7b` por 4 archivos; corregido en `db79890`) |
| Mobile `flutter analyze` | `aeeb4f0` | sin issues |
| Mobile `flutter test --concurrency=4` (suite completa) | `aeeb4f0` | **3202 pasan, 3 omitidas, 0 fallan** |
| CI GitHub Backend (F02 + Web F07) | `7afd574` | success |
| CI GitHub Mobile (formato, análisis, tests, tests TZ La Paz, build release) | `aeeb4f0` | success |

Intermitencia observada (no oculta): una subsesión vio 2 fallos (`rdm2_c_personas_areas_test.dart`, `reports_screen_test.dart`) en un lote focalizado de 21 archivos bajo carga; aislados y al repetir el lote pasaron (346/346). En la suite completa de `aeeb4f0` no aparecieron. Se registra como posible sensibilidad al tiempo bajo carga, sin causa confirmada.

## 2. API real: recorrido HTTP sintético (`api/recorrido_api_CIERRE1.txt`)

API 3400 reiniciada desde `_wt/CIERRE-BE/Back` (dist de `744930d`), con `COLLECTIVE_DISCLOSURE_POLICY=F07-POL-02`, Sync v1 abierto y secretos generados en el proceso. `Back/scripts/e4-acc-synthetic-walk.cjs` con `E4_LABEL=CIERRE1`, `E4_WALK=yes` sembró un tenant nuevo y recorrió 33 pasos; todos con el código que fija el contrato E4:

| Grupo | Pasos y estado |
|---|---|
| Directiva frente a Administración | D1 lee el detalle 200; D1 pide participantes **403**; A1 pide participantes 200 |
| Contratos del agricultor | F1 CONV-4 (contrato 4) 200; F2 CONV-3 (contrato 3) 200; F3 CONV-1 sin cabecera 200; lista con contratos 1–4: 200 |
| Retirados | ampliar a colaboradores (contrato 2) **409**; modificar desde contrato 3 sobre ADMINISTRATION **409**; conceder PARTICIPANTS **409**; conceder «Sustituir responsable» **409**; la historia del permiso se lee (200) |
| Aislamiento | Directiva de otro sindicato lee el detalle **404**; agricultor en una ruta institucional **403** |
| Cambio de rol y deshabilitación | A2 a Directiva: siguiente petición **403**; de vuelta a Administración 200; A2 deshabilitada: **401** (decisión E4 §11.1: 401 del IAM común, no 403) |
| Sustitución | Directiva intenta sustituir **403**; A1 se nombra a sí misma **422**; A1 sustituye D1 → D2 200; D2 (Directiva, responsable) pide participantes **403**; A1 sigue viendo participantes |
| Autorización y cierre | F2 autoriza a la Administración (contrato 4) 200; D2 cierra 200; A1 lee el cierre 200 (líneas con `VISIBLE`/`ROLE_CONSENT` y `PENDING_CONSENT`) |

## 3. Web real por rol (Vite de `0946d9f` → API 3400), tenant `VER1`

Capturas con `tool/e4/capture_e4.mjs` (contraseña de un solo uso por inicio de sesión, nunca impresa). Cada carpeta tiene `salida.txt`, `_capturas.json`, `_registro.json` y las capturas.

| Plan | Resultado |
|---|---|
| `plan_rol_cierre/` (nuevo, `tool/cierre/plan_rol_cierre.mjs`) | A2 Administración: barra con «Usuarios» y F1 visible. **A2 pasada a Directiva (sin recargar):** barra sin «Usuarios», sin nombres por persona (revalidación de `/auth/me` tras detectar el cambio de acceso). A2 de vuelta a Administración: al recargar, barra con «Usuarios» y F1. A2 deshabilitada: la Web sale a `/login` |
| `plan_convocatorias/` | Directiva (D1, D2) sin nombres de F1–F3 en ninguna convocatoria, sin «anónim», sin «umbral», sin «Consultar participantes y cantidades»; CB «Visible por la regla anterior». A1: F1 en CA y F2 en CB, «Pendiente de autorización» donde corresponde |
| `plan_colectivo/` | Resumen y Cobertura con «Política aplicada … F07-POL-02» (Directiva y Administración); sin «umbral», «anónim» ni nombres |
| `plan_excel/` | Excel «Resumen» descargado por D1 (`descargas/resumen_D1.xlsx`), leído con `tool/e4/xlsx_e4.py`: 0 nombres de agricultores, 0 «umbral», 0 «anónim»; declara «Política aplicada: F07-POL-02 (totales sin nombres, sin mínimo de aportantes)». El Excel de la Administración no se descargó en este recorrido |

**Diferencias con las expectativas escritas en la verificación E4, explicadas por el estado de los datos (no por el código):** en `VER1`, después de aquellas capturas, F1 revisó su autorización en CB desde el móvil (caso E4 2.11) y CC ya tiene la responsable sustituida (caso 1.2c). Por eso hoy A1 ve a F1 en CB y CC no muestra el aviso de «Sustituir responsable…» (la responsable es elegible).

**Defecto encontrado y corregido durante este recorrido:** con la Web en una página que ven ambos roles, pasar de Administración a Directiva no producía ningún 403 (el detalle responde 200 con `can_view_participants=false`) y la barra conservaba el rol. La primera corrección D (`3d66802`, revalidar tras un 403) no lo cubría; `a35f8c2` revalida también cuando la comprobación existente de E4 §6.4 detecta el cambio de acceso. Repetido el plan: pasa.

**Limitación declarada:** de Directiva a Administración no hay 403 ni cambio detectado en una página de Directiva: la barra se actualiza en la siguiente renovación del token o al recargar. No hay sondeos periódicos nuevos (decisión D del autor).

## 4. Mobile en emulador

Ver `mobile/recorrido.md`. AVD propio `Cierre_Pixel8` (Android 16 x86_64, `emulator-5560`), paquete aislado `.cierre`, túnel HTTPS temporal autorizado por el autor el 2026-11-13 para este recorrido. Primer intento en `Pixel_8` (`emulator-5558`) abandonado por falta de espacio (`intento_5558/`): no se borró ninguna app ajena para hacer sitio.

APK usadas (perfil x64, firmadas con la clave de depuración, sólo para el emulador, con el origen del túnel dentro — **no distribuibles**): `anterior507` (`507efc8`, SHA-256 `02f8dc13…`), `final` (`aeeb4f0`, sin modelos de voz, `f7c16021…`), `final-voz` (`aeeb4f0` + modelos de voz y bibliotecas x86_64 empaquetados desde archivos ignorados, `5d86f1ea…`, sólo para M6).

## 5. Herramientas

`tool/cierre/` (copias de `tool/e4/` para el cierre): `plan_rol_cierre.mjs`, `cierre_env.sh` (túnel, APK `.cierre`, instalación), `cierre_ui.sh`, `credential_adb.cjs`. El origen del túnel sólo vive en un archivo temporal fuera del repositorio; `grep -c trycloudflare` sobre esta carpeta → 0.
