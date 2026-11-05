# OE3: borradores de decisión para el autor (2026-11-03)

**Estado:** borrador. **Nada de esto está decidido ni aplicado.**
- **Quién lo prepara:** la sesión de Claude Code, a pedido de Roderich Rendón.
- **Quién decide:** solo Roderich, con confirmación explícita, en un archivo de decisión aparte, como en GATE-F08 y GATE-F12.
- **Lo que no es:** no atribuye ninguna revisión al tutor ni a la Directiva, y no registra una inspección personal que no ocurrió.
- **Base:** Backend `main` `5973b49`; Mobile `main` `5b5b318`. Inventario en `OE3_CIERRE_INVENTARIO_2026-11-03.md`.

> **Actualización del 2026-11-03 (noche).** Se eliminaron de las tablas las excepciones que la ejecución dejó cubiertas, cada una con su evidencia:
> - **E-F03-1**, #19 corte durante el vínculo: P-01 en MOB `OE3_DEVICE_POCO_2026-11-03.md`, integrado en `main` `0752127` (MOB #184).
> - **E-F03-2**, #19 reactivación en el mismo proceso: P-02, ídem.
> - **E-F03-6**, #71 E-1 con escaneo ampliado: P-04, ídem.
> - **E-F04-1**, transferencia en modo compartido en DEVICE: P-08, ídem.
> - **E-F04-3**, modalidad compartida sobre un SHA posterior a `ad5b43d`: P-06 a P-10, ídem.
> - **E-F04-2**, aplicación multiproducto en modo compartido sin red: §4 de MOB `OE3_DEVICE_POCO_2_2026-11-03.md` (MOB PR #187, en borrador).
>
> Siguen E-F03-3, E-F03-4, E-F03-5 (reducida) y E-F03-7. Nada de esto ratifica ningún gate.

## 1. Ratificación de GATE-F03 (MOB #23)

**Situación.**
- **Estado:** Gate Passed para el alcance académico, por delegación técnica. Evidence Partial.
- **Revisión del autor:** «Revisión personal de Roderich Rendón: no consta» (`GATE_F03_DECISION.md`).
- **Criterio 6:** «Internet solo al instalar, después sin red; un refresh inválido no destruye SQLite». Acreditado en DEVICE: #19, #21, #71 E-1/E-2 y P1/P11.

**Texto propuesto para la decisión** (si el autor la confirma):

> «Ratifico GATE-F03 = Passed exclusivamente para el alcance académico con datos sintéticos, sobre la evidencia de `GATE_F03_DECISION.md` y su anexo del 2026-11-03. Evidence se mantiene Partial. No habilita datos reales.»

**Excepciones que la ratificación implicaría,** cada una para aceptar o rechazar por separado:

| Excepción | Criterio | Evidencia disponible | Riesgo | Por qué no se completó la medición |
|---|---|---|---|---|
| E-F03-3: #20, restauración de Auto Backup y D2D | #20, «según aplique» | Inspección del APK (reglas de exclusión) | Que Android restaure credenciales a otra instalación | Auto Backup necesita cambiar el transporte de copia (ajuste global); D2D necesita un reset. Ninguno está autorizado |
| E-F03-4: #20, corte de energía | Ídem | Ninguna | Corrupción del almacén seguro en un apagado | No está autorizado cortar la energía |
| E-F03-5: #21 21-E (almacén incompatible y keystore) | #21, «según aplique» | P13: un slot cifrado dañado en DEVICE | Otros daños del almacén | El almacén es medible con una APK debug (P-03); **el keystore no sin root**. **2026-11-03:** almacén entero dañado PASS (P-03, MOB #184). La excepción se **reduce** a la versión incompatible real (no fabricable sin la clave) y al Keystore |
| E-F03-7: un solo modelo de teléfono | — | POCO X5 Pro | Diferencias de fabricante (MIUI frente a otros) | El HONOR no se usó para F03 |

## 2. Ratificación de GATE-F04 (MOB #28)

**Situación.**
- **Estado:** Gate Passed para el alcance académico, por delegación. Evidence Partial.
- **Corregido el 2026-11-03** ([anexo](https://github.com/Roderich1/AppMovilAgroquimico/issues/28#issuecomment-6608323341)): la cita de «DEVICE P9» para la transferencia era incorrecta, y el límite RF-03 (D-F04-C1) está superado por las operaciones tardías en DEVICE (B1–B3).

**Texto propuesto:**

> «Ratifico GATE-F04 = Passed exclusivamente para el alcance académico con datos sintéticos, con el acta corregida el 2026-11-03 y las excepciones que se aceptan abajo. Evidence se mantiene Partial.»

**Excepciones de GATE-F04 pendientes de medición: ninguna.** E-F04-1, E-F04-2 y E-F04-3 quedaron cubiertas (nota inicial). La ratificación sigue siendo una decisión del autor.

## 3. Propuesta de aceptación académica de GATE-F07 (BE #29), con excepción explícita al criterio 9

**Situación.**
- **Criterios 1–8:** evidenciados con datos sintéticos (`F07_CIERRE_MATRIZ.md` §7.2).
- **Criterio 9:** «con F07-POL-01 (#107) abierto, el gate sigue Pending». #107 espera la decisión del autor, la validación de la Directiva y la revisión del tutor (`F07_POL_01_REVISION_INSTITUCIONAL.md` §7).

**Texto propuesto:**

> «Acepto GATE-F07 = Passed exclusivamente para el alcance académico con datos sintéticos, sobre la evidencia de los criterios 1–8 en `main` `5973b49`. **Exceptúo de forma explícita el criterio 9** para este alcance: #107 sigue abierto como condición para mostrar cifras reales y su cierre requiere mi decisión, la de la Directiva y la revisión del tutor. La aceptación no procede del tutor ni de la Directiva y no habilita datos reales: `POLICY_PENDING` sigue en producción.»

**La excepción al criterio 9:**

| Campo | Contenido |
|---|---|
| Criterio | 9: «Dado que F07-POL-01 o F07-REC-01 siguen abiertos, cuando se evalúa GATE-F07, entonces el gate permanece Pending» |
| Evidencia disponible | #108 cerrado. #107: política construida y probada con datos sintéticos; registro institucional en blanco |
| Riesgo | Que la aceptación académica se lea como aprobación de la política o de la divulgación real. Se mitiga con el texto de la decisión, `POLICY_PENDING` en producción y #107 abierto |
| Por qué no se pudo completar | El cierre de #107 depende de la Directiva y del tutor, ajenos al desarrollo, y de decisiones del autor (A1–A7) que hoy no constan |

**Otras excepciones de F07** que la decisión debe nombrar si se aceptan:
- **Criterio 4 de #29 / #24, detalle por agricultor:** no construido por la decisión del 2026-10-16. Riesgo: ninguno de privacidad, porque solo se muestra el agregado. Motivo: alcance decidido (ADR-003).
- **#25, criterios originales:** sustituidos el 2026-10-16. Riesgo: que se lean como incumplidos. Motivo: ídem.

**Cómo aplicarla, si se decide** (no aplicado):
1. archivo `docs/evidence/F07_GATE_DECISION.md`;
2. comentario en #29;
3. Gate → Passed, Evidence según la decisión;
4. #107 sigue abierto y sin cambios.

## 4. Otras decisiones puntuales del inventario

| Ítem | Decisión | Opciones |
|---|---|---|
| MOB #36 | **Ya no es una decisión:** el autor mantiene la comprobación en otro modelo como pendiente real (2026-11-03); la reinstalación del mismo POCO no es equivalente | Requiere el HONOR (H-02) |
| BE #18, filas Mobile | Medidas en el teléfono el 2026-11-03 (MOB PR #187). Quedan sin DEVICE: C39 (Central no reabre una campaña cerrada y la app no reenvía un REJECTED), el máximo exacto de C21 y las variantes «inexistente» y «de otro sindicato» de C19 | Aceptar C39 sin DEVICE con su motivo / pedir las otras dos |
| BE #24 y #25 | Criterios recortados por delegación | Excepción explícita (§3) / mantener Partial |
| MOB #32, #33, #34 y BE #21 | La primacía del contrato F06 como cumplimiento | Confirmar / mantener Partial |
| Sesión anterior tras reautenticar (MOB PR #187 §3) | Sigue siendo una credencial válida en el servidor hasta 7 días; el contrato escrito no lo prohíbe | Mantener el diseño / logout *best-effort* tras el commit / revocación en Central de las otras sesiones del registro |
| Sesiones de una cuenta desactivada | Sin autorización efectiva mientras dura; reviven al reactivar la cuenta | Mantener (inactividad reversible) / revocarlas al desactivar |
| MOB #45 y #49 | La especificación propuesta (PR Mobile de especificación) | Revisar con el tutor; no aprobada |
