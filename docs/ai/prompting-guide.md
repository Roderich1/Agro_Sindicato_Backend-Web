# Guia de prompts para Codex

## Formula recomendada

Usa esta estructura cuando pidas trabajo:

```md
Objetivo:
Contexto:
Archivos relevantes:
Restricciones:
Hecho cuando:
```

Ejemplo:

```md
Objetivo:
Agregar filtro por proveedor en cuentas por pagar.

Contexto:
El MVP usa Back + Web. No tocar voz ni IA predictiva.

Archivos relevantes:
- Back/src/modules/accounts-payable
- Web/src/pages/purchases.page.tsx
- Web/src/services/inventory.service.ts

Restricciones:
- No enviar tenantId desde frontend.
- Mantener roles actuales.
- Mensajes visibles en espanol claro.

Hecho cuando:
- Backend compila.
- Web compila y lint pasa.
- La pantalla permite filtrar por proveedor.
```

## Buenas instrucciones para tareas comunes

### Implementar una fase del flujo backend

```md
Objetivo:
Implementar la fase [numero] del backend: [nombre].

Contexto:
- Back/docs/Flujo.md
- Back/docs/modelo-datos-flujo.md
- Back/docs/codex-backend-implementation.md
- Back/prisma/schema.prisma
- Back/AGENTS.md

Restricciones:
- No tocar frontend salvo que se pida.
- No aceptar tenantId desde DTOs.
- Resolver tenantId desde JWT.
- Validar roles y campana abierta/cerrada.
- Mantener controladores delgados y reglas en use cases.
- Agregar o actualizar pruebas.

Hecho cuando:
- npm run prisma:generate si cambia Prisma.
- npm run build pasa en Back.
- npm run test pasa si cambia logica de negocio.
- La documentacion queda actualizada si cambia contrato.
```

### Implementar una historia

```md
Implementa esta historia para el MVP:
Como [rol], quiero [accion], para [beneficio].

Respeta docs/ai/mvp-scope.md y las instrucciones AGENTS.md.
Primero revisa contratos existentes y luego modifica Back/Web segun corresponda.
Ejecuta las verificaciones relevantes.
```

### Revisar codigo

```md
Haz una revision de codigo de los cambios actuales.
Prioriza bugs, regresiones de seguridad, errores de roles, inconsistencias de tenantId, contratos API rotos y falta de verificacion.
```

### Crear endpoint y pantalla

```md
Agrega endpoint y UI para [flujo].
Mantener el controlador delgado, reglas en use case, DTOs validados y servicios web tipados.
No ampliar el alcance fuera del MVP.
```

### Corregir bug

```md
Corrige este bug: [descripcion].
Incluye pasos para reproducir si los puedes inferir.
Busca causa raiz antes de editar.
Verifica con el comando mas cercano.
```

## Contexto que siempre ayuda

- Rol afectado: agricultor, directiva o administrador.
- Si el dato es individual o consolidado.
- Endpoint o pantalla afectada.
- Si debe funcionar offline.
- Ejemplo de payload o error.
- Que no se debe tocar.

## Prompts que conviene evitar

- "Mejora todo el sistema".
- "Hazlo mas bonito" sin decir pantalla ni flujo.
- "Agrega IA" sin definir alcance.
- "Arregla errores" sin pegar error, comando o pantalla.

## Cuando pedir plan primero

Pide plan antes de codigo si:

- Cambia Prisma o migraciones.
- Toca autenticacion o roles.
- Afecta sincronizacion offline.
- Modifica varios modulos.
- Cambia contratos entre Back y Web.
- Implementa una fase completa de `Back/docs/codex-backend-implementation.md`.

## Reglas para aceptar resultados de IA

- No aceptar codigo sin verificacion.
- Revisar si respeta tenant y roles.
- Confirmar que los errores sean visibles para usuarios.
- Confirmar que no introdujo dependencias innecesarias.
- Confirmar que no salio del alcance MVP.
