# F07-POL-01 (#107): comparación de k = 3 frente a k = 5 con datos sintéticos

**Qué es:** una comparación reproducible del umbral de divulgación con las **reglas vigentes completas**, ejecutada por la API real sobre bases nuevas de PostgreSQL.

**Qué no es:**
- **No es una decisión:** k = 3 sigue siendo **provisional**, k = 5 **no se adopta** y ningún k se presenta como garantía de anonimato.
- **No cambia** el sistema: `PROVISIONAL_THRESHOLD = 3` y el modo `PROVISIONAL_SYNTHETIC` quedan como estaban.
- No toca ni la hoja institucional, ni el Project, ni los gates.

**Ficha:**
- **Encargo:** de Roderich, el 2026-10-19 («F07 y F08: umbrales, retención y comprobaciones», §2), asignado por la sesión A a la sesión B.
- **Quién lo hizo:**
  - la **sesión B** dejó la herramienta en borrador, sin commitear, en `_wt/B-F07-UMBRALES`;
  - la **sesión C** la continuó el 2026-10-19 en America/La_Paz (2026-10-20 en UTC), a pedido de Roderich. Mantuvo la secuencia y los escenarios, y añadió `git` por ruta absoluta y, tras la revisión cruzada, el oráculo de las cifras pendientes (§1);
  - C la ejecutó y redactó esta evidencia.
- **Datos:** todos sintéticos.
- **Versión:** `98375dc849eb0bf567e5176a7ec6796ccf9db163` (rama `docs/f07-comparacion-k`, sobre `main` `769d441`), con el árbol limpio. La primera ejecución, sobre `6d679fd`, dio las mismas cifras con el oráculo anterior.
- **Fecha real:**
  - k = 3: 2026-10-20, de 01:32:46 a 01:33:29Z;
  - k = 5: de 01:33:33 a 01:34:14Z (2026-10-19 en America/La_Paz).

## 1. Procedimiento reproducible

```bash
cd Back
# PostgreSQL desechable: la suite crea y migra desde cero una base NUEVA por escenario y por k
export F07_K_COMPARE_PG_URL=<url-de-administración>
F07_K_COMPARE_K=3 F07_K_COMPARE_OUT=<dir> npx jest f07-pol-01-k-comparison --runInBand
F07_K_COMPARE_K=5 F07_K_COMPARE_OUT=<dir> npx jest f07-pol-01-k-comparison --runInBand
cd .. && node tool/f07_k_comparison/resumir.cjs <dir>
```

**Herramientas:**
- `Back/src/modules/collective/test-support/k-comparison/f07-pol-01-k-comparison.postgres.spec.ts`: la ejecución. Se salta sin `F07_K_COMPARE_PG_URL` y no está en el CI.
- `scenarios.ts`: los escenarios.
- `tool/f07_k_comparison/resumir.cjs`: genera la tabla.

**Entorno:** PostgreSQL 16 (`postgres:16-alpine`, local en 127.0.0.1:55443) y Node v25.9.0.

**Resultado:** 7/7 escenarios por k, con **0 inconsistencias**.

**Salidas completas:**
- [`f07_k_comparison/k3.json`](f07_k_comparison/k3.json);
- [`f07_k_comparison/k5.json`](f07_k_comparison/k5.json);
- [`f07_k_comparison/resumen.md`](f07_k_comparison/resumen.md).

**Inyección de k, sólo de prueba y declarada.** Un `jest.mock` de `domain/disclosure-policy`, limitado a ese archivo, hace que `decideCells` use `F07_K_COMPARE_K` y que el resumen informe ese umbral. No se cambia ningún valor por defecto, ni el modo provisional, ni se añade un modo de producción.

**La misma secuencia en cada escenario y k,** por la API real (Sync v1 push y los endpoints de Directiva y Administrador):

