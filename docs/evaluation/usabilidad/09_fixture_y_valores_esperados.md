# Fixture de usabilidad (DS-UX) y valores esperados de T3 y W1 — PROPUESTA, no ejecutada

**Estado:** propuesta de la sesión C del 2026-10-16. **No se ha construido ni ejecutado.**

La construyen y siembran quienes preparan el entorno de evaluación: la sesión A para el Móvil (paquete `.f10ux`) y la sesión A o B para el Backend y la Web. Los valores esperados **se registran antes de la primera sesión**, consultando el entorno ya sembrado. No se suponen.

**Por qué hace falta:**
- las tarjetas (protocolo v1.1 §3.4) usan «Glifosato Demo», «Bellator»/«Belator», «parcela Norte» y «Verano Demo»;
- el dataset D4 (`docs/evidence/F06_DATASET.csv` en Mobile) tiene «Belator», «Bellator», «Glifosato F06», «Urea F06» y «Mancozeb F06», con campañas C1/C2;
- **en D4 no existen** «Glifosato Demo», «Verano Demo» ni la parcela «Norte».

Hallazgo de la revisión de A.

## 1. Móvil (por participante, en una instalación nueva de `.f10ux`)

| Elemento | Valor propuesto | Para qué tarea |
|---|---|---|
| Titular | Cuenta sintética nueva, activada por el facilitador (P01…) | Todas |
| Campaña activa | «Verano Demo», abierta y con fecha de hoy dentro de su rango, **vinculada** a la campaña central «Verano Demo» | T4, T5 |
| Chacos | «Norte» y «Sur» (distractor) | T2 |
| Proveedor | «Proveedor Demo» | T1 |
| Productos | «Glifosato Demo» (L, base mL) y «Bellator» (L, base mL), **vinculados** a los productos centrales homónimos | T1–T6 |
| Stock inicial | Glifosato Demo **5 L** y Bellator **1 L**, cada uno con una compra fechada hace 10 días | T2, T3, T6 |
| Red | Encendida al empezar. El facilitador la apaga antes de T1 y la enciende antes de T5 (guion §6) | T1, T4, T5 |

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

**Antes de entregar la tarjeta T3,** el facilitador consulta en silencio el saldo en Inventario y lo anota en la hoja de registro (columna Notas de T3). El éxito se juzga contra ese valor.

## 3. Backend y Web (entorno central de la evaluación Web, **separado** del de las sesiones Móvil)

Si las sesiones Móvil sincronizan con el mismo Central, las necesidades de T4/T5 alterarían el total de W1. Por eso, la Web se evalúa en un **tenant propio** que ninguna sesión Móvil toca, y se **vuelve a sembrar antes de cada participante Web**: W3 y W4 modifican el estado (asociación y borrador).

| Elemento | Valor propuesto | Para qué tarea |
|---|---|---|
| Campaña | «Verano Demo» | W1, W2, W4 |
| Productos centrales | «Glifosato Demo», «Bellator» y **«Belator»**, este último como producto aparte **sin asociar** a Bellator | W1, W3 |
| Miembros AGRICULTOR | **M = 6** sintéticos | W2 |
| Necesidades declaradas de Glifosato Demo en Verano Demo | **4 miembros**: 20 L, 35 L, 45 L y 50 L | W1, W2, W4 |
| Otras necesidades | Bellator 3 miembros y Belator 3 miembros, para que exista algo que reconciliar y el resultado de W3 sea visible | W3, W4 |
| Divulgación | Modo `provisional-synthetic`, con el entorno de la v1.1 §0.4 (`NODE_ENV=development`) porque F07-POL-01 (#107) no está aprobada; k = 3 | W1–W4 |

**Por qué 4 de 6:** con k = 3, una celda con menos de 3 miembros se suprime y W1 no tendría un número que leer. Con 4 declarantes, la cifra se publica. Con M = 6, «4 de 6» deja dos miembros sin declarar, que es lo que W2 pide distinguir de cero.

## 4. Hoja de valores esperados — W1 y W2 (Web)

| Tarea | Valor esperado con la fixture propuesta | Cómo se confirma antes de la sesión |
|---|---|---|
| W1 | Necesidad declarada total de Glifosato Demo en Verano Demo = 20 + 35 + 45 + 50 = **150 L** | Abrir el resumen con la cuenta de Directiva del entorno sembrado y anotar el valor mostrado. Si difiere de 150 L, se corrige la fixture, no el valor esperado |
| W2 | Cobertura **«4 de 6»**. Los 2 que no declararon **no** cuentan como cero | Ídem, con la línea de cobertura |

El valor que se registra en la hoja es **el que muestra la Web sembrada antes de la primera sesión**, con su fecha real y el SHA del entorno. Si el total aparece en otra unidad (por ejemplo, 150 000 mL), se acepta como correcta la lectura equivalente. Esta equivalencia se fija en el piloto.

## 5. Pendiente para quien construya la fixture

- [ ] Generador reproducible y versionado, con su semilla (decisiones de cierre §2, «Base de evaluación y datos»), para el Móvil (`.f10ux`) y para el Central Web.
- [ ] Comprobar en la versión fijada que los nombres de §1 y §3 aparecen tal cual en la interfaz.
- [ ] Registrar, antes de la primera sesión, los valores esperados reales de T3 (tabla de §2) y de W1/W2 (§4).
- [ ] Confirmar que W3 parte de «Belator» sin asociar y que W4 puede generar un borrador con esos datos.
- [ ] Que la siembra no reutilice ni borre ningún entorno conservado (protocolo v1.1 §0).
