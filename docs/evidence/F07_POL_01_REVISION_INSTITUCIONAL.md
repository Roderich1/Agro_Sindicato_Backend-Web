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

**Nota del 2026-10-23 (sesión B).** Roderich decidió el 2026-10-23, para el entorno sintético, conservar el historial colectivo con un sellado manual (contrato F06 §7.2 y `docs/architecture/F07_SEALED_HISTORY_CONTRACT.md`).
- El sellado lo hace DIRECTIVA o ADMINISTRADOR, por campaña cerrada.
- **No hay eliminación de la memoria:** la propuesta M-2 de BE #159 se descarta.
- La versión sellada es **vinculable** a los agricultores a través de esa memoria.
- Antes de usar datos reales hay que decidir también la finalidad, los lectores y la duración del historial. Hoy no hay plazo aprobado.
- La comparación reproducible de k = 3 y k = 5 está en BE #161 (`docs/evidence/F07_POL_01_COMPARACION_K.md`), **pendiente de integrar**. Esta hoja no tiene un §2.2.

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
- Historial colectivo sellado (`R_COLLECTIVE_HISTORY`) para datos reales: finalidad, lectores y duración (campo añadido el 2026-10-23; vacío):
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
- Historial colectivo: si se conservan versiones selladas como registro histórico, quién puede consultarlas y por cuánto tiempo (campo añadido el 2026-10-23; vacío):
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

**Nota del 2026-10-23 (sesión B), añadida después del texto anterior del §6.** Sellar una campaña no habilita cifras reales, no concede permisos de lectura nuevos y no hace anónimos los datos. En `POLICY_PENDING`, tampoco las versiones selladas muestran cifras.

## 7. Actualización del 2026-11-03: estado del sistema y decisiones que faltan

*Añadida por la sesión de Claude Code el 2026-11-03 (UTC) sobre Backend/Web `main` `5973b49`, a pedido de Roderich Rendón. Lo anterior se conserva como registro. **El §5 sigue en blanco:** ninguna revisión del autor, de la Directiva ni del tutor ha ocurrido, y nadie fue contactado.*

### 7.1 Qué hace hoy el sistema (sustituye al §3 como estado vigente)