| Paso | Qué hace |
|---|---|
| **E1** | Publicar todos los aportes. D4 incluye una cancelación |
| **E2** | Un aportante sustituye su valor |
| **E3** | La Directiva asocia una denominación con su producto canónico (W3) |
| **E4** | El Administrador da de baja a un aportante |
| **E5** | Un aportante pasa a DIRECTIVA (M5, #157) |

**Después de cada paso,** por campaña, se leen:
- el resumen JSON, que es lo que lee el panel Web, y su CSV;
- después, una propuesta conjunta y su CSV.

Cada lectura comprueba:
- que los canales coinciden entre sí (JSON = CSV = propuesta);
- que las cifras coinciden con un **oráculo** calculado a partir de las operaciones enviadas, no del servidor:
  - una cifra nueva, sin cambios pendientes, es exactamente el total y el número de Members vigentes;
  - una cifra conservada (`pending_changes`) es exactamente la última que se publicó para esa celda sin pendientes. Las liberaciones sólo ocurren en estas lecturas, porque la propuesta no decide nada nuevo;
  - **mutación:** si se altera ese oráculo, la prueba falla;
- que ninguna cifra se publica con menos de k Members **vigentes**;
- que una celda sin aportes queda retirada;
- que la cobertura es correcta en **todas** las lecturas:
  - `linked_members`;
  - `members_with_contribution`: una cifra nueva cuenta a sus Members vigentes, y una conservada a los de su liberación (F10-SEC-02);
- que generar la propuesta no decide nada nuevo: ni liberaciones ni retiradas.

Las lecturas con alguna cifra conservada fueron 14 de 40 con k = 3 y 10 de 40 con k = 5.

**Lo que no se comprueba:** no hay un atacante que intente aislar a un grupo de menos de k por diferencias entre liberaciones. La regla de historial y de combinaciones entre claves (`SUPPRESSED_REVISION` y retiradas) **se observó actuando** tras E2–E5 con los dos k, pero esta comparación **no demuestra** que impida toda diferencia. Eso lo cubren, en su alcance, las pruebas propias de la regla.

## 2. Escenarios

| Id | Origen | Vinculados | Aportantes | Qué es |
|---|---|---|---|---|
| DSUX | Fixture | 6 | 4 | `tool/f10_eval_web/dsux/oraculo_web.json` (M1–M6, 4 de 6), protocolo v1.4 §3.3.1 |
| D4 | Fixture | 12 | 3 | `Back/src/modules/collective/test-support/d4/F06_EXPECTED_CONTRIBUTIONS.csv`, en 2 campañas |
| S06-ALTA | **Supuesto sintético** | 6 | 6 | Participación total en un grupo pequeño |
| S12-BAJA | **Supuesto sintético** | 12 | 5 | Participación baja |
| S12-ALTA | **Supuesto sintético** | 12 | 10 | Participación alta |
| S30-BAJA | **Supuesto sintético** | 30 | 9 | Participación baja |
| S30-ALTA | **Supuesto sintético** | 30 | 23 | Participación alta |

Los supuestos sintéticos **no describen al Sindicato ni al piloto**. La distribución de aportantes por celda de cada uno está en `scenarios.ts` y, por lectura, en `distribution` de los JSON.

## 3. Resultados observados

**Cómo leer la tabla:**
- **Columnas «Celdas»:** las celdas de todas las campañas del escenario.
- **Columnas «Propuesta»:** las líneas de necesidad declarada; los litros son los que la propuesta muestra con cifra, frente a los declarados.
- **«Publicadas con exactamente k»:** celdas en las que k − 1 aportantes, juntos, pueden deducir el valor del restante. Es riesgo residual, no un fallo.

| Escenario | k | E1: publicadas / bajo umbral | E1: propuesta | E5: publicadas / bajo umbral / en revisión · retiradas | E5: propuesta | Exactamente k (E1) |
|---|---|---|---|---|---|---|
| DSUX (6 → 4 vinculados; 4 aportan) | 3 | 3 / 0 de 3 | 3/3 líneas · 168 de 168 L | 0 / 2 / 1 de 3 · 3 | 0/3 · 0 de 68 L | 2 |
| | 5 | 0 / 3 de 3 | 0/3 · 0 de 168 L | 0 / 2 / 0 de 2 · 0 | 0/2 · 0 de 68 L | 0 |
| D4 (12 → 10; 3 aportan) | 3 | 4 / 9 de 13 | 2/5 · 0 de 12 L | 0 / 8 / 0 de 8 · 6 | 0/3 · 0 de 5,5 L | 4 |
| | 5 | 0 / 13 de 13 | 0/5 · 0 de 12 L | 0 / 8 / 0 de 8 · 0 | 0/3 · 0 de 5,5 L | 0 |
| S06-ALTA (6 → 4; 6) | 3 | 4 / 2 de 6 | 4/6 · 249 de 297 L | 1 / 1 / 3 de 5 · 4 | 1/5 · 63 de 203 L | 1 |
| | 5 | 2 / 4 de 6 | 2/6 · 159 de 297 L | 0 / 5 / 0 de 5 · 3 | 0/5 · 0 de 203 L | 1 |
| S12-BAJA (12 → 10; 5) | 3 | 3 / 3 de 6 | 3/6 · 165 de 242 L | 1 / 3 / 1 de 5 · 3 | 1/5 · 49 de 152 L | 1 |
| | 5 | 1 / 5 de 6 | 1/6 · 69 de 242 L | 0 / 5 / 0 de 5 · 2 | 0/5 · 0 de 152 L | 1 |
| S12-ALTA (12 → 10; 10) | 3 | 6 / 1 de 7 | 6/7 · 498 de 529 L | 3 / 0 / 3 de 6 · 4 | 3/6 · 244 de 443 L | 1 |
| | 5 | 4 / 3 de 7 | 4/7 · 401 de 529 L | 0 / 2 / 4 de 6 · 5 | 0/6 · 0 de 443 L | 1 |
| S30-BAJA (30 → 28; 9) | 3 | 4 / 4 de 8 | 4/8 · 320 de 389 L | 3 / 3 / 1 de 7 · 2 | 3/7 · 221 de 318 L | 1 |
| | 5 | 2 / 6 de 8 | 2/8 · 211 de 389 L | 0 / 5 / 2 de 7 · 3 | 0/7 · 0 de 318 L | 0 |
| S30-ALTA (30 → 28; 23) | 3 | 8 / 1 de 9 | 8/9 · 813 de 834 L | 5 / 1 / 3 de 9 · 4 | 5/9 · 518 de 788 L | 2 |
| | 5 | 5 / 4 de 9 | 5/9 · 673 de 834 L | 3 / 2 / 3 de 8 · 3 | 3/8 · 260 de 788 L | 1 |

En D4, las líneas con cifra de la propuesta en E1 (2/5) están en kg (G). Por eso los litros cubiertos son 0.

**Cobertura por paso.** La cobertura (`members_with_contribution` de `linked_members`), si hay celdas suprimidas, las cifras pendientes por paso y la distribución de aportantes por celda están en la segunda tabla de [`f07_k_comparison/resumen.md`](f07_k_comparison/resumen.md). Un ejemplo es S30-ALTA tras E5: 19 de 28 con cifra con k = 3, frente a 11 de 28 con k = 5.

**Lo que se observa:**
1. **Con 6 o menos aportantes por campaña**, k = 5 recorta mucho la propuesta:
   - DSUX y D4: 0 líneas con cifra;
   - S06-ALTA y S12-BAJA: 2 y 1 líneas con cifra en E1 (el 54 % y el 29 % de los litros) y ninguna en E5.
   - Con k = 3, en E1:
     - DSUX, S06-ALTA y S12-BAJA muestran entre el 68 % y el 100 % de los litros declarados;
     - D4 sólo muestra cifras en kg: 4 celdas y 2 líneas.
2. **La secuencia E2–E5** (sustitución, asociación, baja y cambio de rol) retira o deja en revisión celdas con cualquier k: se observa la regla de historial y combinaciones actuando, lo que no prueba que impida cualquier diferencia (§1). Con k = 5, tras E5 sólo S30-ALTA conserva cifras (3 de 8 líneas, 260 de 788 L). Con k = 3 conservan cifras S06-ALTA, S12-BAJA, S12-ALTA, S30-BAJA y S30-ALTA.
3. **El riesgo residual no desaparece con k = 5.** Siguen publicándose celdas con exactamente k aportantes en S06-ALTA, S12-BAJA, S12-ALTA y S30-ALTA, donde k − 1 aportantes coludidos deducen al restante. Tampoco desaparecen la dominancia (un aportante con la mayor parte del total) ni el conocimiento externo.
4. **La coherencia entre canales y con el oráculo** fue total con los dos k (0 inconsistencias en 2 × 7 ejecuciones). La diferencia entre k es de utilidad y de riesgo, no de corrección.

## 4. Tres números distintos que no se igualan

| Número | Valor | Fuente |
|---|---|---|
| **Personas del piloto** | **Ninguna confirmada** | Registro de coordinación del 2026-10-19 (fuera del repositorio): «Bloqueo humano: no hay una persona piloto con consentimiento» |
| **Población declarada en la tesis** | **74 miembros** de la nómina institucional del Sindicato 19 de Agosto | `Proyecto_Grado_Rodrigo_Univalle_v1.5.docx`, §1.8.1 «Población», dentro del §1.8 (pág. 13 según el índice), párrafo 586 de `word/document.xml`, con los párrafos numerados desde 1 en el orden del documento: «La población de estudio estará conformada por los 74 miembros…». En §3.3.1 (párrafo 1096): 38 respuestas efectivas al cuestionario censal, 31 de agricultores sin cargo y 7 de la directiva. En §3.3.4 «Evidencia documental» (párrafo 1289): «La nómina contiene 74 posiciones y posibles nombres repetidos… la vigencia y unicidad de los registros quedan pendientes de confirmación» |
| **Agricultores realmente vinculados en el sistema** | **PENDIENTE, sin confirmar** | No hay despliegue ni datos reales |

**El documento de la tesis se leyó sin modificarlo.** Su SHA-256, `72C61FC2…2EAF2CC`, fue el mismo antes y después de la extracción.

Los 74 son miembros, no aportantes de una campaña ni de un producto. Los 38 son respuestas a un cuestionario, no participación en el sistema.

## 5. Recomendación y sus límites

**Recomendación: mantener k = 3 como valor provisional** para la entrega académica y el piloto con datos sintéticos, sin adoptar k = 5 ahora. Los motivos:
- **Utilidad:** con grupos de 3 a 6 aportantes, que es el orden de DS-UX, D4 y los supuestos bajos, k = 5 recorta mucho la propuesta conjunta:
  - DS-UX y D4 quedan sin ninguna cifra;
  - S06-ALTA y S12-BAJA conservan en E1 2 y 1 líneas (el 54 % y el 29 % de los litros), y ninguna tras E5.
  - Eso reduce mucho la utilidad de CU-12 (preparar una compra conjunta) sin que el riesgo residual desaparezca.
- **Protección:** con k = 3 la protección no descansa sólo en el umbral. También actúan:
  - la exclusión de los Members dados de baja o con otro rol (M5), comprobada aquí en la cobertura y en el oráculo;
  - la regla de historial y combinaciones, que aquí **se observó** retirando o dejando en revisión celdas, aunque esta comparación no la prueba contra un atacante (§1).

**Antes de fijar k para datos reales,** hace falta, como mínimo:
1. el **número real de agricultores vinculados** y su **participación por producto y campaña**: los aportantes por celda, no los miembros;
2. la decisión del autor, la Directiva y el tutor (#107);
3. volver a ejecutar esta comparación con una distribución sintética que imite la real.

Como orientación que debe confirmarse con esos datos: **un k mayor sólo tiene sentido si las celdas tienen de forma habitual bastantes más aportantes que k**. En estos escenarios:
- en E1, k = 5 conserva:
  - el 76 %, el 54 % y el 81 % de los litros declarados en S12-ALTA, S30-BAJA y S30-ALTA;
  - el 54 % (159 de 297 L) en S06-ALTA y el 29 % (69 de 242 L) en S12-BAJA;
  - nada en DS-UX y D4;
- tras la secuencia E2–E5, sólo S30-ALTA (23 aportantes) conserva alguna cifra.

**Límites:**
- Todos los escenarios son sintéticos. Los supuestos S* no describen al Sindicato.
- La secuencia E2–E5 es una sola y fija; otras secuencias pueden dar otras proporciones.
- No se midieron ataques de dominancia ni de conocimiento externo.
- La inyección de k es sólo de prueba.
- **Ningún k garantiza el anonimato.**
