# Checklists para trabajo con IA

## Antes de pedir una tarea

- Define el objetivo en una frase.
- Indica si afecta `Back`, `Web` o ambos.
- Menciona rol afectado.
- Menciona archivos o pantalla si los conoces.
- Indica que no debe tocar voz, IA predictiva ni app movil si no aplica.

## Antes de que Codex edite

- Debe haber leido archivos relevantes.
- Debe saber el contrato API actual.
- Debe saber si hay cambios no relacionados en git.
- Debe tener claro como verificar.

## Durante la implementacion

- Cambios pequenos.
- Mantener patrones existentes.
- Actualizar tipos junto con API.
- Evitar dependencias nuevas.
- Mantener mensajes de usuario claros.

## Despues de implementar

- Ejecutar comandos relevantes.
- Revisar diff.
- Revisar permisos y tenant.
- Probar camino feliz.
- Probar error principal.
- Actualizar docs si cambia contrato.

## Prompt rapido para cierre

```md
Revisa tus propios cambios antes de terminar:
- bugs
- roles
- tenantId
- contratos Back/Web
- errores visibles
- verificacion ejecutada
Resume archivos modificados y comandos corridos.
```
