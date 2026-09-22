# Baseline de trazabilidad

## Cadena vigente

`Objetivo del Proyecto → CURRENT_SCOPE → URS → SRS → ADR → issue de implementación → verificación futura`

| Project Objective | Current scope | URS | SRS | Architecture decision | Implementation issue | Future verification |
|---|---|---|---|---|---|---|
| OE1 — analizar procesos y requisitos | Baseline y vacíos documentados | `TBD_F01` | `TBD_F01` | ADR-001 (ACCEPTED) | #7, #8, #79, #80 | GATE-F01 y trazabilidad final F11 |
| OE2 — diseñar arquitectura, información, roles, interfaces, sync y recuperación | Frontera Mobile/Central/Web; identidad y contratos por capacidad | `TBD_F01` | `TBD_F01` | ADR-001 (ACCEPTED) | #8, #80, #81 | F02/F05/F09; evaluación F10 |
| OE3 — implementar gestión individual Mobile | Mobile/Flutter como autoridad individual y outbox local | `TBD_F01` | `TBD_F01` | ADR-001 (ACCEPTED) | AppMovil F03/F04/F05; #81 | Gates Mobile; evaluación F10 |
| OE3 — captura por voz opcional | Draft editable y confirmación humana | `TBD_F01` | `TBD_F01` | ADR-001 (ACCEPTED) | AppMovil #10–#17 (PRE-VOICE); EVO-009 en PR móvil #8 | GATE-PRE; EVO-010 no iniciado |
| OE4 — servicio central y Web colectiva | Proyección mínima + Backend + Web Directiva | `TBD_F01` | `TBD_F01` | ADR-001 (ACCEPTED) | #79, #80, #81 y trabajo F06/F07 | GATE-F06/GATE-F07; evaluación F10 |
| OE5 — evaluar integración, sync, seguridad, recuperación y usabilidad | Evidencia y trazabilidad verificables | `TBD_F01` | `TBD_F01` | ADR-001 (ACCEPTED) | Trabajo F10/F11 | GATE-F10/GATE-F11 |

## Evidencia de voz verificada

En `Roderich1/AppMovilAgroquimico` existen los issues #10–#17 para PRE-VOICE y el PR móvil #8 para EVO-009. Esta referencia no inicia EVO-010 ni convierte la voz en requisito obligatorio: sólo identifica el trabajo real existente.

## Hallazgo

No se encontraron identificadores URS/SRS verificables en los Markdown auditados. El DOCX histórico describe objetivos y requisitos académicos, pero no aporta una taxonomía URS/SRS inequívoca que pueda adoptarse sin reinterpretación. Por ello se mantiene `TBD_F01`; resolverlo corresponde a [#7](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/7) y [#8](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/8).

Esta baseline contribuye a #7, pero no autoriza su cierre ni el de ningún gate.
