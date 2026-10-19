# PLANTILLA — F10 Usabilidad (RNF-07): evidencia de la muestra final

> **Esto es una plantilla, no una evidencia.** No se ha ejecutado ninguna sesión. Se copia a `docs/evidence/F10_USABILIDAD.md` (Backend/Web, UX-02, BE #47) y a `docs/evidence/F10_USABILIDAD.md` (Mobile, UX-01, MOB #37) **sólo cuando existan datos reales anonimizados** en `resultados/`. Todo campo entre `<…>` se rellena con lo que de verdad ocurrió; lo que no ocurrió se escribe como «no ocurrió» o «NO EJECUTADA». **No se retro-fecha, no se imputa ni se simula.** Procedencia: sesiones con personas (DEVICE / Navegador); el análisis lo produce `calculo/calcular_usabilidad.py` sobre los CSV reales.

- **Fecha real de las sesiones:** `<primera>` a `<última>` (America/La_Paz y UTC).
- **Facilitó:** Roderich Rendón, con el guion `02_guion_facilitador.md` versión `<GUION-n>`. **Observador independiente:** `<sí: código / no: se declara el sesgo de que la recogida la hizo el desarrollador>`.
- **Protocolo:** `docs/evaluation/F10_PROTOCOLOS_EVALUACION.md` `<versión>` (`<SHA>`), §3; precisiones de `usabilidad/README.md` `<P-1…P-6, con la versión fijada tras el piloto>`.
- **Trámite institucional:** `<respuesta del tutor sobre el trámite de Univalle, con fecha real / no ocurrió>`.
- **Consentimientos:** `<n>` recogidos (`<escritos / verbales anotados>`), guardados fuera de los repositorios. Sin audio, sin rostros, sin nombres en este archivo.
- **Issues:** MOB #37 (UX-01), BE #47 (UX-02). GATE-F10 (BE #49): **Pending** (sólo Roderich lo cambia).

## 1. Versiones evaluadas

| Elemento | Valor |
|---|---|
| Mobile | `main` `<SHA>`; copia `.f10ux`, modo profile, SHA-256 `<…>`, `minSdk`/`targetSdk` por `aapt2`; reinstalada antes de cada participante |
| Teléfono | `<modelo, Android / API, resolución, dpi>` (configuración `<A1 u otra; si no es A1, cita la versión del protocolo que lo cambió>`); `font_scale` `<valor>` |
| Backend / Web | `main` `<SHA>` (código `<SHA>`); entorno `<nombre del contenedor / puertos>`, `NODE_ENV=<…>`, divulgación `<provisional-synthetic, desviación declarada; k = 3>` |
| Navegador (Web) | `<Chrome / Edge versión exacta>`, Windows 11, `<resolución>` (configuración `<B1 / B2>`) |
| Dataset | `<DS-UX versión / generador y semilla; SHA del CSV o de la base sembrada>`; valores esperados de T3 y W1/W2 anotados el `<fecha>` antes de la primera sesión |
| Instrumentos | Tarjetas `<TAR-n>`, SEQ `<SEQ-ES-n>`, SUS `<SUS-ES-n>`; fijados el `<fecha real>` tras el piloto X01 (`08_piloto_comprension.md`) |

## 2. Participantes (n por perfil, sin nombres)

| Interfaz | Planificados | Participaron | Comodidad 1–2 | Comodidad 3 | Comodidad 4–5 | Modalidad compartida (sólo Móvil) |
|---|---|---|---|---|---|---|
| Móvil (P01–P05) | 5 | `<k>` | `<n>` (objetivo ≥ 2) | `<n>` | `<n>` | `<n>` (objetivo ≥ 1) |
| Web (D01–D02) | 2 | `<k>` | `<n>` | `<n>` | `<n>` | — |

El piloto X01 **no** aparece aquí ni en ninguna tabla: sólo se publica qué se ajustó y por qué (`README.md`, versiones).

## 3. Resultado por tarea (denominadores explícitos)

Regla (protocolo §3.6): CUMPLE si el éxito con ayuda de nivel 0–1 es ≥ 80 % de quienes la intentaron **y** hubo cero errores críticos, **sólo si la intentaron todos los participantes planificados** (5 en Móvil, 2 en Web). Con menos: «NO EJECUTADA (muestra incompleta: k de N)». «0–1» no se llama «sin ayuda». El nivel 3 prevalece sobre el resultado y se informa aparte.

### Móvil

| Tarea | Intentaron (k de 5) | Éxito nivel 0 | Éxito nivel 1 | Ayuda nivel 2 | Intervención nivel 3 | Fallos (abandono / tiempo / INCORRECTA) | Errores críticos | Tiempo mediana (rango), s | SEQ mediana (rango) | Resultado |
|---|---|---|---|---|---|---|---|---|---|---|
| T1 | `<k>` de 5 | `<n>` | `<n>` | `<n>` | `<n>` | `<n>` | `<n>` | `<…>` | `<…>` | `<CUMPLE / NO CUMPLE / NO EJECUTADA (muestra incompleta: k de 5)>` |
| T2 | | | | | | | | | | |
| T3 | | | | | | | | | | |
| T4 | | | | | | | | | | |
| T5 | | | | | | | | | | |
| T6 | | | | | | | | | | |

### Web

| Tarea | Intentaron (k de 2) | Éxito nivel 0 | Éxito nivel 1 | Ayuda nivel 2 | Intervención nivel 3 | Fallos | Errores críticos | Tiempo mediana (rango), s | SEQ mediana (rango) | Resultado |
|---|---|---|---|---|---|---|---|---|---|---|
| W1 | `<k>` de 2 | | | | | | | | | `<con 2 de 2, el 80 % exige 2/2>` |
| W2 | | | | | | | | | | |
| W3 | | | | | | | | | | |
| W4 | | | | | | | | | | |
| W5 | | | | | | | | | | |

## 4. SUS por código (Brooke, 1996; versión española de Sevilla-Gonzalez et al., 2020, `<SUS-ES-n>`)

| Interfaz | Código | Puntaje (0–100, no es porcentaje) | Completo |
|---|---|---|---|
| Móvil | P01 | `<…>` | `<sí / no: ítems vacíos …>` |
| … | | | |
| Web | D01 | `<…>` | |

| Interfaz | n válido (completos) | Media | Mediana | Rango | Incompletos (aparte) | Criterio operativo media ≥ 68 |
|---|---|---|---|---|---|---|
| Móvil | `<n>` de 5 | `<…>` | `<…>` | `<…>` | `<n>` | `<CUMPLE / NO CUMPLE / NO EJECUTADA>` |
| Web | `<n>` de 2 | | | | | |

No se imputan ítems vacíos; no se pidió marcar 3.

## 5. Hallazgos por gravedad

| ID | Interfaz | Tarea | Gravedad (CRÍTICA / ALTA / MEDIA / BAJA) | Descripción | Participantes afectados | Issue abierto |
|---|---|---|---|---|---|---|
| `<H-01>` | | | | | `<n>` | `<repo#n o —>` |

## 6. Desviaciones y limitaciones

- `<Desviaciones respecto del protocolo y del guion, cada una con fecha real y efecto>`.
- Facilitación por el desarrollador; `<observador independiente: sí / no>`.
- Muestra pequeña e intencional: evaluación **exploratoria**, sin inferencia poblacional.
- Teléfono del facilitador, no del participante; datos sintéticos; Web en modo `provisional-synthetic` (F07-POL-01, #107 `<estado>`).
- Sin inspección personal del tutor; su revisión se registra en GOV-01 (#105) en sus propios términos.

## 7. Archivos

- `resultados/participantes.csv`, `tareas.csv`, `sus.csv`, `hallazgos.csv` (anonimizados) y `resultados/informe.md` generado con `calculo/calcular_usabilidad.py` el `<fecha>` sobre `<SHA>`; huellas SHA-256 `<…>`.
- Comando: `python -I -X utf8 ../calculo/calcular_usabilidad.py . --salida informe.md`; salida resumida: `<…>`.
