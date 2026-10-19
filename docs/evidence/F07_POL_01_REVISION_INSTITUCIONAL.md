# F07-POL-01 (#107) — Hoja para la revisión institucional

- **Preparada por** la sesión C de Claude Code el 2026-10-17 (America/La_Paz), sobre Backend/Web `main` `e4b9c29`, por pedido de Roderich Rendón.
- **Consolidación del 2026-10-17:** esta hoja incorpora los ejemplos sintéticos y las preguntas de BE #133; las notas de cierre de #23 se conservan en sus documentos de origen. Es el único paquete de revisión de #107 (BE #135).
- **Qué es:** el material y el formato para que una revisión real **pueda hacerse**.
- **Qué no es:** no registra ninguna aprobación, firma, fecha ni respuesta de la Directiva, del tutor ni de Roderich, porque ninguna ha ocurrido. Todos los campos del §5 están vacíos a propósito. Un campo vacío significa «no ocurrió».
- **Fuentes:**
  - el paquete técnico [`F07_POL_01_PAQUETE_DECISION.md`](F07_POL_01_PAQUETE_DECISION.md);
  - la política [`F07_AGGREGATE_DISCLOSURE_POLICY.md`](../architecture/F07_AGGREGATE_DISCLOSURE_POLICY.md);
  - el registro [`F07_POL_01.md`](F07_POL_01.md).
  Esta hoja no cambia ninguna regla y, si discrepa de ellos, mandan ellos.

## 1. Qué se pide revisar, en palabras simples

La Web puede mostrar a la Directiva **totales por producto** de dos tipos:
- lo que los agricultores **declaran que necesitarán** en una campaña;
- lo que **consumieron**.

Sirve para planificar compras conjuntas. Se pide decidir si se acepta mostrar esos totales y con qué regla.

**Lo que se mostraría:**
- un total por campaña, producto y unidad, con cuántos agricultores aportan a ese total;
- la fecha de los datos;
- cuántos agricultores, de los vinculados, están incluidos.

**A quién:** sólo a las cuentas de **Directiva** y **Administrador** del mismo sindicato. Un agricultor no lo ve, ni otro sindicato.

**Lo que nunca se muestra:**
- lo que declaró o consumió **un agricultor concreto**;
- listas de nombres, parcelas o dispositivos;
- un total sumado «del sindicato» que esconda que faltan agricultores.

**La regla propuesta (k = 3):**
- un total sólo se muestra si lo forman **al menos 3 agricultores distintos**;
- si son menos, aparece como «suprimido», con un motivo comprensible y sin cantidad ni conteo exacto, nunca como cero;
- si un total nuevo, comparado con los ya mostrados, permitiría deducir lo de menos de 3 agricultores, no se publica: se mantiene el anterior marcado como pendiente, si sigue siendo admisible, o se retira la cifra;
- si alguien se da de baja o un aporte se disputa, el total se retira.

## 2. Lo que la regla no protege, y hay que aceptarlo o no

- **Si dos agricultores se ponen de acuerdo** y comparten sus cifras, pueden deducir la de un tercero en un total de 3.
- **Si alguien ya conoce por fuera** lo que usa otro agricultor, la regla no lo impide.
- **Con muy pocos agricultores vinculados,** casi todo queda suprimido. Con un umbral mayor, por ejemplo 5, en un piloto de una docena de agricultores (dato del paquete §2) se suprimiría casi todo.
- **Se notan algunas señales:** que un total cambió (no cuánto), cuántos agricultores tienen cifras publicadas y la hora de los datos.

**k = 3 no hace anónimos los datos.**

## 2.1 Ejemplos con datos sintéticos de D4

Son ejemplos del conjunto controlado de [`F06_RECONCILIATION.md`](F06_RECONCILIATION.md), no datos de agricultores reales. En ese conjunto aportan tres agricultores sintéticos y hay doce vinculados. Necesidad declarada y consumo son conceptos distintos; no se suman entre sí, entre productos ni entre unidades. Un cero declarado cuenta como aporte; una declaración ausente no se interpreta como cero.

| Campaña | Producto | Concepto | Qué se muestra con la política sintética |
|---|---|---|---|
| Verano 2026 | Urea | Necesidad declarada | 25 KG, 3 agricultores |
| Verano 2026 | Glifosato | Consumo | 8,25 L, 3 agricultores |
| Verano 2026 | Belator, antes de reconciliar «Bellator» | Necesidad declarada | Sin cifra: no alcanza el mínimo; sin conteo exacto |
| Verano 2026 | Belator, después de reconciliar «Bellator» | Necesidad declarada | 11 L, 3 agricultores |
| Invierno 2026 | Mancozeb | Necesidad declarada | 11,5 KG, 3 agricultores |
| Ambas | Cobertura | Participación | 3 de 12 agricultores vinculados con cifras publicadas, con aviso de celdas sin cifra |

Reconciliar denominaciones requiere una asociación canónica explícita; no se unen productos por semejanza del nombre. Un borrador de propuesta de compra conjunta no ejecuta compras ni crea deudas.

Para mostrar estos ejemplos pueden usarse las capturas sintéticas de D4: [resumen original](img/f07/01-resumen-c1-raw.png), [resumen reconciliado](img/f07/05-resumen-c1-canonico.png) y [propuesta](img/f07/06-propuesta-c1-canonica.png). Las capturas de otros ensayos no representan necesariamente este conjunto.

