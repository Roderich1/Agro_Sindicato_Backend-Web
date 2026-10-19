# Fixture de usabilidad (DS-UX) y valores esperados de T3 y W1–W3

**Estado (2026-10-18, La Paz):** composición **fijada por la v1.4 del protocolo** (§3.3.1), por la aprobación técnica delegada de Roderich del 2026-10-18, antes del piloto. La propuesta original es de la sesión C (2026-10-16); los cambios de la v1.4 se marcan con «(v1.4)». **Generadores:** Móvil, sesión C (`tool/f10_ux/` en Mobile); Central/Web, sesión B (Backend). Se versionan con **semilla 20261018** y **fecha de sesión como parámetro** antes del piloto. Ninguna sesión ejecutada.

La sesión A opera el teléfono y prepara cada instalación de `.f10ux`. Los valores esperados **se registran antes de la primera sesión**, consultando el entorno ya sembrado y contrastándolos con el oráculo independiente. No se suponen.

**Por qué hace falta:**
- las tarjetas (protocolo §3.4, igual en v1.2, v1.3 y v1.4; la v1.5 sólo precisa la consigna de T3) usan «Glifosato Demo», «Bellator»/«Belator», «parcela Norte» y «Verano Demo»;
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
| Modalidad (v1.4) | **Propia o compartida**, según el diseño de la muestra (§3.3: al menos 1 participante en modalidad compartida). El generador recibe la modalidad (`F10_UX_MODALIDAD`; acepta `INDIVIDUAL` de la hoja de registro como sinónimo de `PROPIA`) y se niega si no coincide con la elegida al activar. No se usa modalidad propia para todos por comodidad del arnés | Todas |
| Persona familiar (v1.4, sólo compartida) | «Familiar Demo», para que la elección de persona y las asignaciones de T1/T2 sean reales | T1, T2, T3 |
| Generador (v1.4) | `tool/f10_ux/seed_dsux_mobile.dart` (sobre la base extraída de `.f10ux`), `dsux_fixture.dart` (composición y semilla), `oracle_dsux_mobile.dart` (lectura del estado guardado; no corrige nada). Parámetros: `F10_UX_DB`, `F10_UX_SESSION_DATE`, `F10_UX_MODALIDAD`, `F10_UX_REFERENCES` (JSON de `GET /api/v1/sync/v1/references` del tenant Móvil) | — |
| Red | Encendida al empezar. El facilitador la apaga antes de T1 y la enciende antes de T5 (guion §6) | T1, T4, T5 |

**Ejecución nominal (v1.4):** tras T1 (+2 L de Glifosato Demo, +500 mL de Bellator) y T2 (−1 L, −200 mL): **Glifosato Demo 6 L y Bellator 1,3 L**.

**Por qué 1 L inicial de Bellator:** sin stock previo, un fallo en T1 impediría T2 (aplicar 200 mL sin saldo). Con 1 L, T2 es posible aunque T1 haya fallado, y T6 (5 L) es siempre insuficiente: el máximo posible es 1 L + 500 mL.

## 2. Hoja de valores esperados — T3 (Móvil)

T3 mide **leer** el saldo y sus movimientos, no repetir T1 y T2. La respuesta correcta es la que la aplicación tiene guardada en ese momento:

> **Saldo esperado de Bellator (total)** = 1 000 mL (inicial) + compras de Bellator **guardadas** en T1 − aplicaciones de Bellator **guardadas** en T2, **sumando a todas las personas de la instalación**

**Precisión v1.5 (decisión de Roderich Rendón del 2026-10-19 («Agrocuentas: integraciones, T3 y conciliación de tarjetas EI/REC», §2)):** la tarjeta (TAR-2) pregunta «¿Cuánto Bellator queda **en total** y qué movimientos explican ese saldo?». T3 se evalúa por el **saldo total** y por los movimientos que lo explican. En modalidad propia, el total coincide con el saldo del titular. En modalidad compartida:

- el oráculo (`by_person_base`) da el saldo de cada persona (titular y «Familiar Demo») como **datos separados**; el facilitador los anota junto al total, en mL y en L;
- la parte de una persona **no equivale al total** cuando son cantidades distintas. Ejemplo: con 1,3 L en total y 0,8 L del titular, responder sólo «0,8 L» no completa T3; mostrar esa parte y después identificar 1,3 L sí puede completarla, con las ayudas anotadas según el guion §4;
- las cantidades equivalentes en litros y mililitros son la misma respuesta (1 300 mL = 1,3 L);
- las asignaciones y consumos que haya guardado el participante **no se corrigen**: el total se calcula sobre lo guardado.

