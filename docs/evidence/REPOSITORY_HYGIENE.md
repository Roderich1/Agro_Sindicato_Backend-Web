# Repository hygiene

Baseline auditada: `main@a09876106dd696868217b301a9abf9125ac6d01d`. Rama: `chore/repository-hygiene`. Fecha: 2026-10-04.

## Disposición del árbol actual

Se retiran 161 archivos: configuración local Claude (1), logs/resultados locales Codex (8), caché TypeScript (1), Word académico histórico (1), JMeter histórico (131), documentos sustituidos (14), assets sin referencias Web (4) y configuración Sonar redundante (1).

Los controles útiles de la antigua guía de seguridad se consolidan en [DEVELOPMENT_CONTROLS.md](../security/DEVELOPMENT_CONTROLS.md). La [matriz documental](../scope/DOCUMENT_DISPOSITION_MATRIX.md) registra la disposición y los reemplazos. Se añade `.gitignore` raíz para evitar reintroducir artefactos locales; no ignora fuentes, migraciones, lockfiles, Markdown ni el snapshot OpenAPI.

Se fija `eol=lf` exclusivamente para `docs/api/openapi-f02.json` en `.gitattributes`: en Windows, `core.autocrlf` había convertido el checkout a CRLF y el guard byte a byte informó drift. El documento generado fue idéntico al blob Git de la baseline; no hubo diferencia contractual ni cambio del snapshot versionado. La regla permite repetir el guard en Windows sin modificar sus assertions.

Se conservan los cinco documentos de contratos/modelo en `Back/docs/`, README/AGENTS, scope, requisitos, ADR, arquitectura, evidencia, seguridad, testing y OpenAPI. No se cambia lógica de negocio, páginas/rutas, endpoints, Prisma, migraciones, seed, dependencias o tests funcionales. Los placeholders Backend de forecasting y voz permanecen para su retirada gobernada por #81.

## Referencias históricas mínimas

- JMeter no tiene consumidores de ejecución en workflows/scripts actuales encontrados. Los issues F10 consultados no lo fijan como suite vigente. El historial permanece disponible: [planes y resultados](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/tree/a09876106dd696868217b301a9abf9125ac6d01d/jmeter-tests).
- El [reporte histórico](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/blob/a09876106dd696868217b301a9abf9125ac6d01d/jmeter-tests/reporte/statistics.json) registra **51 muestras, 28 errores (54,901962 %)**. Es evidencia negativa, no un PASS del contrato actual. [REC-044 #78](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/78) y [REC-038 #72](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/72) conservan sus limitaciones. Último cambio histórico de la carpeta: `e08988445402c8c4ecf63fe6126b0518a863a7ff`.
- El [Word histórico](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/blob/a09876106dd696868217b301a9abf9125ac6d01d/rcr-Perfil_de_proyecto_de_grado_v8.docx), las [guías IA](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/tree/a09876106dd696868217b301a9abf9125ac6d01d/docs/ai) y los planes [Backend](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/blob/a09876106dd696868217b301a9abf9125ac6d01d/Back/docs/codex-backend-implementation.md) / [Web](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/blob/a09876106dd696868217b301a9abf9125ac6d01d/Web/docs/codex-frontend-implementation.md) permanecen en Git. No se reescribe historial ni se borran tags/issues/PRs.

## Configuración Sonar

La API pública de Sonar consultada el 2026-10-04 devuelve `sonar.autoscan.enabled=true` para `Roderich1_Agro_Sindicato_Backend`; el último análisis observado tiene revisión `a098761`. Los dos archivos de configuración tenían blob idéntico `0190fe31aef71d3a9629266eddc0505743d6755b` y no existe scanner de CI en scripts/workflows del repositorio.

Se conserva `.sonarcloud.properties`, configuración del análisis automático según la [documentación oficial](https://docs.sonarsource.com/sonarqube-cloud/analyzing-source-code/automatic-analysis). Se retira `sonar-project.properties` y se quitan exclusiones de carpetas ya retiradas. No se cambia el método de análisis. La baseline tenía check neutral `Quality Gate not computed` y estado de gate `NONE`; no se interpreta como PASS.

## Project y frontera funcional

La revisión inicial de Project #3 encontró 133 items. Se archivaron 50 tarjetas: 43 reconstrucciones históricas Done (21 Backend/Web y 22 Mobile) y 7 F08/Post-PG `not_planned`. Se conservan 83 items vigentes, futuros o necesarios para gobierno. El estado `isArchived` de los 133 IDs se verificó mediante GraphQL; el listado final contiene 83 items. No se borró ni cerró ningún issue/PR. Las 22 reconstrucciones Mobile tienen issues abiertos pese a Done en Project; esa discrepancia se conserva para revisión.

Los campos contradictorios de F03 y los metadatos incompletos de #90 se reportan; no se declara un gate Passed ni se inventa evidencia. La matriz administrativa exacta se entrega como informe de la ejecución.

[ALIGN-TECH-01 #81](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/81) sigue bloqueado por contrato F05 y proyección mínima/privacidad [F06 #20](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/20); [GATE-F05 #19](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/19) permanece Pending. Los inventarios funcionales siguen en [CAPABILITY_DISPOSITION_MATRIX.md](../scope/CAPABILITY_DISPOSITION_MATRIX.md) y [LEGACY_CONTRACT_CONSUMERS.md](../scope/LEGACY_CONTRACT_CONSUMERS.md). El retiro funcional sólo puede avanzar conforme a [TRANSITION_PLAN.md](../scope/TRANSITION_PLAN.md), después de contratos aprobados, consumidores migrados y controles de reconciliación, retención, exportación, backup/restore y rollback.

## Validación de esta entrega

Ejecutado en el worktree de higiene, Windows con Node `v25.9.0` y npm `11.12.1`; el workflow remoto verifica Node 22. Las pruebas PostgreSQL utilizaron tres bases separadas en un contenedor PostgreSQL 16 exclusivo de esta tarea, sin tocar bases del propietario.

| Comprobación | Resultado |
|---|---|
| Backend `npm ci`, Prisma validate/generate y build | PASS |
| Backend Jest normal | PASS: 25 suites / 105 tests; 3 suites PostgreSQL / 40 tests skipped en este comando |
| Migraciones existentes en tres bases vacías | PASS: cuatro migraciones por base; ninguna migración nueva |
| OpenAPI snapshot y contract guard | PASS después de resolver exclusivamente CRLF del checkout; snapshot idéntico al blob baseline |
| PostgreSQL auth V2 | PASS: 12/12 |
| PostgreSQL current auth context | PASS: 25/25 |
| PostgreSQL HTTP final | PASS: 3/3 |
| Web `npm ci`, lint, `tsc -b` y build | PASS; lint tiene dos warnings preexistentes y cero errores; no existe script/suite de tests Web |
| Docker Compose config | PASS |
| Enlaces Markdown locales y reglas ignore | PASS; sin enlaces rotos; fuentes, OpenAPI, ejemplos env, lockfiles y recomendaciones compartidas de editor permanecen elegibles |
| Frontera funcional | PASS: código funcional, Prisma, scripts, dependencias, workflow y snapshot OpenAPI sin cambios |

Las suites PostgreSQL se ejecutaron con timeout de 30 segundos para el arranque local, sin cambiar tests ni assertions. Los logs e inventarios exactos se entregan fuera del árbol del producto. Los checks remotos de la PR se registran en su entrega; la ejecución verde de la baseline no se presenta como verificación de esta rama. El riesgo de dependencias #94 sigue pendiente y no se actualizan paquetes en esta higiene.
