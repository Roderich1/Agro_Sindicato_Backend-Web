# Paquete de usabilidad F10 — Móvil (UX-01, MOB #37) y Web (UX-02, BE #47)

- **Preparado el:** 2026-10-16 (America/La_Paz), por la sesión C de Claude Code, como material para que **Roderich** ejecute la evaluación con personas reales.
- **Estado: no se ha ejecutado ninguna sesión.**
  - No hay participantes reclutados ni fechas fijadas.
  - Nadie fue contactado en nombre de Roderich.
  - No hay ningún resultado.

**Trazabilidad:**
- RNF-07 (RU-13);
- interfaces INT-01, INT-02 e INT-08;
- tareas CU-06, CU-07, CU-09, CU-10, CU-11 (RF-18), CU-12 (RF-23), CU-13 (RF-24) y CU-18 (RF-33);
- reglas RN-03 y RN-18.

Gate relacionado: GATE-F10 (#49), **Pending**.

**Fuentes que manda seguir:**
- `docs/evaluation/F10_PROTOCOLOS_EVALUACION.md` **v1.3** (`9bfcad2`, integrado en `main`; la v1.2 `9292425` que citaba este paquete tiene el **§3 idéntico**, comprobado con `diff` el 2026-10-18, así que las citas «v1.2 §3.x» de estos archivos equivalen a «v1.3 §3.x» sin cambio de texto): diseño y consentimiento en §3.3, tareas en §3.4, mediciones (SEQ y SUS) en §3.5, criterios en §3.6 y evidencia en §3.7. En cada sesión se anota el SHA de `main` vigente;
- las decisiones de cierre del 2026-10-16 (`_briefs/CIERRE_TECNICO_Y_EVALUACION_AGROCUENTAS_2026-10-16.md` §2, «Usabilidad: diseño aceptado»). Donde difieren del borrador del protocolo, **mandan las decisiones**.

## Estado de la preparación (revisión del 2026-10-18)

Revisión de la sesión C de Claude Code del 2026-10-18 por el encargo de Roderich Rendón (sección C, «Preparación de la evaluación humana»). **Sigue sin ejecutarse ninguna sesión.** Esta sección sólo registra lo que ya existe, lo que falta y quién puede hacerlo; no añade un segundo paquete.

- **Protocolo:** v1.3 `9bfcad2`, integrado. Su §3 es idéntico al de la v1.2 `9292425` que citan estos archivos (ver «Fuentes»).
- **Base candidata para las sesiones:** Mobile `main` `fd8dc7d` al 2026-10-18, o cualquier `main` posterior con el mismo `lib/` (código `lib/` = `27c4654`, con la corrección de legibilidad con fuente grande de MOB #129, PR #131, integrado en `196372a`; los merges posteriores #128, #130 y #132 sólo tocan `tool/` y `docs/`: `git diff --stat 27c4654 fd8dc7d -- lib android pubspec.yaml` vacío); Backend/Web `main` `fd6e957` (código = `cab433d`, sin cambios en `Back/src`, `Back/prisma` ni `Web/src` desde entonces). **La copia `.f10ux` del protocolo (§0.5 y §3.3) no se ha compilado**; se compila desde esa base con `tool/f10_eval/build_profile_apk.sh` y su SHA-256 se anota en cada sesión (guion §1).
- **Equipo disponible:** POCO X5 Pro 5G, el **A1** del protocolo §2.3 (Android 12 / API 31, MIUI V14, 1080×2400, 440 dpi). Es el equipo que §3.3 prevé para Móvil («A1 con `.f10ux`»): **no hay cambio de protocolo.** El HONOR JDY-LX3P (A4/A4-F de la serie 2 de compatibilidad) no está conectado y §3.3 no lo prevé para usabilidad; si se decidiera usarlo, sería un cambio de protocolo que debe registrarse y revisarse **antes del piloto y de la muestra**, y lo decide Roderich, no este paquete. Web: B1 o B2 (Chrome o Edge en Windows 11, versión exacta registrada), según §3.3.
- **Datos:** §3.3 dice «sembrado con el dataset sintético D4», pero las tarjetas de §3.4 usan nombres que D4 no tiene («Glifosato Demo», «Verano Demo», parcela «Norte»; `09_fixture_y_valores_esperados.md`). La fixture DS-UX de `09_…` **sigue siendo una propuesta sin construir**; no existe ningún generador ni ningún entorno sembrado con esos nombres (comprobado el 2026-10-18 en `lib/`, `tool/` y `Back/scripts/` de ambos repositorios). Resolverlo requiere una precisión del protocolo (dataset de usabilidad DS-UX en §3.3, sin tocar tareas, umbrales ni criterios) **antes del piloto**, y después construir y sembrar la fixture.
- **Cálculo:** `calculo/test_calcular_usabilidad.py` ejecutado el 2026-10-18 sobre `fd6e957`: 25 pruebas, OK.

### Lo que falta y quién puede hacerlo (equipo técnico)

| Qué | Quién | Estado al 2026-10-18 |
|---|---|---|
| Precisión del protocolo: dataset de usabilidad (DS-UX de `09_…`) en §3.3, versionada antes del piloto | Decide Roderich; redacta A (como las precisiones v1.1–v1.3) | Pendiente |
| Generador DS-UX reproducible con semilla: Móvil (patrón `tool/f10_eval/seed_dsv_mobile.dart`, por `AgroRepository`) y Central (patrón `Back/scripts/f07-synthetic-seed.cjs`, por la API real) con los valores de `09_…` §1 y §3 | A (Móvil); A o B (Central), según `09_…` | Sin construir |
| Copia `.f10ux` en modo profile desde `main` con `lib/` = `27c4654` (`fd8dc7d` al escribir esto), SHA-256 y `aapt2` registrados; reinstalación por participante | A | Pendiente |
| Entorno Central propio para la Web (contenedor, volumen y puertos nuevos, §0.4), `provisional-synthetic` con `NODE_ENV=development` declarado como desviación; se vuelve a sembrar antes de cada participante Web | A o B | Pendiente |
| Comprobar en la interfaz que los nombres de `09_…` aparecen tal cual; registrar los valores esperados reales de T3 y W1/W2 | Facilitador, antes de la primera sesión | Pendiente |
| Plantilla de la evidencia final (§3.7) | C | **Añadida** (`plantillas/F10_USABILIDAD_plantilla.md`) |

### Lo que sólo pueden hacer personas reales

- Confirmar con el tutor si Univalle exige algún trámite (§3.3).
- Invitar personalmente a 5 agricultores, 2 miembros de la Directiva y 1 persona ajena para el piloto (X01). Nadie envía mensajes ni fija fechas en nombre de Roderich.
- Recoger los consentimientos (escritos, o verbales y anotados) y guardarlos fuera de los repositorios.
- Hacer el piloto, decidir las versiones TAR/SEQ/SUS y anotarlas en la tabla de versiones de este README antes de la primera sesión de la muestra.
- Facilitar las 7 sesiones con el guion fijo; conseguir un observador independiente o declarar que no lo hubo.
- Transcribir los CSV el mismo día, ejecutar el cálculo y redactar `docs/evidence/F10_USABILIDAD.md` con la plantilla.
- **Nada de esto se simula.** Ninguna operación de Claude Code, prueba de widgets ni recorrido automatizado cuenta como participante ni como sesión (protocolo §3.2).

## Contenido

| Archivo | Para qué |
|---|---|
| `01_hoja_informacion_y_consentimiento.md` | Información y consentimiento. **Única hoja con nombre**: se guarda aparte, nunca en un repositorio |
| `02_guion_facilitador.md` | Guion neutral: frases fijas, niveles de ayuda, pistas predefinidas, tiempos y fin observable de cada tarea |
| `03_tarjetas_movil_T1-T6.md` y `04_tarjetas_web_W1-W5.md` | Tarjetas para imprimir |
| `05_cuestionario_SEQ.md` | Pregunta única tras cada tarea (traducción de trabajo, se comprueba en el piloto) |
| `06_cuestionario_SUS_es.md` | SUS en español, **literal** de Sevilla-Gonzalez et al. (2020), doi:10.2196/21161, con su fuente, licencia, reglas de aplicación y registro de adaptaciones |
| `07_hoja_registro_sesion.md` | Registro en papel por participante y tarea |
| `08_piloto_comprension.md` | Comprobación de comprensión en el piloto, y cómo se versionan los cambios |
| `plantillas/*.csv` | Cabeceras para transcribir: `participantes`, `tareas`, `sus` y `hallazgos` |
| `calculo/calcular_usabilidad.py` | Cálculo verificable: tasas por tarea con denominadores, tiempos y SEQ descriptivos, SUS por participante con los incompletos aparte |
| `09_fixture_y_valores_esperados.md` | **Propuesta** de fixture DS-UX para las tareas (no ejecutada) y hoja de valores esperados de T3 y W1 |
| `calculo/test_calcular_usabilidad.py` y `calculo/ejemplo_ficticio/` | Prueba de la aritmética con datos **ficticios** marcados como ejemplo, fuera de `resultados/` |
| `resultados/` | Vacía. Sólo para datos reales anonimizados de la muestra final |
| `plantillas/F10_USABILIDAD_plantilla.md` | Plantilla **vacía** de la evidencia final (§3.7), con los denominadores y las reglas de resultado ya escritos; se copia a `docs/evidence/F10_USABILIDAD.md` sólo con datos reales |

## Diseño (decisiones de cierre)

- **Muestra:**
  - **5 agricultores** en Móvil (P01–P05);
  - **2 miembros de Directiva** en Web (D01–D02), incluido el presidente con la cuenta ADMINISTRADOR si participa (ADR-003);
  - **1 piloto excluido** (X01), una persona ajena al desarrollo.

  No se eligen ni se descartan participantes según sus resultados.
- **Móvil y Web se analizan por separado.**
- **Éxito por tarea:**
  - criterio: éxito con ayuda de nivel 0–1 ≥ 80 % de los intentos y **cero errores críticos**;
  - se informan por separado: sin ayuda (0), pista general (1), ayuda específica (2, no cuenta como éxito para el criterio), intervención del facilitador (3, aparte: ni éxito ni fallo; **prevalece** sobre el resultado) y fallo (abandono, tiempo agotado o `INCORRECTA`);
  - **el criterio sólo se evalúa si intentó la tarea toda la muestra planificada** (5 en Móvil, 2 en Web). Con menos, el resultado es «NO EJECUTADA (muestra incompleta: k de N)», con los conteos visibles; **nunca CUMPLE con menos** (protocolo v1.2 §3.6, precisión incorporada antes de cualquier sesión sin tocar umbrales);
  - «0–1» **no** es «sin ayuda»;
  - **en Web, con 2 participantes, el 80 % exige 2/2.**
- **Tiempo máximo:** 5 min por tarea en Móvil y 4 min en Web. El tiempo y el SEQ son descriptivos.
- **SUS:**
  - criterio operativo del estudio: media ≥ 68, por interfaz;
  - se publican los puntajes individuales anonimizados, el n válido, la media, la mediana y el rango;
  - **no es un porcentaje**;
  - no se pide marcar 3 ni se imputan ítems vacíos;
  - un cuestionario incompleto se informa aparte.
- **Muestra exploratoria:** no hay inferencia poblacional.

## Precisiones propuestas (se confirman en el piloto y se registran en el protocolo)

Este paquete añade reglas operativas que el protocolo no fija. **No cambian ningún umbral.** Se confirman o ajustan en el piloto y se registran antes de la muestra final:

| ID | Precisión | Dónde |
|---|---|---|
| P-1 | La ayuda de nivel 1 se ofrece si la persona la pide o tras **60 s** sin avanzar | Guion §4 |
| P-2 | Un resultado `INCORRECTA` (dijo «terminé» sin alcanzar el fin observable) cuenta como **fallo** | Guion §4, cálculo |
| P-3 | Un ítem del SUS con **doble marca** se registra **vacío**, lo que deja el cuestionario incompleto | SUS §4.5–4.6 |
| P-4 | Al recibir el SUS, una sola pregunta: «¿Dejó alguna sin marcar a propósito?» | SUS §4.5 |
| P-5 | Criterio por tarea sólo con toda la muestra planificada; si no, «NO EJECUTADA (muestra incompleta)» | **Incorporada** en el protocolo v1.2 §3.6 |
| P-6 | El nivel 3 prevalece sobre el resultado y se informa aparte | Protocolo v1.2 §3.5; guion §4; cálculo |

## Versiones de los instrumentos

Se fijan **después del piloto** y **antes** de la primera sesión de la muestra final.

| Instrumento | Versión propuesta | Estado | Fecha de fijación (real) | Motivo del cambio |
|---|---|---|---|---|
| Tarjetas | TAR-1 | Propuesta | | |
| SEQ | SEQ-ES-1 | Propuesta (traducción de trabajo) | | |
| SUS | SUS-ES-1 (literal + A-1, A-2) | Propuesta | | |
| Guion y pistas | GUION-1 | Propuesta | | |

## Diccionario de los CSV

UTF-8 (con o sin BOM), **separados por comas** y con la cabecera exacta de `plantillas/`.

- **`participantes.csv`**: `codigo`, `interfaz` (MOVIL/WEB), `perfil` (AGRICULTOR/DIRECTIVA), `comodidad_digital` (1–5), `modalidad` (INDIVIDUAL/COMPARTIDA, sólo agricultor), `es_piloto` (si/no), `version_tarjetas`, `version_sus`, `version_seq`, `observador_independiente` (si/no) y `notas`.
- **`tareas.csv`**: una fila por participante y tarea, **también las no intentadas**.
  - `intentada` (si/no). Si es «no», el resto va vacío y el motivo va en `notas`.
  - `tiempo_s` (entero; máximo 300 en Móvil y 240 en Web).
  - `resultado` (COMPLETADA / INCORRECTA / ABANDONO / TIEMPO_AGOTADO).
  - `nivel_ayuda` (0–3, el más alto usado).
  - `errores`, `errores_criticos` y `seq` (1–7 o vacío).
  - `notas`, sin datos personales.
- **`sus.csv`**: `codigo`, `interfaz` e `i1`…`i10` (1–5, o vacío si no respondió o marcó dos casillas), más `notas`.
- **`hallazgos.csv`**: `id`, `interfaz`, `tarea`, `descripcion`, `participantes_afectados` (número) y `notas`. La `gravedad` es:
  - **CRÍTICA:** dato incorrecto guardado sin notarlo, o la tarea no puede completarse;
  - **ALTA:** fallo o ayuda de nivel 2–3 en varios participantes;
  - **MEDIA:** retraso o error corregido por la persona;
  - **BAJA:** cosmética o de preferencia.

## Cálculo

```
cd docs/evaluation/usabilidad/calculo
python -I -X utf8 test_calcular_usabilidad.py -v                       # aritmética, con el ejemplo ficticio
python -I -X utf8 calcular_usabilidad.py ../resultados --salida ../resultados/informe.md
```

**El script se detiene con un error, sin informe parcial,** si:
- la cabecera de un CSV no es exactamente la de `plantillas/`, por ejemplo si falta `i10` o `seq`, o sobra una columna;
- el separador es «;» en vez de coma. Un BOM de UTF-8 se acepta;
- una fila tiene más columnas que la cabecera;
- falta una fila de tarea, aunque no se haya intentado;
- una tarea con `intentada=no` trae mediciones: el motivo va sólo en `notas`;
- un valor está fuera de rango o falta un dato obligatorio;
- el perfil no corresponde a la interfaz (MOVIL ↔ AGRICULTOR, WEB ↔ DIRECTIVA), o la modalidad no es válida o se anota a la Directiva;
- se repite un participante, una tarea o un SUS;
- una tarea no corresponde a la interfaz del participante;
- un `TIEMPO_AGOTADO` no registra el máximo.

**El informe muestra además el n por perfil:** comodidad 1–2, 3 y 4–5 y, en Móvil, la modalidad, frente al objetivo del protocolo (al menos 2 con comodidad 1–2 y al menos 1 compartida).

No corrige ni completa datos. Mostrar un decimal es sólo presentación (redondeo «mitad hacia arriba»).

## Lo que Roderich tiene que hacer

1. Confirmar con el tutor si Univalle exige algún trámite para la participación (protocolo v1.2 §3.3).
2. Invitar personalmente a los participantes. Nadie envía mensajes en su nombre.
3. Completar los datos de contacto de la hoja de consentimiento.
4. Hacer el piloto (X01), fijar las versiones y anotarlas en la tabla de arriba.
5. Hacer las 7 sesiones, transcribir los CSV en `resultados/` el mismo día y ejecutar el cálculo.

**Límites declarados:**
- La facilita el desarrollador: puede haber sesgo, y si no hay observador independiente se declara.
- La muestra es pequeña e intencional.
- El teléfono no es el del participante.
- Los datos son sintéticos.
- La Web muestra cifras en modo sintético provisional (F07-POL-01, #107 sin aprobar).
