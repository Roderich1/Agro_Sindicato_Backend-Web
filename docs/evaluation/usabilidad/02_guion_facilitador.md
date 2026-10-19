# Guion del facilitador — usabilidad Móvil (T1–T6) y Web (W1–W5)

**Quién lo usa:** Roderich, que facilita las sesiones (decisiones de cierre del 2026-10-16, §2). Lo ideal es contar con un observador sin rol de desarrollo. Si no se consigue, no se inventa: se declara en la evidencia que la recogida la hizo el desarrollador y el sesgo que eso implica.

**Claude Code no facilita ni observa sesiones** ni produce observaciones humanas.

**Protocolo:** `docs/evaluation/F10_PROTOCOLOS_EVALUACION.md` **v1.4** (precisión del dataset DS-UX en §3.3.1, 2026-10-18; tareas, umbrales, ayudas y SUS iguales a la v1.3 `9bfcad2` y a la v1.2 `9292425` que citaba este guion). El estado inicial de cada sesión es el de DS-UX (`09_fixture_y_valores_esperados.md`). En cada sesión se anota el SHA de `main` vigente. Las reglas que este guion añade al protocolo (salvo P-5, ya incorporada en v1.2 §3.6) (ayuda a los 60 s, `INCORRECTA` = fallo, doble marca en el SUS = vacía, pregunta «¿Dejó alguna sin marcar a propósito?») son **precisiones propuestas**: se confirman en el piloto y se registran en el protocolo (`README.md`, «Precisiones»). Este guion sigue las decisiones de cierre del 2026-10-16 cuando difieren del borrador: no se pide marcar 3 en el SUS, se informan los niveles de ayuda por separado y la muestra es 5 + 2 más un piloto excluido.

Lo que va **entre comillas angulares (« »)** se lee **tal cual**, con el mismo tono para todas las personas.

---

## 1. Antes de la sesión (sin la persona presente)

1. **Versión.** Anotar en la hoja de registro (`07_hoja_registro_sesion.md`):
   - el SHA del protocolo aprobado;
   - la versión de los instrumentos (tarjetas, SUS y SEQ, ver `README.md`);
   - los SHA de Backend, Web y Mobile;
   - el SHA-256 de la APK, el modelo del teléfono y el navegador con su versión.
2. **Móvil.**
   - Copia aislada `.f10ux`, reinstalada y sembrada con el dataset del protocolo.
   - Activada por el facilitador con una cuenta sintética nueva. El participante no teclea contraseñas.
   - Pantalla en **Inicio**, con red **encendida**.
   - Cronómetro a cero.
3. **Web.**
   - Navegador del protocolo con una sesión sintética de Directiva/Administrador ya iniciada.
   - Pantalla en **Resumen colectivo**.
4. **Material impreso:**
   - dos copias del consentimiento;
   - las tarjetas de la interfaz, en orden y boca abajo;
   - la hoja de registro con el código del participante;
   - una hoja de SEQ;
   - una hoja de SUS.
5. **Lugar:** sin otras personas mirando la pantalla.
6. **Código:**
   - P01–P05 para agricultores en Móvil;
   - D01–D02 para Directiva en Web;
   - X01 para el piloto, que se **excluye** de los resultados.

   Los códigos se asignan por orden de sesión, no por resultados.

## 2. Bienvenida y consentimiento (≈ 5 min)

> «Gracias por venir. Estoy probando una aplicación de mi proyecto de grado. Hoy no le evaluamos a usted: evaluamos la aplicación. Si algo le resulta difícil, es un problema de la aplicación y eso es justo lo que necesito saber.»

1. Leer la hoja de información (`01_hoja_informacion_y_consentimiento.md`) y responder las dudas.
2. Firmar o anotar el consentimiento. Si no acepta, la sesión no se hace y no se registra nada más.
3. Preguntar el perfil y anotarlo con el código:
   > «En una escala del 1 al 5, donde 1 es "muy poca" y 5 es "mucha", ¿cuánta comodidad siente usando aplicaciones en el celular?»

   Sólo para agricultores:
   > «¿Usted lleva el inventario de agroquímicos solo, o lo comparte con su familia?»

   No se cruza con el cuestionario de diagnóstico.

## 3. Instrucciones generales (se leen una vez)

> «Le voy a dar unas tarjetas con tareas. Lea la tarjeta, o se la leo yo si prefiere. Cuando termine de leer le diré "puede comenzar". Haga la tarea como lo haría solo en su casa. Cuando crea que terminó, dígame "terminé". Si en algún momento quiere dejar una tarea, dígame "paso" y seguimos con la siguiente; no pasa nada. Puede comentar en voz alta lo que piensa, si quiere, pero no es obligatorio. Yo no le voy a ayudar al principio, porque quiero ver si la aplicación se entiende sola.»

## 4. Cada tarea

1. Preparar las condiciones de la tarea (§6), sin comentarlas más allá de lo que dice la tarjeta.
2. Entregar o leer la tarjeta y decir: «Puede comenzar». **Ahí arranca el cronómetro.**
3. **El cronómetro se detiene** cuando:
   - se alcanza el estado de fin observable de §6;
   - el participante dice «terminé»;
   - el participante dice «paso»;
   - se agota el tiempo máximo: **5 min (300 s) en Móvil y 4 min (240 s) en Web**.

   Al agotarse el tiempo se dice: «Gracias, pasemos a la siguiente».
