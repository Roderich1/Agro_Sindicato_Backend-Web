# Guia offline y sincronizacion

## Objetivo

Permitir que agricultores y directiva registren operaciones cuando la conexion sea intermitente, y que la Web sincronice al recuperar internet sin duplicar datos ni perder trazabilidad.

## Alcance

La capacidad offline pertenece a la PWA web. El backend sigue siendo una API central desplegada en internet y no trabaja offline. Su responsabilidad es recibir la cola que la PWA guardo localmente, validar cada operacion, aplicar cambios de forma idempotente y devolver estados claros para que el frontend decida que sacar de la cola o que mostrar como conflicto.

## Endpoint principal

```http
POST /api/v1/sync/operations
```

Payload:

```json
{
  "clientId": "web-device-001",
  "operations": [
    {
      "clientOperationId": "op-uuid",
      "operation": "INITIAL_STOCK",
      "payload": {}
    }
  ]
}
```

## Operaciones soportadas

- `INITIAL_STOCK`
- `STOCK_ENTRY`
- `STOCK_EXIT`

Operaciones candidatas del flujo ampliado:

- `PLOT_CREATE`
- `PLOT_UPDATE`
- `PLOT_DEACTIVATE`
- `PLOT_CROP_ASSIGN`
- `AGROCHEMICAL_APPLICATION`
- `PAYMENT_CREATE`

No agregar nuevas operaciones sin revisar idempotencia, campana activa/cerrada, permisos y reglas de negocio.

## Reglas del cliente

- Generar `clientId` estable por navegador/dispositivo.
- Generar `clientOperationId` unico por operacion.
- Guardar operaciones en almacenamiento persistente.
- Enviar operaciones en orden de creacion.
- Quitar de la cola solo si backend devuelve `APLICADA`.
- Mantener en bandeja si devuelve `CONFLICTO`.
- Permitir revisar o descartar si devuelve `RECHAZADA`.

## Reglas del backend

- Registrar cada operacion recibida.
- Detectar duplicados por cliente y operacion.
- No aplicar dos veces una operacion ya aplicada.
- Guardar `payload`, estado, error y fecha de aplicacion.
- Generar conflicto cuando el estado del servidor impide aplicar la operacion, por ejemplo stock insuficiente.
- Resolver o validar `campaignId` cuando la operacion pertenezca a una campana.
- Rechazar operaciones normales contra campanas cerradas.

## Estados

- `PENDIENTE`: recibida o registrada, no aplicada aun.
- `APLICADA`: regla de negocio ejecutada correctamente.
- `CONFLICTO`: necesita revision por diferencia de datos o stock insuficiente.
- `RECHAZADA`: payload invalido o operacion no soportada.

## Conflictos comunes

- Stock insuficiente al aplicar salida.
- Producto o lote eliminado o inaccesible.
- Operacion enviada con IDs de otro tenant.
- Operacion enviada contra campana cerrada.
- Parcela sin cultivo asignado en la campana.
- Payload antiguo respecto al contrato actual.

## UX esperada

- Indicador de online/offline.
- Contador de operaciones pendientes.
- Boton de sincronizar manual ademas de auto-sync.
- Lista de conflictos con mensaje claro.
- Reintento seguro.

## Checklist para cambios offline

- Hay idempotencia.
- Hay mensajes de conflicto claros.
- El usuario puede recuperar trabajo.
- No se pierden operaciones al recargar.
- No se duplica stock al reintentar.
- Se mantiene filtro por tenant y usuario.