## 3. Estado de hoy (comprobado el 2026-10-17 sobre `e4b9c29`)

- **Las cifras reales están cerradas.**
  - El modo por defecto es `POLICY_PENDING`: la Web y los CSV no muestran totales.
  - En producción, el modo de prueba se ignora.
  - Fuentes: paquete, «Estado»; política, encabezado.
- **La regla está construida y probada sólo con datos sintéticos.** Las pruebas son:
  - `Back/src/modules/collective/domain/disclosure-policy.spec.ts` (30 casos en `main`);
  - `collective-config.spec.ts`;
  - `f06-coll-05-collective-aggregate.postgres.spec.ts`;
  - `f07-acceptance.postgres.spec.ts`.
  Verifican que el código hace lo que dice la política. **No sustituyen ninguna de las decisiones de abajo.**
- **#107 sigue abierto y GATE-F07 (#29) sigue Pending.**
- **Recomprobado el 2026-10-18 sobre `fd6e957`** (sesión C, por el encargo de Roderich Rendón, sección C): sin cambios en `Back/src`, `Back/prisma` ni `Web/src` desde `cab433d`; `disclosure-policy.spec.ts` sigue con 30 casos; la guarda de producción sigue probada en `Back/src/modules/collective/application/collective-config.spec.ts` («allows the provisional policy only outside production»); los ejemplos del §2.1 y sus capturas siguen vigentes. **El registro del §5 sigue en blanco porque ninguna revisión ha ocurrido.** Nadie fue contactado.

## 4. Quién decide qué

Es el orden del paquete §5, sin cambios.

| # | Quién | Qué tiene que responder |
|---|---|---|
| 1 | **Roderich Rendón, como autor** | (a) si aprueba el texto de la política; (b) el **k para datos reales**, con el número real de agricultores vinculados; (c) quién revisa la política y cuándo |
| 2 | **Directiva del Sindicato 19 de Agosto** | (a) si acepta la **finalidad** (planificar compras conjuntas); (b) si acepta que la Directiva y el Administrador vean **sólo totales**, con la regla del §1; (c) si acepta los límites del §2; (d) **cómo y cuándo se informa a los agricultores** de que sus declaraciones y consumos cuentan en esos totales; (e) **quién revisa la decisión y cada cuánto**; (f) **qué se hace si un agricultor pide que no se cuenten sus datos** |
| 3 | **Tutor** (GOV-01, #105) | Su revisión del entregable, en sus propios términos. Una revisión no equivale a una aprobación |

**Nota del 2026-10-19.** La política tiene una memoria técnica de divulgación, `R_DISCLOSURE_MEMORY` (`docs/architecture/F06_COLLECTIVE_PROJECTION_CONTRACT.md` §7.1). Guarda cada cifra publicada con la cantidad de cada aportación, vinculada al agricultor por su aportación, para impedir que se calcule un aporte por diferencias. Antes de admitir datos reales, la decisión del autor (fila 1) tiene que fijar también su finalidad, minimización, duración y salida. Hoy no hay ningún plazo aprobado.

**Ninguna respuesta sustituye a otra:**
- la decisión técnica delegada del 2026-10-16 no es la de la Directiva;
- un mensaje informal no es un acta;
- la revisión del tutor no es la aprobación del autor.

## 5. Registro (vacío hasta que ocurra cada revisión)

Se completa **sólo** con lo que de verdad ocurra, con fechas reales. Lo que no ocurra se deja vacío o se anota como «no ocurrió». **No se retro-fecha.**

### 5.1 Autor

- Fecha real:
- Texto de la política revisado (archivo y SHA):
- Decisión sobre el texto (aprueba / pide cambios / rechaza):
- k para datos reales y número de agricultores vinculados en que se basa:
- Memoria de divulgación (`R_DISCLOSURE_MEMORY`) para datos reales: finalidad, minimización, duración y salida:
- Responsable y fecha de la próxima revisión:
- Fórmula: «Verificado por Roderich Rendón (autor) el <fecha real>»:

### 5.2 Directiva

- Fecha real de la reunión o constancia:
- Forma (acta, constancia firmada u otra):
- Dónde se guarda el original (sin datos personales en el repositorio):
- Respuesta a 2(a) finalidad:
- Respuesta a 2(b) qué se muestra y a quién:
- Respuesta a 2(c) límites aceptados:
- Respuesta a 2(d) cómo se informa a los agricultores:
- Respuesta a 2(e) responsable y periodicidad de revisión:
- Respuesta a 2(f) tratamiento de una solicitud de exclusión:
- Observaciones o condiciones:

### 5.3 Tutor

- Fecha real:
- Material revisado (archivos y SHA):
- Observaciones:
- Registro en GOV-01 (#105):

## 6. Pase lo que pase en el §5

- **Las cifras reales no se habilitan con esta hoja.** Hace falta un PR propio con un modo nuevo y explícito para producción, con su prueba y su rollback, y sólo después de 1–3 (paquete §5, fila 5).
- **Si la Directiva pide cambios** (otro k, menos información, otra forma de informar a los agricultores), se cambia la política y se repite esta revisión sobre el texto nuevo.
- **Mientras falten 1–3, #107 sigue abierto** (paquete §5). Esta hoja no añade ni quita condiciones de cierre.