| T1 guardó (Bellator) | T2 guardó (Bellator) | Saldo esperado | Movimientos que debe señalar |
|---|---|---|---|
| 500 mL | 200 mL | **1 300 mL (1,3 L)** | Compra inicial (+1 L), compra de hoy (+500 mL) y aplicación de hoy (−200 mL) |
| nada | 200 mL | 800 mL | Compra inicial y aplicación de hoy |
| 500 mL | nada | 1 500 mL | Compra inicial y compra de hoy |
| nada | nada | 1 000 mL | Compra inicial |
| Otro valor (error crítico en T1 o T2) | — | El que muestre la aplicación | Los guardados. El error crítico ya se registró en su tarea |

Los saldos de la tabla son **totales**. En modalidad compartida, cómo se reparten entre el titular y «Familiar Demo» depende de las asignaciones guardadas en T1 y T2 (la existencia inicial de 1 L está asignada al titular); el reparto se anota, pero no cambia el valor que se juzga.

**Antes de entregar la tarjeta T3,** el facilitador consulta en silencio el **saldo total** en Inventario y lo anota en la hoja de registro (columna Notas de T3), en mL y en L; en compartida, también la parte de cada persona. El éxito se juzga contra ese valor. **(v1.4)** Después de la sesión, `oracle_dsux_mobile.dart` (sólo lectura) obtiene el oráculo condicionado a lo guardado, que debe coincidir con lo anotado. **Los errores del participante no se corrigen en secreto**, ni antes ni después de T3.

## 3. Backend y Web (entorno central de la evaluación Web, **separado** del de las sesiones Móvil)

Si las sesiones Móvil sincronizan con el mismo Central, las necesidades de T4/T5 alterarían el total de W1. Por eso, la Web se evalúa en un **tenant propio** que ninguna sesión Móvil toca, y se **vuelve a sembrar antes de cada participante Web**: W3 y W4 modifican el estado (asociación y borrador).

