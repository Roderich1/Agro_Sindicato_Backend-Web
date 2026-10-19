# Fixture de usabilidad (DS-UX) y valores esperados de T3 y W1–W3

**Estado (2026-10-18, La Paz):** composición **fijada por la v1.4 del protocolo** (§3.3.1), por la aprobación técnica delegada de Roderich del 2026-10-18, antes del piloto. La propuesta original es de la sesión C (2026-10-16); los cambios de la v1.4 se marcan con «(v1.4)». **Generadores:** Móvil, sesión C (`tool/f10_ux/` en Mobile); Central/Web, sesión B (Backend). Se versionan con **semilla 20261018** y **fecha de sesión como parámetro** antes del piloto. Ninguna sesión ejecutada.

La sesión A opera el teléfono y prepara cada instalación de `.f10ux`. Los valores esperados **se registran antes de la primera sesión**, consultando el entorno ya sembrado y contrastándolos con el oráculo independiente. No se suponen.

**Por qué hace falta:**
- las tarjetas (protocolo v1.2 §3.4) usan «Glifosato Demo», «Bellator»/«Belator», «parcela Norte» y «Verano Demo»;
- el dataset D4 (`docs/evidence/F06_DATASET.csv` en Mobile) tiene «Belator», «Bellator», «Glifosato F06», «Urea F06» y «Mancozeb F06», con campañas C1/C2;
- **en D4 no existen** «Glifosato Demo», «Verano Demo» ni la parcela «Norte».

Hallazgo de la revisión de A.

## 1. Móvil (por participante, en una instalación nueva de `.f10ux`)

| Elemento | Valor propuesto | Para qué tarea |
|---|---|---|
| Titular | Cuenta sintética nueva, activada por el facilitador (P01…) | Todas |
| Campaña activa | «Verano Demo», abierta, **contenida en la campaña central** «Verano Demo» (regla D-F04-C2) y con fechas que incluyen las compras iniciales y el día de la sesión (America/La_Paz); **vinculada explícitamente** a la central (v1.4) | T4, T5 |
| Chacos | «Norte» y «Sur» (distractor) | T2 |
| Proveedor | «Proveedor Demo» | T1 |
| Productos | «Glifosato Demo» (L, base mL) y «Bellator» (L, base mL), **vinculados** a los productos centrales homónimos | T1–T6 |
| Stock inicial | Glifosato Demo **5 L** y Bellator **1 L**, cada uno con una compra fechada hace 10 días, **escrita con operaciones válidas del repositorio** (no inserciones directas) (v1.4) | T2, T3, T6 |
| Modalidad (v1.4) | **Propia o compartida**, según el diseño de la muestra (§3.3: al menos 1 participante en modalidad compartida). El generador recibe la modalidad (`F10_UX_MODALIDAD`) y se niega si no coincide con la elegida al activar. No se usa modalidad propia para todos por comodidad del arnés | Todas |
| Generador (v1.4) | `tool/f10_ux/seed_dsux_mobile.dart` (sobre la base extraída de `.f10ux`), `dsux_fixture.dart` (composición y semilla), `oracle_dsux_mobile.dart` (lectura del estado guardado; no corrige nada). Parámetros: `F10_UX_DB`, `F10_UX_SESSION_DATE`, `F10_UX_MODALIDAD`, `F10_UX_REFERENCES` (JSON de `GET /api/v1/sync/v1/references` del tenant Móvil) | — |
| Red | Encendida al empezar. El facilitador la apaga antes de T1 y la enciende antes de T5 (guion §6) | T1, T4, T5 |

**Ejecución nominal (v1.4):** tras T1 (+2 L de Glifosato Demo, +500 mL de Bellator) y T2 (−1 L, −200 mL): **Glifosato Demo 6 L y Bellator 1,3 L**.

**Por qué 1 L inicial de Bellator:** sin stock previo, un fallo en T1 impediría T2 (aplicar 200 mL sin saldo). Con 1 L, T2 es posible aunque T1 haya fallado, y T6 (5 L) es siempre insuficiente: el máximo posible es 1 L + 500 mL.

## 2. Hoja de valores esperados — T3 (Móvil)

T3 mide **leer** el saldo y sus movimientos, no repetir T1 y T2. La respuesta correcta es la que la aplicación tiene guardada en ese momento:

> **Saldo esperado de Bellator** = 1 000 mL (inicial) + compras de Bellator **guardadas** en T1 − aplicaciones de Bellator **guardadas** en T2

| T1 guardó (Bellator) | T2 guardó (Bellator) | Saldo esperado | Movimientos que debe señalar |
|---|---|---|---|
| 500 mL | 200 mL | **1 300 mL (1,3 L)** | Compra inicial (+1 L), compra de hoy (+500 mL) y aplicación de hoy (−200 mL) |
| nada | 200 mL | 800 mL | Compra inicial y aplicación de hoy |
| 500 mL | nada | 1 500 mL | Compra inicial y compra de hoy |
| nada | nada | 1 000 mL | Compra inicial |
| Otro valor (error crítico en T1 o T2) | — | El que muestre la aplicación | Los guardados. El error crítico ya se registró en su tarea |

**Antes de entregar la tarjeta T3,** el facilitador consulta en silencio el saldo en Inventario y lo anota en la hoja de registro (columna Notas de T3). El éxito se juzga contra ese valor. **(v1.4)** Después de la sesión, `oracle_dsux_mobile.dart` (sólo lectura) obtiene el oráculo condicionado a lo guardado, que debe coincidir con lo anotado. **Los errores del participante no se corrigen en secreto**, ni antes ni después de T3.

