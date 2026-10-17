# F07-POL-01 (#107) — Material para la validación institucional

Preparado por la sesión B el 2026-10-17 (UTC), sobre `main` `e4b9c29`, para una **revisión real** con la Directiva del Sindicato 19 de Agosto y con el tutor.

**Qué no es este documento:**
- No contiene ninguna respuesta, firma, fecha de reunión ni decisión.
- El registro de la §6 está **en blanco**. Sólo lo completa quien participe en la revisión, con la fecha real en que ocurra.

**Estado al prepararlo:**
- Construido y probado con datos sintéticos.
- **Sin validación institucional.**
- Producción **no muestra cifras** (`POLICY_PENDING`).
- GATE-F07 (#29) sigue Pending.

**Documentos de detalle:**
- política: [`F07_AGGREGATE_DISCLOSURE_POLICY.md`](../architecture/F07_AGGREGATE_DISCLOSURE_POLICY.md);
- paquete técnico: [`F07_POL_01_PAQUETE_DECISION.md`](F07_POL_01_PAQUETE_DECISION.md);
- aceptación: [`F07_CIERRE_MATRIZ.md`](F07_CIERRE_MATRIZ.md).

## 1. Qué se pide decidir, en una frase

Si la Directiva del sindicato puede ver en la Web **totales por campaña y producto** de lo que los agricultores declaran necesitar y de lo que consumieron, con las reglas de privacidad de abajo. Y, si se acepta, con qué número mínimo de agricultores por cifra.

## 2. Qué vería la Directiva (y qué no)

**Vería:**
- por cada campaña, producto y unidad, el **total** declarado como necesidad y, por separado, el total consumido;
- cuántos agricultores forman ese total;
- la fecha de los datos;
- cuántos agricultores vinculados tienen cifras publicadas («3 de 12»);
- con eso, un **borrador de propuesta de compra conjunta**, que no compra nada ni crea deudas.

**No vería nunca:**
- cuánto declaró o consumió un agricultor concreto;
- quién aportó;
- notas, parcelas, fotos, proveedores, precios ni deudas;
- sumas entre productos ni entre unidades.

**Quién puede verlo:** sólo la Directiva y el Administrador del propio sindicato. Un agricultor o personas de otro sindicato no.

## 3. Las reglas, en lenguaje llano

1. **Mínimo de agricultores.** Una cifra sólo se muestra si la forman al menos **k agricultores distintos**. La propuesta es k = 3. Si son menos, se muestra «sin cifra» con el motivo, nunca un cero.
2. **Ausencia no es cero.** Si un agricultor no declaró nada, no se cuenta como cero: sólo se nota en la cobertura («3 de 12»). Un cero declarado sí cuenta.
3. **Comparar cifras no revela a nadie.** Si alguien guardara las cifras de distintos días o productos y las restara, no podría deducir la cantidad de menos de k agricultores. Cuando una cifra nueva lo permitiría, se sigue mostrando la anterior marcada «con cambios pendientes», o no se muestra ninguna.
4. **Bajas.** Si un agricultor cancela, se disputa un dato o deja el sindicato, la cifra se retira hasta que vuelva a ser segura.
5. **Lo mismo en todas partes.** La pantalla, el CSV y la propuesta siguen las mismas reglas.

**Límites que hay que conocer antes de decidir:**
- **Colusión.** Si dos de tres agricultores juntan lo que saben, pueden deducir al tercero. Ningún umbral de 3 lo evita.
- **Conocimiento externo.** No protege frente a quien ya conoce por otra vía lo que declaró alguien.
- **Sindicato pequeño.** Con pocos agricultores, muchas cifras quedarán sin mostrar.
- **No es anonimato.** Es una reducción del riesgo de deducir aportes individuales.

## 4. Ejemplos con datos sintéticos (no reales)

Del conjunto de prueba D4, con 3 agricultores sintéticos y 12 vinculados (`F06_RECONCILIATION.md`, regresión del 2026-10-17):

| Campaña | Producto | Concepto | Qué se muestra |
|---|---|---|---|
| Verano 2026 | Urea | Necesidad declarada | 25 KG, 3 agricultores |
| Verano 2026 | Glifosato | Consumo | 8,25 L, 3 agricultores |
| Verano 2026 | Belator (antes de unificar con «Bellator») | Necesidad | Sin cifra: menos de 3 agricultores |
| Verano 2026 | Belator (tras unificar «Bellator») | Necesidad | 11 L, 3 agricultores |
| Invierno 2026 | Mancozeb | Necesidad | 11,5 KG, 3 agricultores |
| Ambas | Cobertura | — | «3 de 12 agricultores vinculados con cifras publicadas», con aviso de que hay celdas sin cifra |

**Capturas sintéticas** para mostrar en la reunión:
- `docs/evidence/f10_compat/20261017T0102Z/B1-chrome-1366x768/W2-resumen.png`;
- `docs/evidence/f10_compat/20261017T0102Z/B1-chrome-1366x768/W3-propuesta.png`;
- `docs/evidence/f07_web_01/20261017T1456Z/02-directiva-resumen.png`.

## 5. Preguntas que deben responder

**A la Directiva del sindicato** (validación institucional):

1. ¿Es una **finalidad** legítima del sindicato ver estos totales para planificar compras conjuntas?
2. ¿Quiénes pueden verlos: sólo la Directiva y el Administrador (presidente), como está construido?
3. ¿Se **informará a los agricultores**, antes de activarlo, de que sus declaraciones se suman de esta forma? ¿Cómo y cuándo?
4. ¿Se acepta **k = 3**, u otro valor, conociendo los límites de la §3?
5. ¿Quién **revisa** esta decisión y cada cuánto, por ejemplo al inicio de cada campaña o si cambia el número de agricultores?
6. ¿Qué pasa si un agricultor **pide que no se cuenten** sus datos?

**Al tutor** (revisión del entregable, GOV-01/#105): ¿la política, sus límites y las pruebas son suficientes para el alcance académico? Su revisión se registra aparte y no equivale a la aprobación de la Directiva.

**Al autor** (Roderich Rendón):
- aprobar el texto de la política para datos reales;
- fijar k, la persona responsable y la fecha de revisión;
- registrar «Verificado por Roderich Rendón (autor) el <fecha real>» en `F07_POL_01.md`.

## 6. Registro de la revisión (EN BLANCO: completar sólo cuando ocurra)

> No completar por adelantado. Una fila vacía significa que la revisión **no ha ocurrido**.

| Campo | Directiva del sindicato | Tutor | Autor |
|---|---|---|---|
| Fecha real de la revisión | | | |
| Participantes (cargo) | | | |
| Respuesta a las preguntas 1–6 / revisión del entregable | | | |
| Decisión (acepta / acepta con condiciones / rechaza / pospone) | | | |
| Valor de k aprobado | | — | |
| Condiciones (información a los agricultores, revisión, exclusiones) | | | |
| Constancia (acta, correo o documento, y dónde se guarda) | | | |

## 7. Lo que ocurre después, y no antes

- **Si no se valida, o se pospone:** #107 sigue abierto, producción sigue sin cifras y GATE-F07 sigue Pending.
- **Si se valida:**
  1. el autor completa `F07_POL_01.md` con la fecha real;
  2. un PR propio, con revisión y pruebas, añade un modo explícito para producción, que **hoy no existe**: con `NODE_ENV=production` el sistema siempre responde `POLICY_PENDING`;
  3. ese PR debe aplicar las condiciones que se acuerden, por ejemplo informar a los agricultores o excluir a quien lo pida.
- **Nada de esto se activa por haber preparado este material.**
