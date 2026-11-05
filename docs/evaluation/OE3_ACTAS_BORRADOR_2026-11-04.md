# OE3: borradores de actas de GATE-F03 y GATE-F04 y propuesta de aceptación de GATE-F07

**Estado: BORRADOR, no aplicado.**
- **Quién lo prepara:** la sesión de Claude Code, a pedido de Roderich Rendón.
- **Quién decide:** sólo Roderich, con confirmación explícita, en un archivo de decisión aparte. Ningún campo del Project cambia con este documento.
- **Lo que no hace:** no atribuye revisión al tutor ni a la Directiva, y no registra ninguna inspección personal.
- **Base:** Backend `main` `5973b49`; Mobile `main` `279b46b` (después de integrar #183, #184, #185, #186 y #187, con CI en SUCCESS).
- **Detalle:** `OE3_CIERRE_INVENTARIO_2026-11-03.md` §11–§13 y `OE3_DECISIONES_BORRADOR_2026-11-03.md`.

---

## Acta propuesta: GATE-F03 (Mobile #23), ratificación

**Alcance:** académico, con datos sintéticos. **No habilita datos reales.**

**Lo acreditado.**

| Ítem | Criterio | Evidencia | Procedencia |
|---|---|---|---|
| #18 | 403/404 en seis operaciones; `AGRO_API_BASE_URL` ausente, válida, http e ilegible | `OE3_HOST_CIERRE_2026-11-03.md` (MOB #183) | HOST, con mutaciones |
| #19 | Corte durante el vínculo (DEVICE-C) y reactivación en el mismo proceso (DEVICE-F) | `OE3_DEVICE_POCO_2026-11-03.md`, P-01 y P-02 (MOB #184) | DEVICE (POCO) |
| #20 | Almacén seguro con commit A/B, puntero y corrupción | `secure_session_store_test`; Mobile `F03_MOB_AUTH_03_DEVICE_VALIDATION.md` (DEVICE-01 a 12 y 14 a 18) | HOST y DEVICE |
| #21 | Arranque sin red; almacén entero dañado | P-03 y evidencias previas | DEVICE |
| #22 y #71 | Refresh, revocación y desactivación con escaneo ampliado de logcat | P-04 | DEVICE |
| #76 | Respaldo de otro Member rechazado | P-05 | DEVICE |

**Excepciones que la ratificación aceptaría,** una por una:

| Excepción | Criterio | Evidencia | Riesgo | Por qué no se midió |
|---|---|---|---|---|
| E-F03-3 | #20, restauración por Auto Backup y D2D | Reglas de exclusión de la APK (inspección) | Que Android restaure credenciales en otra instalación | Requiere un ajuste global o un reset, no autorizados |
| E-F03-4 | #20, corte de energía | Ninguna | Corrupción del almacén seguro | Cortar la energía no está autorizado |
| E-F03-5 | #21, versión incompatible real y Keystore | HOST, más el almacén entero dañado en DEVICE | Comportamiento ante un Keystore invalidado | La versión va cifrada y no se puede fabricar sin la clave; el Keystore requiere root |
| E-F03-7 | Un solo modelo de teléfono | POCO X5 Pro | Diferencias entre fabricantes | El HONOR no estuvo conectado. El autor mantiene esta comprobación como pendiente real (2026-11-03) |

**Texto para firmar, si se decide:**

> «Ratifico GATE-F03 = Passed exclusivamente para el alcance académico con datos sintéticos, sobre la evidencia citada, aceptando / rechazando [marcar] las excepciones E-F03-3, E-F03-4, E-F03-5 y E-F03-7. Evidence se mantiene Partial. No habilita datos reales.»

**Decisión de Roderich Rendón:** pendiente.

---

## Acta propuesta: GATE-F04 (Mobile #28), ratificación

**Alcance:** académico, con datos sintéticos.

**Lo acreditado.**
- **Modos propio y compartido:** P-06 a P-10 sobre `b7a9813`, que desciende de `ad5b43d`.
- **Transferencia y reversión en modo compartido:** P-08.
- **Aplicación multiproducto en modo compartido sin red:** `OE3_DEVICE_POCO_2_2026-11-03.md` §4.
- **Pagos y compra revertida:** HOST (#45, MOB #183).
- **Necesidad posterior a hoy:** HOST (#122).
- **Cámara:** doble de prueba en HOST (#44). No es una cámara física.
- **Acta corregida el 2026-11-03:** la cita de P9 y D-F04-C1.

**Excepciones pendientes de medición: ninguna.**

**Lo que no está decidido:** la especificación de pagos y cuentas (MOB #182) es una **propuesta no aprobada**, y Q-03, Q-04 y Q-06 no se implementan. No forma parte de esta ratificación.

**Texto para firmar, si se decide:**

> «Ratifico GATE-F04 = Passed exclusivamente para el alcance académico con datos sintéticos, con el acta corregida el 2026-11-03 y la evidencia citada. Evidence se mantiene Partial. La especificación de pagos y cuentas sigue como propuesta.»

**Decisión de Roderich Rendón:** pendiente.

---

## Propuesta de aceptación académica: GATE-F07 (Backend #29)

**Criterios 1–8:** evidenciados con datos sintéticos (`F07_CIERRE_MATRIZ.md` §7.2). La DEMO del 2026-11-03 reprodujo además, con el Backend real:
- el consolidado con el umbral provisional k = 3;
- la propuesta conjunta;
- la exportación CSV;
- el sellado por la API.

Todo eso es una demostración, no una evidencia nueva de cierre.

**Excepción explícita al criterio 9:**

| Campo | Contenido |
|---|---|
| Criterio | «Dado que F07-POL-01 o F07-REC-01 siguen abiertos, cuando se evalúa GATE-F07, entonces el gate permanece Pending» |
| Evidencia | #108 cerrado. #107: política construida y probada con datos sintéticos; registro institucional en blanco |
| Riesgo | Que la aceptación académica se lea como aprobación de la política o de la divulgación real |
| Mitigación | El texto de la decisión, `POLICY_PENDING` en producción y #107 abierto |
| Por qué no se puede completar | El cierre de #107 requiere la decisión del autor (A1–A7), la validación de la Directiva y la revisión del tutor |

**Otras excepciones de F07:**
- **#24, detalle por agricultor:** no se construyó, por la decisión del 2026-10-16 (ADR-003). Sin riesgo de privacidad.
- **#25:** criterios sustituidos el 2026-10-16.

**Texto para firmar, si se decide:**

> «Acepto GATE-F07 = Passed exclusivamente para el alcance académico con datos sintéticos, sobre la evidencia de los criterios 1–8 en `main` `5973b49`, y exceptúo de forma explícita el criterio 9: #107 sigue abierto como condición para mostrar cifras reales. La aceptación no procede del tutor ni de la Directiva y no habilita datos reales.»

**Decisión de Roderich Rendón:** pendiente. **#107 y #151 siguen abiertos.**

---

## Pendientes, separados por tipo

| Tipo | Pendiente |
|---|---|
| **Técnico** | MOB #188, botón «+» y ocultarlo en sincronización: en borrador, falta la revisión. Observaciones sin confirmar: el texto de QUANTITY_INVALID y la divergencia local tras IDEMPOTENCY_MISMATCH. C21 máximo exacto y las variantes «inexistente» y «de otro sindicato» de C19 sin medir en DEVICE. C39 no se mide en DEVICE (cobertura en Central; justificado en `F05_SYNC_06.md` §4d) |
| **Dispositivo** | HONOR: #129 (M8 A4-F), la restauración entre modelos (#151 punto 7) y otro modelo para F03 (E-F03-7, MOB #36). Auto Backup, D2D y corte de energía, con autorización |
| **Credencial** | Sólo B2: #151 puntos 7 (variante B2) y 9 (CLI `--reconcile`) |
| **Decisión del autor** | Ratificar F03 y F04; aceptar F07; las sesiones (la anterior tras reautenticar sigue válida; las de una cuenta desactivada reviven); la primacía del contrato F06 (BE #21, MOB #32–#34); las preguntas de pagos y cuentas que cambian el comportamiento (Q-03, Q-04 y Q-06; no se implementan ahora) |
| **Directiva y tutor** | #107 (F07-POL-01), con la hoja de revisión §7; la revisión de la especificación MOB #182 |
