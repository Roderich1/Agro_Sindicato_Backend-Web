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