4. **Ayudas.** Sólo si la persona la pide o lleva **60 s** sin avanzar. Siempre en este orden, y anotando la ayuda **más alta** usada:
   - **Nivel 1 — pista general:** «¿Dónde cree que podría estar?»
   - **Nivel 2 — pista específica:** la frase predefinida de la tarea (§6), sin cambiarla.
   - **Nivel 3 — el facilitador hace el paso.** Se registra como **intervención del facilitador**: no es éxito y se informa aparte de los fallos (protocolo v1.2 §3.5). **Prevalece** sobre el resultado: aunque después se termine o se abandone, cuenta como intervención.
5. Si la persona dice «terminé», no se le confirma si está bien ni mal. El resultado se anota en la hoja.
6. Inmediatamente, la pregunta SEQ (`05_cuestionario_SEQ.md`). Si no quiere responder, se deja en blanco.
7. Anotar los **errores**:
   - una acción que se aparta del camino y se corrige;
   - un **error crítico**: un dato guardado incorrecto **sin que la persona lo note**. Por ejemplo, la cantidad o la unidad equivocadas en una compra guardada.

   Los errores críticos se comprueban en la aplicación **después** de la tarea, sin comentarlo.

### Frases neutrales permitidas

- «Haga lo que haría si estuviera solo.»
- «¿Qué está buscando?», sólo para entender, no para guiar.
- «Siga, por favor.»
- «Gracias.»

### Lo que no se dice

- «¡Muy bien!», «casi», «no, ahí no», «fácil, ¿no?».
- Ninguna explicación de la aplicación que no sea la pista predefinida.
- No se señala la pantalla ni se toca el teléfono, salvo en el nivel 3.

## 5. Final (≈ 10 min)

1. SUS (`06_cuestionario_SUS_es.md`) sobre la interfaz usada, aplicado como indica su §4. **No se pide marcar 3.**
2. Preguntas abiertas, anotando las respuestas sin nombres:
   > «¿Qué fue lo más difícil?»
   > «¿Qué cambiaría?»
3. Cierre:
   > «Muchas gracias. Si quiere retirar sus datos, avíseme con el código de su hoja.»
4. Restaurar la aplicación para la persona siguiente, según el protocolo.

## 6. Tareas: condiciones, fin observable y pista específica predefinida

Los enunciados están en las tarjetas (`03_…` y `04_…`). Las pistas de nivel 2 nombran las etiquetas reales de la interfaz en Mobile `dff6802` y Web de `ed069a6`. Si la versión fijada para evaluar cambia esas etiquetas, se actualizan **antes** del piloto.

### Móvil

| Tarea | Condición previa (facilitador) | Fin observable / éxito | Pista de nivel 2 |
|---|---|---|---|
| T1 | Activar el **modo avión** antes de entregar la tarjeta | La compra aparece con las 2 líneas y las cantidades y unidades correctas (2 L y 500 mL) | «Las compras se registran en Operaciones, en Compras.» |
| T2 | Modo avión sigue activo | Aplicación con las 2 líneas (1 L y 200 mL) en la parcela Norte | «Las aplicaciones se registran en Operaciones, en Aplicaciones.» |
| T3 | Antes de la tarjeta, consultar en silencio el saldo de Bellator y anotarlo (`09_…` §2) | Dice ese saldo y señala los movimientos guardados (`09_…` §2) | «El saldo está en Inventario; al tocar el producto se ven sus movimientos.» |
| T4 | Modo avión sigue activo | Necesidad vigente de 20 L de Glifosato Demo | «Las necesidades se declaran en Operaciones, Planificación, "Necesidad declarada al sindicato".» |
| T5 | **Desactivar el modo avión** antes de leer la tarjeta y decir sólo: «Ya hay Internet» | Encuentra Sincronización y responde según el estado real que muestra la aplicación. Se anota ese estado; la respuesta es correcta si coincide con él, sea el que sea | «Lo que se envía al sindicato está en Inicio, "Sincronización con el sindicato".» |
| T6 | — | Explica que no hay saldo suficiente y cómo continuar. Después se comprueba que **no** se guardó una aplicación de 5 L | «Lea el mensaje que muestra la aplicación al guardar.» |

### Web

| Tarea | Condición previa | Fin observable / éxito | Pista de nivel 2 |
|---|---|---|---|
| W1 | Sesión de Directiva en Resumen colectivo; entorno Web sembrado de nuevo (`09_…` §3) | Lee el valor registrado antes de la primera sesión (`09_…` §4) | «El resumen está en el menú, en "Resumen colectivo"; elija la campaña.» |
| W2 | Tras W1 | Identifica la cobertura «N de M» y que quien no declaró no cuenta como cero | «Mire la línea de Cobertura en el resumen.» |
| W3 | — | Asociación Belator = Bellator confirmada con motivo y visible en el historial | «Las equivalencias de productos están en "Reconciliación".» |
| W4 | — | Borrador en el historial y CSV descargado | «Las propuestas están en "Necesidades y propuesta".» |
| W5 | Tras W4 | Responde que no: es un borrador para decidir y no compra nada | «Lea el texto que acompaña al borrador.» |

## 7. Desviaciones

Todo lo que se aparte de este guion se anota en la hoja de registro, en «Desviaciones», y se informa en la evidencia. Por ejemplo:
- una ayuda fuera de orden;
- un corte de luz o de red no previsto;
- un error de la aplicación ajeno a la tarea;
- una tarea saltada.

**No se repite una tarea para mejorar un resultado.**

## 8. Piloto

La primera sesión, con una persona ajena al desarrollo (código X01), sigue este guion completo y además `08_piloto_comprension.md`. Sus datos se **excluyen**.

Si el piloto obliga a cambiar una tarjeta, una pista o un instrumento:
- se cambia;
- se sube la versión;
- se anota en `README.md` (registro de versiones) **antes** de la primera sesión de la muestra final.
