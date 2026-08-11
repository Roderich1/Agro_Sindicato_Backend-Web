# Guia IA del proyecto

Esta carpeta contiene instrucciones para usar Codex y otras herramientas de IA de forma consistente en el MVP de gestion de agroquimicos.

## Lectura recomendada

1. `mvp-scope.md`: que se construye y que queda fuera del MVP.
2. `project-profile-analysis.md`: analisis del perfil academico y adaptacion al MVP.
3. `prompting-guide.md`: como pedir tareas a Codex.
4. `architecture-guidelines.md`: arquitectura y decisiones transversales.
5. `backend-guidelines.md`: reglas para NestJS, Prisma y API.
6. `frontend-guidelines.md`: reglas para React/Vite PWA.
7. `offline-sync-guidelines.md`: cola offline y sincronizacion.
8. `security-and-ai-guidelines.md`: seguridad, privacidad y uso responsable de IA.
9. `definition-of-done.md`: criterios de cierre.

## Documentos funcionales del backend

- `Back/docs/Flujo.md`: flujo decidido para agricultor y directiva.
- `Back/docs/modelo-datos-flujo.md`: relacion entre el flujo y el modelo Prisma.
- `Back/docs/codex-backend-implementation.md`: guia por fases para pedir a Codex la implementacion completa del backend.

## Fuentes base

Estas guias se apoyan en:

- Perfil de proyecto `rcr-Perfil_de_proyecto_de_grado_v8.docx`.
- Manual oficial de Codex, secciones de buenas practicas y `AGENTS.md`: https://developers.openai.com/codex
- Sitio de referencia de `AGENTS.md`: https://agents.md
- Buenas practicas de seguridad para aplicaciones con LLM de OWASP: https://owasp.org/www-project-top-10-for-large-language-model-applications/
- Pautas WCAG para accesibilidad web: https://www.w3.org/WAI/WCAG22/quickref/

## Principio rector

Codex debe comportarse como un colaborador tecnico del MVP, no como un generador libre. Antes de proponer o modificar codigo debe entender:

- Objetivo del cambio.
- Rol afectado.
- Modulo afectado.
- Contrato API.
- Estado offline si aplica.
- Verificacion esperada.

Si una tarea contradice el alcance del MVP, Codex debe indicarlo y pedir confirmacion antes de ampliar alcance.
