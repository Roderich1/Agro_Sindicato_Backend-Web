# Correcciones técnicas de la revisión OE1–OE4 (2026-11-13)

Defectos acotados que impedían cumplir requisitos ya acordados, hallados al contrastar el documento de grado con el código. El autor autorizó el 2026-11-13 corregirlos y fusionar los dos primeros «cuando pasen las suites correspondientes y la CI». Todo con datos sintéticos; ninguna prueba en un teléfono físico.

| # | Defecto | Requisito | Corrección | PR | `main` resultante | Verificación |
|---|---|---|---|---|---|---|
| 1 | Las acciones administrativas no escribían `AuditLog`: crear una cuenta, cambiar nombre o rol, desactivar o reactivar, restablecer la contraseña, reconciliar denominaciones y editar el catálogo (H-08) | RF-02, RF-25 | `191fbe2`: misma transacción que el cambio; actor, tenant, fecha, entidad y valores anterior y nuevo; nunca contraseña, hash, token ni correo; el código del evento va en `metadata.event` (sin migración); la Web muestra el tipo en español | Backend #212 | Backend/Web `af449ba` | Back jest completo con PostgreSQL: 88 suites pasan y 2 omitidas; 1032 pasan, 13 omitidas, 0 fallan. `openapi:check` pasa. Web: tsc 0, eslint 0 errores, build OK, vitest 744/744. CI del PR y de `main`: success |
| 2 | La evidencia de dictado (compilación de evaluación con consentimiento) guardaba la sombra del dictado como «confirmado», sin las correcciones hechas a mano | RF-41, DAT-21 | `4a5a25b`, `0729835` y `8a14edf`: `proposed` (lo dictado) queda intacto; `confirmed` toma lo que tiene el formulario al confirmar; `corrections` se deriva de ambos; van en columnas separadas. Sin audio. Fuera de Sync, de lo colectivo y del respaldo. Sin `AGRO_VOICE_EVIDENCE=true` o sin consentimiento no se escribe nada. Nota en ADR-005 con la configuración vigente | Mobile #193 | Mobile `e9c3b30` | `flutter analyze` sin avisos; `dart format` sin cambios. Suite completa: 1.ª pasada 3209 pasan, 3 omitidas, **1 falla** (intermitencia, ver abajo); 2.ª pasada **3210 pasan, 3 omitidas, 0 fallan**. CI: 1.ª ejecución 3208 pasan, **1 falla** (intermitencia); al relanzarla, success |
| 3 | `409 PARTICIPATION_REQUIRED` se guardaba en el diario de operaciones, de modo que el reintento con el mismo `operation_id` tras la primera confirmación recibía siempre el mismo 409 (contrato E2, apartado 11.1) | E2 11.1 (regla acordada) | `4639ef3`: el 409 se lanza sin escribir en el diario, como `APP_UPDATE_REQUIRED`; prueba PostgreSQL nueva, que falla sin la corrección | Backend #214 | **pendiente de autorización de fusión** | Convocatorias 104/104 (incluida PG). Suite completa: 88 suites pasan y 2 omitidas; 1033 pasan, 13 omitidas, 0 fallan. `openapi:check` pasa |

**Guardar la evidencia de dictado no equivale a evaluar la precisión del reconocimiento.** Esa evaluación es parte de OE5 y no se ha realizado.

## Intermitencias observadas (no ocultas)

| Prueba | Dónde | Resultado | Investigación |
|---|---|---|---|
| `test/f04_admin_owner_restore_ui_test.dart:593` (restaurar en modo propio) | Suite completa local de `8a14edf`, 1.ª pasada (`--concurrency=4`) | Esperaba `OperationMode.personal` y vio `shared` | Aislada: 7/7 en la rama y en `main` `34e9926`; en la 2.ª pasada completa, pasa. Ajena al cambio |
| `test/rdm_a_personas_pago_test.dart:116` (cabecera tras «Registrar pago») | CI del PR #193, 1.ª ejecución | Esperaba «160,00» y leyó «200,00» | La prueba comprueba la cabecera sin esperar la recarga. Aislada: 3/3 en la rama y 3/3 en `main`; en las pasadas completas locales, pasa. Ajena al cambio |

Ninguna prueba se desactivó ni se modificó. Queda pendiente robustecerlas: esperar la recarga antes de comprobar.

## Candidatas de Mobile tras la corrección 2 (fuera de Git, en `_artefactos/cierre/`)

