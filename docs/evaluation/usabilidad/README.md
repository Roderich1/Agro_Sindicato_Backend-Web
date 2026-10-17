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
- `docs/evaluation/F10_PROTOCOLOS_EVALUACION.md` §3, en la **versión aprobada que publique la sesión A** (anotar su SHA en cada sesión);
- las decisiones de cierre del 2026-10-16 (`_briefs/CIERRE_TECNICO_Y_EVALUACION_AGROCUENTAS_2026-10-16.md` §2, «Usabilidad: diseño aceptado»). Donde difieren del borrador del protocolo, **mandan las decisiones**.

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
| `calculo/test_calcular_usabilidad.py` y `calculo/ejemplo_ficticio/` | Prueba de la aritmética con datos **ficticios** marcados como ejemplo, fuera de `resultados/` |
| `resultados/` | Vacía. Sólo para datos reales anonimizados de la muestra final |

## Diseño (decisiones de cierre)

- **Muestra:**
  - **5 agricultores** en Móvil (P01–P05);
  - **2 miembros de Directiva** en Web (D01–D02), incluido el presidente con la cuenta ADMINISTRADOR si participa (ADR-003);
  - **1 piloto excluido** (X01), una persona ajena al desarrollo.

  No se eligen ni se descartan participantes según sus resultados.
- **Móvil y Web se analizan por separado.**
- **Éxito por tarea:**
  - criterio: éxito con ayuda de nivel 0–1 ≥ 80 % de los intentos y **cero errores críticos**;
  - se informan por separado: sin ayuda (0), pista general (1), ayuda específica (2, no cuenta como éxito para el criterio), intervención del facilitador (3, fallo) y fallo;
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

## Versiones de los instrumentos

Se fijan **después del piloto** y **antes** de la primera sesión de la muestra final.

| Instrumento | Versión propuesta | Estado | Fecha de fijación (real) | Motivo del cambio |
|---|---|---|---|---|
| Tarjetas | TAR-1 | Propuesta | | |
| SEQ | SEQ-ES-1 | Propuesta (traducción de trabajo) | | |
| SUS | SUS-ES-1 (literal + A-1, A-2) | Propuesta | | |
| Guion y pistas | GUION-1 | Propuesta | | |

## Diccionario de los CSV

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
- falta una fila de tarea;
- un valor está fuera de rango;
- se repite una tarea o un SUS;
- una tarea no corresponde a la interfaz del participante;
- un `TIEMPO_AGOTADO` no registra el máximo.

No corrige ni completa datos. Mostrar un decimal es sólo presentación (redondeo «mitad hacia arriba»).

## Lo que Roderich tiene que hacer

1. Confirmar con el tutor si Univalle exige algún trámite para la participación (protocolo §3.6).
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