| Elemento | Valor propuesto | Para qué tarea |
|---|---|---|
| Campaña | «Verano Demo» | W1, W2, W4 |
| Productos centrales | «Glifosato Demo», «Bellator» y **«Belator»**, este último como producto aparte **sin asociar** a Bellator | W1, W3 |
| Miembros AGRICULTOR | **M = 6** sintéticos (M1–M6) **y ningún otro AGRICULTOR activo en el tenant**; la Directiva y el Administrador no cuentan en el denominador | W2 |
| Necesidades declaradas de Glifosato Demo en Verano Demo | **M1 20 L, M2 35 L, M3 45 L, M4 50 L** (total 150 L) | W1, W2, W4 |
| Necesidades de Bellator (v1.4) | **M1 3 L, M2 4 L, M3 5 L** (12 L) | W3, W4 |
| Necesidades de Belator (v1.4) | **M1 1 L, M2 2 L, M3 3 L** (6 L); tras asociar en W3, **18 L con 3 aportantes bajo el nombre canónico que elija el participante** (Bellator o Belator: los dos sentidos cumplen la tarjeta) | W3, W4 |
| M5 y M6 (v1.4) | **No aportan a ninguna celda** | W2 |
| Estado al empezar cada participante Web (v1.4) | **Tenant nuevo** por participante Web (D01, D02, piloto X01), sembrado con la misma composición; los anteriores se conservan intactos (asociaciones y divulgaciones no se pueden borrar sin desactivar protecciones). W3 **sin asociación** Belator–Bellator; W4 **sin borradores previos** | W3, W4 |
| Generador (v1.4) | Sesión B, Backend, por el patrón de `f07-synthetic-seed.cjs`; semilla 20261018 y fecha de sesión como parámetro; oráculo independiente | — |
| Divulgación | Modo `provisional-synthetic`, con el entorno de la v1.2 §0.4 (`NODE_ENV=development`) porque F07-POL-01 (#107) no está aprobada; k = 3 | W1–W4 |

**Por qué 4 de 6:** con k = 3, una celda con menos de 3 miembros se suprime y W1 no tendría un número que leer. Con 4 declarantes, la cifra se publica. Con M = 6, «4 de 6» deja dos miembros sin declarar, que es lo que W2 pide distinguir de cero.

**Precisión de cobertura (v1.4):** el código actual calcula los miembros con aportación (`members_with_contribution`) como la **unión** de los miembros presentes en las cifras publicadas, no sólo los que aportan Glifosato Demo. Por eso no basta con «cuatro aportan Glifosato y tres cada otro producto»: la composición se fija miembro a miembro (Bellator y Belator sólo M1–M3; M5 y M6 nada) para que la unión sea **M1–M4** y la cobertura sea **«4 de 6» antes y después de W3**. Si con la política actual (sin desactivar protecciones) la Web mostrara otra cobertura, se corrige la siembra, no el criterio.

## 4. Hoja de valores esperados — W1 y W2 (Web)

| Tarea | Valor esperado con la fixture propuesta | Cómo se confirma antes de la sesión |
|---|---|---|
| W1 | Necesidad declarada total de Glifosato Demo en Verano Demo = 20 + 35 + 45 + 50 = **150 L** | Abrir el resumen con la cuenta de Directiva del entorno sembrado y anotar el valor mostrado. Si difiere de 150 L, se corrige la fixture, no el valor esperado |
| W2 | Cobertura **«4 de 6»**, antes y después de W3. Los 2 que no declararon **no** cuentan como cero | Ídem, con la línea de cobertura, y contraste con la API y con el oráculo independiente (v1.4) |
| W3 (v1.4) | Asociación confirmada con motivo y visible en el historial; **18 L con 3 aportantes bajo el canónico elegido** (12 + 6); la otra denominación queda como fila **«Oculto (revisión)»** sin cifra («La cifra anterior se retiró por… una reagrupación…») y la línea de cobertura añade «Hay filas sin cifra (bajo el umbral o en revisión): sus aportes no se cuentan aquí.»; cobertura **«4 de 6»** | **Comprobado por la sesión B el 2026-10-19 03:22–03:25Z** sobre `df0df1d` con su generador Central (PR BE #145), en los dos sentidos (48/48 comprobaciones en cada uno) |
| W4 (v1.4) | Un borrador en el historial; CSV con Glifosato Demo 150 L y el canónico 18 L (la fila oculta se conserva sin cifra) | Ídem |

El valor que se registra en la hoja es **el que muestra la Web sembrada antes de la primera sesión**, con su fecha real y el SHA del entorno. Si el total aparece en otra unidad (por ejemplo, 150 000 mL), se acepta como correcta la lectura equivalente. Esta equivalencia se fija en el piloto.

## 5. Pendiente para quien construya la fixture

- [ ] Generador reproducible y versionado, con su semilla (20261018) y la fecha de sesión como parámetro, para el Móvil (`.f10ux`, sesión C) y para el Central Web (sesión B). Integrados antes del piloto.
- [ ] Comprobar en la versión fijada que los nombres de §1 y §3 aparecen tal cual en la interfaz.
- [ ] Registrar, antes de la primera sesión, los valores esperados reales de T3 (tabla de §2) y de W1/W2 (§4).
- [ ] Confirmar que W3 parte de «Belator» sin asociar y que W4 puede generar un borrador con esos datos.
- [ ] Que la siembra no reutilice ni borre ningún entorno conservado (protocolo §0).
- [ ] (v1.4) Tenant Web aislado del tenant de las sesiones Móvil; un tenant nuevo por participante Web (sin borrar los anteriores).
- [x] (v1.4 → **v1.5, decidido por Roderich el 2026-10-19**) T3 en modalidad compartida: se juzga el **saldo total** (todas las personas); la parte del titular no lo sustituye cuando es distinta. Consigna precisada en TAR-2 y guion GUION-2 (§2).
- [ ] (v1.5) **Para observar en el piloto:** si «en total» se entiende igual en las dos modalidades. Si el piloto muestra ambigüedad, se registra como problema del instrumento y la redacción definitiva se fija antes de la muestra (`08_…` §4).
- [ ] (v1.4) **Para observar en el piloto:** la tarjeta T2 dice «parcela Norte» y la app rotula «Chaco»; T1 y T2 piden mL y la app registra en L (el participante teclea 0,5 y 0,2); las pistas del guion §6 se comprueban contra las etiquetas actuales («Necesidad declarada al sindicato», «Sincronización con el sindicato», «Aplicaciones», «Inventario»).
- [ ] (v1.4) El escenario del preflight E2E de la sesión A (20 L desde el teléfono + 2 aportantes sintéticos de 20 L = 60 L) vive en un entorno propio y **no** se mezcla con este tenant ni con el oráculo de 150 L.