| Archivo | Uso | Commit | SHA-256 | Firma y configuración |
|---|---|---|---|---|
| `agrocuentas-release-e9c3b30-SIN-FIRMAR.apk` (111 136 781 B) | Registro de la release de `main` | `e9c3b30` | `8a55761f57f6cd26fde930e8eddb5a1aa63bc8dc127efbad3422375ce00fce13` | `flutter build apk --release`; **sin firmar** (no hay `key.properties`), sin `AGRO_API_BASE_URL` y sin modelos de voz. **No instalable ni distribuible** |
| `agrocuentas-oe5-e9c3b30-arm64-profile-referencia-sin-origen.apk` (335 568 625 B) | **Versión de evaluación OE5 (referencia)** | `e9c3b30` | `7d4612f895e36ab5145b7918824976cc393d72c44d89847f566d3ddd5ebe0358` | `profile` arm64-v8a, paquete `.oe5` («AC OE5»), clave de depuración, `AGRO_VOICE_EVIDENCE=true`, sin `AGRO_VOICE_DIAG`, `AGRO_APP_COMMIT=e9c3b30`. Modelos Vosk small-es 0.42, Whisper base q5_1 y Whisper small q5_1, verificados dentro de la APK (16/16 SHA-256 del manifiesto), y `libagro_whisper.so` arm64 |

**Versión que se usará para evaluar:** Mobile `e9c3b30`. La APK de referencia no lleva origen de API y **no puede activarse**. El día de la evaluación se recompila desde ese mismo SHA con el origen HTTPS del túnel o servidor vigente (`AGRO_API_BASE_URL`, sin imprimirlo), con el mismo procedimiento, y se registra su SHA-256. Es una compilación de prueba firmada con la clave de depuración: **no es una distribución**.

---

## Actualización del 2026-11-14: cierre de las correcciones y composición estable

Encargo del autor del 2026-11-14 (texto literal en la revisión OE1–OE4, `DECISIONES_AUTOR_2026-11-13.md`, apartado 9).

### PR fusionados

| PR | Contenido | HEAD verificado | `main` resultante | Verificación |
|---|---|---|---|---|
| Backend #214 | `409 PARTICIPATION_REQUIRED` no se guarda en el diario; el reintento se aplica sin duplicar decisiones, sin alterar el orden (`STALE_SEQUENCE`) y sin ampliar autorizaciones (`CONSENT_VERSION_RETIRED`, `CONSENT_REQUIRED`, 400 desde los contratos 2 y 3; en una convocatoria cancelada, `WIDENING_NOT_ALLOWED`) | `88fc7c4` | `a8b6504` | Suite completa sobre `88fc7c4`: 88 suites pasan y 2 omitidas; 1036 pasan, 13 omitidas, 0 fallan. `openapi:check` OK. CI verde |
| Backend #216 | La Bitácora no expone correos (`actor` = id, nombre y rol; `owner` = id y nombre), para todos los roles (RNF-05). Alcance de RF-02/RF-25 contrastado: generar un borrador, fijar o quitar la referencia de estimación y el inicio de sesión **no** están comprometidos; conservan su autor y fecha en sus propios registros; los accesos se excluyen de la auditoría (RNF-11). **No se afirma que se auditen todas las acciones del sistema**; los intentos fallidos de inicio de sesión no se guardan (limitación) | `4945400` | `7e5ac2a` | Composición `main` + #216 + #215 (`f036362`): Back 1042 pasan, 13 omitidas, 0 fallan; `openapi:check` OK. Web: tsc 0, eslint 0 errores (7 avisos previos), build OK, vitest 744/744. CI verde |
| Backend #215 | Pruebas E1: resolver una identificación no cambia cifras publicadas ni selladas; borrar la foto conserva la resolución completa y la auditoría; corregir el vínculo renueva el inicio de la retención (90 días). Sólo pruebas; cada una falla al introducir a mano el defecto correspondiente | `1a84c52` | `81c4611` | En la misma composición `f036362`. CI verde |
| Backend #211 | Manuales actuales (agricultor en ambos modos, Directiva, Administración y técnico); los F11 quedan como históricos. Sin despliegue ni APK distribuible declarados | `a6fd9c3` | `94fa285` | Sólo documentación; revisados contra el código |
| Mobile #194 | Prueba `rdm_a_personas_pago_test` esperando la recarga (corrige la intermitencia que dejó en rojo la CI de `e9c3b30`) | `57e6ad1` | `65e1004` | CI verde |
| Mobile #195 | Cinco textos con el recorrido real (campañas, pago al proveedor, liberar envíos, franja «Proveedores», verificar el acceso en línea) y aviso informativo al cambiar de modo con operaciones de compras conjuntas pendientes de envío (sin bloqueo nuevo; no toca la cola, las cantidades ni los consentimientos) | `eca4695` | `f105e99` | Suite completa sobre `eca4695`: **3224 pasan, 3 omitidas, 0 fallan**; `flutter analyze` sin issues; `dart format` sin cambios. CI verde |