## 3. Backend y Web (entorno central de la evaluación Web, **separado** del de las sesiones Móvil)

Si las sesiones Móvil sincronizan con el mismo Central, las necesidades de T4/T5 alterarían el total de W1. Por eso, la Web se evalúa en un **tenant propio** que ninguna sesión Móvil toca, y se **vuelve a sembrar antes de cada participante Web**: W3 y W4 modifican el estado (asociación y borrador).

| Elemento | Valor propuesto | Para qué tarea |
|---|---|---|
| Campaña | «Verano Demo» | W1, W2, W4 |
| Productos centrales | «Glifosato Demo», «Bellator» y **«Belator»**, este último como producto aparte **sin asociar** a Bellator | W1, W3 |
| Miembros AGRICULTOR | **M = 6** sintéticos (M1–M6) | W2 |
| Necesidades declaradas de Glifosato Demo en Verano Demo | **M1 20 L, M2 35 L, M3 45 L, M4 50 L** (total 150 L) | W1, W2, W4 |
| Necesidades de Bellator (v1.4) | **M1 3 L, M2 4 L, M3 5 L** (12 L) | W3, W4 |
| Necesidades de Belator (v1.4) | **M1 1 L, M2 2 L, M3 3 L** (6 L); tras asociar en W3, **18 L canónicos** de Bellator | W3, W4 |
| M5 y M6 (v1.4) | **No aportan a ninguna celda** | W2 |
| Estado al empezar cada participante Web (v1.4) | Tenant **restablecido**: W3 **sin asociación** Belator–Bellator; W4 **sin borradores previos** | W3, W4 |
| Generador (v1.4) | Sesión B, Backend, por el patrón de `f07-synthetic-seed.cjs`; semilla 20261018 y fecha de sesión como parámetro; oráculo independiente | — |
| Divulgación | Modo `provisional-synthetic`, con el entorno de la v1.2 §0.4 (`NODE_ENV=development`) porque F07-POL-01 (#107) no está aprobada; k = 3 | W1–W4 |

**Por qué 4 de 6:** con k = 3, una celda con menos de 3 miembros se suprime y W1 no tendría un número que leer. Con 4 declarantes, la cifra se publica. Con M = 6, «4 de 6» deja dos miembros sin declarar, que es lo que W2 pide distinguir de cero.

**Precisión de cobertura (v1.4):** el código actual calcula los miembros con aportación (`members_with_contribution`) como la **unión** de los miembros presentes en las cifras publicadas, no sólo los que aportan Glifosato Demo. Por eso no basta con «cuatro aportan Glifosato y tres cada otro producto»: la composición se fija miembro a miembro (Bellator y Belator sólo M1–M3; M5 y M6 nada) para que la unión sea **M1–M4** y la cobertura sea **«4 de 6» antes y después de W3**. Si con la política actual (sin desactivar protecciones) la Web mostrara otra cobertura, se corrige la siembra, no el criterio.

## 4. Hoja de valores esperados — W1 y W2 (Web)

| Tarea | Valor esperado con la fixture propuesta | Cómo se confirma antes de la sesión |
|---|---|---|
| W1 | Necesidad declarada total de Glifosato Demo en Verano Demo = 20 + 35 + 45 + 50 = **150 L** | Abrir el resumen con la cuenta de Directiva del entorno sembrado y anotar el valor mostrado. Si difiere de 150 L, se corrige la fixture, no el valor esperado |
| W2 | Cobertura **«4 de 6»**, antes y después de W3. Los 2 que no declararon **no** cuentan como cero | Ídem, con la línea de cobertura, y contraste con la API y con el oráculo independiente (v1.4) |
| W3 (v1.4) | Tras asociar Belator a Bellator con motivo: asociación visible en el historial; Bellator **18 L** canónicos (12 + 6) si la política publica la celda | Resultado real comprobado con la política actual antes del piloto |

El valor que se registra en la hoja es **el que muestra la Web sembrada antes de la primera sesión**, con su fecha real y el SHA del entorno. Si el total aparece en otra unidad (por ejemplo, 150 000 mL), se acepta como correcta la lectura equivalente. Esta equivalencia se fija en el piloto.

## 5. Pendiente para quien construya la fixture

- [ ] Generador reproducible y versionado, con su semilla (20261018) y la fecha de sesión como parámetro, para el Móvil (`.f10ux`, sesión C) y para el Central Web (sesión B). Integrados antes del piloto.
- [ ] Comprobar en la versión fijada que los nombres de §1 y §3 aparecen tal cual en la interfaz.
- [ ] Registrar, antes de la primera sesión, los valores esperados reales de T3 (tabla de §2) y de W1/W2 (§4).
- [ ] Confirmar que W3 parte de «Belator» sin asociar y que W4 puede generar un borrador con esos datos.
- [ ] Que la siembra no reutilice ni borre ningún entorno conservado (protocolo §0).
- [ ] (v1.4) Tenant Web aislado del tenant de las sesiones Móvil; procedimiento de restablecimiento antes de cada participante Web.
- [ ] (v1.4) El escenario del preflight E2E de la sesión A (20 L desde el teléfono + 2 aportantes sintéticos de 20 L = 60 L) vive en un entorno propio y **no** se mezcla con este tenant ni con el oráculo de 150 L.