| Pieza | Estado en `5973b49` | Fuente |
|---|---|---|
| Modo de divulgación | Por defecto `POLICY_PENDING`: ni la Web ni los CSV muestran totales. `provisional-synthetic` (k = 3) solo fuera de producción; en producción se ignora | Política §9; `collective-config.spec.ts` |
| Regla k = 3, diferencias, combinaciones, membresía y cobertura | Construida y probada con datos sintéticos (`disclosure-policy.spec.ts`, 30 casos; `f07-acceptance`, `f06-coll-05` y `f10-sec-02-disclosure-gaps`). **k = 3 sigue provisional** | Política §3, §4 y §9 |
| Comparación de k = 3 frente a k = 5 | Integrada como evidencia histórica (#161, `eff4f27`), con los resultados atados a `98375dc`, anterior al sellado. Con k = 5 quedan suprimidas todas las celdas de los conjuntos DSUX (4 aportantes) y D4 (3 aportantes). **No elige k** | `F07_POL_01_COMPARACION_K.md` §3 y la nota del 2026-10-24 |
| Memoria de divulgación `R_DISCLOSURE_MEMORY` | Guarda cada cifra publicada con la cantidad de cada aportación, vinculada al agricultor, para impedir deducir un aporte por diferencias. **Sin plazo aprobado** | Contrato F06 §7.1; política §10 |
| Historial sellado `R_COLLECTIVE_HISTORY` | Sellado manual de una campaña cerrada por DIRECTIVA o ADMINISTRADOR, inmutable. `COLLECTIVE_SEALING` está **desactivado por defecto**. La política vigente puede retirar la visibilidad de una cifra sellada, nunca añadirla. Es **vinculable** a los agricultores a través de la memoria | `F07_SEALED_HISTORY_CONTRACT.md`; política §11 |
| Cobertura de consumo en los sellados | Desde la migración `20261102020000_f07_seal_consumption_coverage`, cada sellado **nuevo** guarda cuántos Members están en cifras de consumo publicadas sobre los vinculados (N de M). Mide participación, no integridad. No se reconstruye para los sellados anteriores | Contrato F12 §3.1; F07 §5.3 |
| Estimación del consumo (F12) | Usa **solo** cifras de consumo publicadas y selladas, y vuelve a comprobar la divulgación vigente al leer: si una cifra usada se retiró, la estimación no se entrega. Directiva y Administrador ven SES, naive, cobertura y serie; **el Agricultor ve solo la estimación** (perfil `FARMER`, EST-D-05) | Contrato F12 §2, §4.3 y §8 |
| Proyección de la estimación al Agricultor | La estimación **puede coincidir con una cifra histórica publicada** (α = 1, criterio constante o serie constante). Entregarla al Agricultor proyecta información colectiva que hoy solo lee la Directiva. **Solo con datos sintéticos**; con datos reales exige que esta política lo contemple | Contrato F12 §2 y §11.3, punto 2 |
| Estimaciones sucesivas | El documento (3.12.6.3) señala que estimaciones sucesivas sobre series distintas pueden servir para inferir un aporte. La estimación solo usa filas publicadas, pero **no hay ningún control preventivo decidido** | Comentario de #107 del 2026-10-31 |
| Propuesta conjunta | La estimación aparece como **referencia separada**, que no se suma ni cambia las líneas, los totales ni la huella (F12-EST-08) | Contrato F12 §7.1 |
| Gates | GATE-F12 Passed **solo** para el alcance académico con datos sintéticos (2026-11-03). GATE-F07 (#29) sigue **Pending** por este issue | `F12_GATE_DECISION.md`; #29 |

### 7.2 Cinco niveles distintos

| Nivel | Estado | Qué lo acredita o lo falta |
|---|---|---|
| **1. Construcción y pruebas sintéticas** | **Hecho** | Las pruebas de §7.1, la CI de `main` y los recorridos Web con datos sintéticos. No sustituyen ninguna decisión |
| **2. Decisión del autor** | **Pendiente** | §5.1 en blanco. Las decisiones técnicas delegadas del 2026-10-16 y el sellado del 2026-10-23 cubren **solo el entorno sintético**. GATE-F12 Passed tampoco decide esta política |
| **3. Validación de la Directiva** | **Pendiente**; no consta ninguna | §5.2 en blanco |
| **4. Revisión del tutor** | **Pendiente** | §5.3 en blanco; GOV-01 (#105) |
| **5. Autorización efectiva de datos reales** | **No existe** | Exige 2 a 4, las decisiones de GOV-02 (#185) y un PR propio con un modo explícito para producción, su prueba y su vuelta atrás (paquete §5, fila 5). Hoy `NODE_ENV=production` equivale siempre a `POLICY_PENDING` |

### 7.3 Hoja breve: decisiones que faltan, opciones y consecuencias

Ninguna opción está elegida. Las consecuencias salen de los documentos citados; no se supone ningún número de agricultores vinculados.

**Del autor (§5.1; paquete §5, filas 1, 4 y 6):**

| # | Decisión | Opciones | Consecuencias |
|---|---|---|---|
| A1 | Texto de la política | Aprobar / pedir cambios / rechazar | Aprobar es requisito para cerrar #107, pero no basta: faltan la Directiva y el tutor. Pedir cambios obliga a repetir la revisión sobre el texto nuevo (§6) |
| A2 | k para datos reales | 3 / 5 / otro, **con el número real de agricultores vinculados**, que hoy no consta | k = 3 publica más y deja más riesgo residual (k − 1 aportantes pueden deducir el resto). k = 5 suprimió todas las celdas en los conjuntos sintéticos pequeños (comparación §3). Sin el número real, ninguna opción está fundada |
| A3 | Memoria de divulgación con datos reales: finalidad, minimización, duración y salida | Conservarla con plazo / con plazo y salida definida / no admitir datos reales hasta definirlo | Sin la memoria, la regla de combinaciones no puede funcionar. Conservarla mantiene datos vinculables a cada agricultor |
| A4 | Historial sellado con datos reales: finalidad, lectores, duración, y quién sella y cuándo | Conservar como registro histórico con plazo / solo durante el período académico / no sellar con datos reales | Sellar fija cifras visibles mientras la política lo permita; el historial es vinculable a través de la memoria |
| A5 | Proyección de la estimación al Agricultor (EST-D-05) | Incluirla en la política / limitarla al perfil institucional / no ofrecer la estimación al Agricultor con datos reales | Incluirla proyecta a los agricultores información colectiva que hoy solo lee la Directiva, porque la estimación puede igualar una cifra publicada. Limitarla exige un cambio de configuración, con su prueba, antes de usar datos reales |
| A6 | Control de estimaciones sucesivas (3.12.6.3) | Aceptar el riesgo residual declarado / limitar quién y con qué frecuencia genera estimaciones / no habilitar la estimación con datos reales | Aceptarlo es declararlo como límite. Limitarlo es trabajo técnico nuevo, con su prueba, fuera del alcance académico cerrado |
| A7 | Responsable y fecha de la próxima revisión | Nombrar a una persona y fijar una fecha | Sin esto no se cumple el criterio de #107 sobre «responsable y fecha de revisión» de la decisión |

**De la Directiva (§5.2; paquete §5, fila 2):** las preguntas 2(a) a 2(f) del §4 siguen vigentes. Se añaden:
- **2(g)**, si se conserva el historial sellado y quién lo consulta (ya en §5.2);
- **2(h)**, si se acepta que los agricultores vean la estimación del consumo (A5) y cómo se les informa.

**Consecuencia común:** mientras falte una respuesta, la Web no muestra cifras reales.

**Del tutor (§5.3; paquete §5, fila 3):** su revisión del entregable, en sus propios términos. No equivale a una aprobación.

**Para la autorización efectiva (nivel 5):** solo después de A1–A7, la Directiva y el tutor:
1. un PR con un modo explícito para producción, su prueba y su vuelta atrás;
2. las decisiones de GOV-02 (#185) sobre retención y admisión de datos reales;
3. para habilitar `COLLECTIVE_SEALING`, la comprobación en DEVICE de que la APK en uso trata `CAMPAIGN_SEALED` como fallo terminal (manual técnico §4.1).

### 7.4 Qué cerraría #107

Sus criterios técnicos están cubiertos por la política y su registro: umbral con justificación, supresión, supresión complementaria, filtros, casos resueltos, presentación y campos derivados.

Falta el criterio de la decisión: **«Verificado por Roderich Rendón (autor) el <fecha real>»** (`F07_POL_01.md`, pendiente). Y, por el paquete §5 y el §6 de esta hoja, las filas 2 y 3: la Directiva y el tutor.

**Mientras falten, #107 sigue abierto y GATE-F07 (#29) sigue Pending.** Si el autor decidiera separar la aceptación académica de la admisión institucional, sería una decisión explícita sobre #29 y #107, no un efecto de esta hoja (`F07_CIERRE_MATRIZ.md` §7).