### Composición estable (para la evaluación OE5)

- **Backend/Web:** `main` `94fa285`.
  - El último código es `81c4611`; `94fa285` sólo añade los manuales.
  - CI: «Backend F02» success en `81c4611`; «Web F07» success en `7e5ac2a`, el último cambio de la Web.
- **Mobile:** `main` `f105e99`. CI success.
- **Intermitencias registradas en esta etapa** (ninguna prueba se desactivó):
  - `f04_admin_owner_restore_ui_test.dart:593`: una vez, en local, bajo carga.
  - `rdm_a_personas_pago_test.dart:116`: corregida en #194.
  - `operation_mode_onboarding_test` «recién activado sin titular…»: falló dos veces con la concurrencia por defecto en local (sesión S4) y pasa sola y con `--concurrency=4`. La misma prueba ya registraba un fallo así en la CI. No se confirmó sobre `main`.

### Candidata de evaluación OE5 (preparada en emulador)

**Corrección del 2026-11-14:** en la versión anterior de este apartado se leía «sólo emulador, por decisión del autor». El autor indicó usar sólo el emulador **para la preparación**, después de que MIUI rechazara la instalación por USB en el teléfono. No decidió evaluar sólo en emulador. El dispositivo de las sesiones se documenta con sus registros reales. La candidata se congeló el 14-11 y el entorno se preparó con el conjunto del protocolo único: ver `OE5_PREPARACION_DSUX_2026-11-14.md`.

| Campo | Valor |
|---|---|
| Archivo (fuera de Git) | `_artefactos/cierre/agrocuentas-oe5-f105e99-x64-profile-con-origen.apk` (337 712 384 B) |
| SHA-256 | `66b9a6161c6440799d0f0121bbad6139e9d90e512d6a985f7b5d1c53e716f6ec` |
| Código | Mobile `f105e99` (esquema 20, contrato 4) |
| Compilación | `profile` x86_64; paquete `.oe5` («AC OE5»); **firmada con la clave de depuración** (V2, `CN=Android Debug`): compilación de prueba, **no una distribución de producción** |
| Opciones | `AGRO_VOICE_EVIDENCE=true` (evidencia de dictado con consentimiento), sin `AGRO_VOICE_DIAG`, `AGRO_APP_COMMIT=f105e99`; `AGRO_API_BASE_URL` = túnel HTTPS temporal autorizado por el autor el 2026-11-14 (no se publica; 0 apariciones en el registro de compilación) |
| Modelos | Vosk small-es 0.42, Whisper base q5_1 y Whisper small q5_1; 16/16 SHA-256 del manifiesto verificados; `libagro_whisper.so` x86_64 |
| Backend compatible | API de evaluación aislada desde `main` `94fa285` (código `81c4611`), base `acc_api`, sindicato sintético «OE5» (cuentas D1, D2, A1, A2, F1–F3; campaña abierta; dos productos), `F07-POL-02` |
| Instalación | `emulator-5560` (AVD `Cierre_Pixel8`, Android 16 x86_64): `Success`. **Activación** con la cuenta sintética F1 por el túnel: correcta (la app pasa a «Titular de los datos»); el titular y el modo quedan sin elegir para la evaluación |
| Variante arm64 | `agrocuentas-oe5-f105e99-arm64-profile-con-origen.apk` (SHA-256 `869b6750a7f2386a5a4f7c92b80139ccf8b7b735bb91bd61e1b451ee3b41ce7c`): compilada y **no instalada en ningún teléfono**. MIUI rechazó la instalación por USB (`INSTALL_FAILED_USER_RESTRICTED`); la preparación siguió en el emulador por indicación del autor, que no es una decisión sobre dónde se evalúa |

**Condiciones de uso:**
- El origen del túnel va compilado en la APK, así que el equipo debe seguir encendido con la API 3400 y el túnel abiertos durante la ventana de evaluación.
- Si el túnel se reinicia, hace falta una candidata nueva (otro SHA-256), que debe registrarse antes de usarla. Desde la congelación, `oe5_env.sh build` se niega a recompilar sin un motivo, y el motivo queda anotado.
- No se actualiza la candidata durante una sesión de evaluación.
- Guardar evidencia de dictado no equivale a evaluar la precisión del reconocimiento (OE5).
