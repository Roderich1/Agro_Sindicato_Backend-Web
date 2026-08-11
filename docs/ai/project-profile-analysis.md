# Analisis del perfil de proyecto

Documento base: `rcr-Perfil_de_proyecto_de_grado_v8.docx`.

## Lectura sintetica

El perfil plantea un sistema de gestion de agroquimicos para el Sindicato 19 de Agosto, con foco en:

- Control de inventario individual por agricultor.
- Consolidacion de informacion para la directiva.
- Reduccion de perdidas por vencimiento y compras duplicadas.
- Mejor gestion de compras al contado y credito.
- Seguimiento de cuentas pendientes con proveedores.
- Operacion en contexto de conectividad intermitente.
- Mejor planificacion colectiva de campanas agricolas.

El documento original tambien propone app Android, ingreso por voz, prediccion de demanda y evaluacion formal. Esos puntos son valiosos para una version completa del proyecto academico, pero no forman parte del MVP actual del repositorio.

## Adaptacion al repositorio actual

El repositorio existente implementa un MVP con:

- `Back`: API NestJS con Prisma/PostgreSQL.
- `Web`: PWA React/Vite para agricultores, directiva y administrador.
- `docker-compose.yml`: orquestacion local.

Por tanto, la adaptacion correcta es concentrar el esfuerzo en una PWA web que cubra los procesos principales para ambos perfiles de usuario: agricultor y directiva.

## Objetivos del perfil y estado en el MVP

| Objetivo del perfil | Estado MVP | Traduccion practica |
| --- | --- | --- |
| OE1. Analizar procesos y requerimientos | Incluido | Documentar procesos y convertirlos en flujos web/API. |
| OE2. Disenar arquitectura offline-first y por capas | Incluido con adaptacion | API NestJS modular, Web PWA, PostgreSQL y cola de sincronizacion. |
| OE3. Inventario individual, compras, cuentas, alertas y sync | Incluido | Modulos `inventory`, `procurement`, `accounts-payable`, `sync`. |
| OE4. Ingreso por voz | Excluido | No implementar Whisper ni React Native en este MVP. |
| OE5. Prediccion de demanda | Excluido | No implementar Prophet/FastAPI ni inferencia predictiva. |
| OE6. Panel consolidado de directiva | Incluido | Inventario global y compras conjuntas en Web. |
| OE7. Evaluacion formal con SUS/MAPE/sync | Excluido como objetivo funcional | Mantener verificacion tecnica: build, lint, tests y pruebas manuales. |

## Flujos MVP prioritarios

### Agricultor

- Iniciar sesion.
- Registrar inventario inicial.
- Registrar entradas.
- Registrar salidas.
- Consultar stock y alertas.
- Administrar lotes y vencimientos.
- Registrar compras.
- Registrar proveedores.
- Ver cuentas por pagar.
- Registrar abonos o pagos totales.
- Sincronizar operaciones offline.

### Directiva

- Iniciar sesion.
- Consultar agricultores activos.
- Consultar inventario global.
- Filtrar por agricultor, producto, categoria o criticidad.
- Registrar compra conjunta.
- Distribuir cantidades entre agricultores.
- Generar stock y cuentas por pagar individuales cuando corresponde.

### Administrador

- Gestionar usuarios.
- Asignar roles.
- Desactivar cuentas.
- Resetear passwords.
- Acceder a vistas operativas cuando corresponda.

## Riesgos detectados para Codex

- Confundir el alcance academico completo con el MVP actual.
- Intentar crear una app Android aunque el repo solo tenga `Back` y `Web`.
- Implementar voz o prediccion porque existen modulos placeholder.
- Romper la separacion por roles.
- Enviar `tenantId` desde el frontend.
- Duplicar reglas entre frontend y backend sin contrato claro.
- Ignorar sincronizacion offline al cambiar inventario.
- Introducir dependencias grandes para resolver tareas simples.

## Decision de documentacion

Se crearon instrucciones en tres niveles:

- `AGENTS.md`: reglas globales del repositorio para Codex.
- `Back/AGENTS.md`: reglas especificas de backend.
- `Web/AGENTS.md`: reglas especificas de frontend.

Y guias complementarias en `docs/ai`:

- Alcance MVP.
- Prompts.
- Arquitectura.
- Backend.
- Frontend.
- Offline/sync.
- Seguridad y uso responsable de IA.
- Definition of Done.
- Checklists de trabajo con IA.

Esta estructura permite que Codex tenga instrucciones duraderas y que el usuario tenga documentos humanos para orientar nuevas tareas.
