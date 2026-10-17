# Hoja de registro de la sesión (una por participante)

**Sin nombres.** Sólo el código. Se transcribe a los CSV de `plantillas/` (ver `README.md`) el mismo día, sin redondear ni completar valores.

## Cabecera

| Campo | Valor |
|---|---|
| Código (P01–P05, D01–D02; piloto X01) | |
| ¿Es piloto? (sí/no) | |
| Interfaz (MOVIL/WEB) | |
| Perfil (AGRICULTOR/DIRECTIVA) | |
| Comodidad digital autodeclarada (1–5) | |
| Modalidad del inventario (INDIVIDUAL/COMPARTIDA; sólo agricultor) | |
| Fecha real de la sesión | |
| SHA del protocolo aprobado | |
| Versiones: tarjetas / SUS / SEQ | TAR-__ / SUS-ES-__ / SEQ-ES-__ |
| SHA Backend / Web / Mobile; SHA-256 de la APK; teléfono o navegador y versión | |
| ¿Hubo observador independiente? (sí/no) | |
| ¿Se grabó la pantalla, con consentimiento aparte? (sí/no) | |

## Tareas

Tiempo en **segundos enteros**. El tiempo máximo es 300 en Móvil y 240 en Web; si se agota, se anota el tiempo máximo y el resultado `TIEMPO_AGOTADO`.

**`resultado`** toma uno de estos valores:
- `COMPLETADA`: fin observable alcanzado y correcto;
- `INCORRECTA`: dijo «terminé» pero el fin no es el correcto;
- `ABANDONO`: dijo «paso»;
- `TIEMPO_AGOTADO`.

**`nivel_ayuda`:** el nivel **más alto** usado, de 0 a 3 (guion §4).

**`errores`:** número de errores no críticos.

**`criticos`:** número de errores críticos (un dato guardado incorrecto sin que la persona lo note).

**`seq`:** un número de 1 a 7, o vacío si no respondió.

| Tarea | ¿Intentada? | Tiempo (s) | Resultado | Nivel de ayuda | Errores | Críticos | SEQ | Notas (sin datos personales) |
|---|---|---|---|---|---|---|---|---|
| T1 / W1 | | | | | | | | |
| T2 / W2 | | | | | | | | |
| T3 / W3 | | | | | | | | |
| T4 / W4 | | | | | | | | |
| T5 / W5 | | | | | | | | |
| T6 | | | | | | | | |

**Si una tarea no se intentó** (por ejemplo, la sesión se cortó), se anota «no» y el motivo en Notas. **No entra** en el denominador de esa tarea y se informa aparte.

## Preguntas sobre el SUS durante su llenado

Ítem y pregunta literal que hizo la persona, sin interpretarla:

## Respuestas abiertas

- Lo más difícil:
- Qué cambiaría:

## Desviaciones del guion

(ayuda fuera de orden, incidentes, tareas saltadas…)
