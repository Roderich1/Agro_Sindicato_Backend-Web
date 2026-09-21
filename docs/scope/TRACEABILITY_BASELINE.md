# Baseline de trazabilidad

## Cadena vigente

`Objetivo del Proyecto → CURRENT_SCOPE → URS → SRS → ADR → issue de implementación → verificación futura`

| Project Objective | Current scope | URS | SRS | Architecture decision | Implementation issue | Future verification |
|---|---|---|---|---|---|---|
| Gestión individual de agroquímicos | Mobile/Flutter como autoridad individual | `TBD_F01` | `TBD_F01` | ADR-001 (PROPOSED) | #7, #8, #79, #80, #81 | Gates de fases responsables |
| Planificación colectiva | Proyección mínima + Backend + Web Directiva | `TBD_F01` | `TBD_F01` | ADR-001 (PROPOSED) | #7, #8, #79, #80, #81 | Contratos, privacidad, integración y evidencia |
| Operación offline | Outbox móvil y sync idempotente | `TBD_F01` | `TBD_F01` | ADR-001 (PROPOSED) | #8, #80, #81 | F02/F05/F10 |
| Voz asistida | Draft editable y confirmación humana | `TBD_F01` | `TBD_F01` | ADR-001 (PROPOSED) | #7, #8 | Gate específico futuro; EVO-010 no iniciado |

## Hallazgo

No se encontraron identificadores URS/SRS verificables en los Markdown auditados. El DOCX histórico describe objetivos y requisitos académicos, pero no aporta una taxonomía URS/SRS inequívoca que pueda adoptarse sin reinterpretación. Por ello se usa exactamente `TBD_F01`; resolverlo corresponde a [#7](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/7) y [#8](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/8).

Esta baseline contribuye a #7, pero no autoriza su cierre ni el de ningún gate.
