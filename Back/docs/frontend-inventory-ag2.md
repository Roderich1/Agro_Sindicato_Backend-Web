# AG-2 Inventario: guia para frontend

Base URL en desarrollo con Vite:

```ts
const baseURL = '/api/v1';
```

Todos los endpoints requieren sesion activa y header:

```http
Authorization: Bearer <accessToken>
```

Roles permitidos:

- `AGRICULTOR`
- `DIRECTIVA`
- `ADMINISTRADOR`

## 1. Registrar inventario inicial

Historia: como agricultor, quiero registrar mi inventario inicial para comenzar con datos reales.

Endpoint:

```http
POST /api/v1/inventory/initial-stock
```

Payload usando producto nuevo:

```json
{
  "product": {
    "productName": "Glifosato 48%",
    "activeIngredient": "Glifosato",
    "unit": "L"
  },
  "quantity": 25,
  "lotNumber": "LOTE-2026-01",
  "expirationDate": "2027-10-30",
  "warehouseName": "Galpon principal",
  "notes": "Carga inicial del cuaderno"
}
```

Payload usando producto existente:

```json
{
  "product": {
    "productId": "uuid-del-producto"
  },
  "quantity": 25,
  "lotNumber": "LOTE-2026-01",
  "expirationDate": "2027-10-30",
  "warehouseId": "uuid-del-almacen"
}
```

Respuesta exitosa:

```json
{
  "message": "Inventario inicial registrado correctamente.",
  "lot": {
    "id": "uuid-del-lote",
    "currentQuantity": "25",
    "expirationDate": "2027-10-30T00:00:00.000Z",
    "product": {
      "id": "uuid-del-producto",
      "name": "Glifosato 48%",
      "unit": "L"
    }
  },
  "movement": {
    "id": "uuid-del-movimiento",
    "type": "ENTRADA",
    "quantity": "25",
    "reason": "INVENTARIO_INICIAL: Carga inicial del cuaderno"
  }
}
```

Validaciones para UI:

- `quantity` debe ser mayor a 0.
- Enviar `product.productId` o `product.productName`.
- `expirationDate` debe tener formato `YYYY-MM-DD` si se envia.
- Mostrar toast con `message` cuando se registre correctamente.

## 2. Registrar entrada

Historia: como agricultor, quiero registrar entradas de agroquimicos para mantener actualizado el stock.

Endpoint:

```http
POST /api/v1/inventory/entries
```

Payload:

```json
{
  "product": {
    "productId": "uuid-del-producto"
  },
  "entryReason": "COMPRA",
  "quantity": 10,
  "lotNumber": "LOTE-2026-02",
  "expirationDate": "2027-12-31",
  "warehouseName": "Galpon principal",
  "notes": "Compra semanal"
}
```

Valores permitidos para `entryReason`:

- `COMPRA`
- `DEVOLUCION`
- `AJUSTE`

Respuesta exitosa:

```json
{
  "message": "Entrada de agroquimico registrada correctamente.",
  "lot": {
    "id": "uuid-del-lote",
    "currentQuantity": "10"
  },
  "movement": {
    "type": "ENTRADA",
    "quantity": "10",
    "reason": "COMPRA: Compra semanal"
  }
}
```

Notas para UI:

- Si `entryReason` es `AJUSTE`, el movimiento queda con tipo `AJUSTE`.
- Para `COMPRA` y `DEVOLUCION`, el movimiento queda con tipo `ENTRADA`.
- Despues de guardar, refrescar `GET /inventory/stock`.

## 3. Registrar salida

Historia: como agricultor, quiero registrar salidas para controlar consumo y exactitud del inventario.

Endpoint:

```http
POST /api/v1/inventory/exits
```

Payload descontando automaticamente de los lotes mas proximos a vencer:

```json
{
  "productId": "uuid-del-producto",
  "quantity": 5,
  "reason": "Aplicacion en parcela norte"
}
```

Payload descontando un lote especifico:

```json
{
  "productId": "uuid-del-producto",
  "inventoryLotId": "uuid-del-lote",
  "quantity": 5,
  "reason": "Aplicacion en parcela norte"
}
```

Respuesta exitosa:

```json
{
  "message": "Salida de agroquimico registrada correctamente.",
  "movements": [
    {
      "lot": {
        "id": "uuid-del-lote",
        "currentQuantity": "20"
      },
      "movement": {
        "type": "SALIDA",
        "quantity": "5",
        "reason": "Aplicacion en parcela norte"
      }
    }
  ]
}
```

Error por stock insuficiente:

```json
{
  "statusCode": 400,
  "message": "Stock insuficiente. Disponible: 3 L.",
  "error": "Bad Request"
}
```

Notas para UI:

- Consultar `GET /inventory/stock` antes de mostrar el formulario.
- Deshabilitar envio si la cantidad supera el stock disponible.
- Aun asi, mostrar el error del backend porque otro dispositivo offline podria haber sincronizado cambios.
- Despues de guardar, refrescar stock e historial.

## 4. Consultar stock disponible

Endpoint:

```http
GET /api/v1/inventory/stock
```

Respuesta:

```json
[
  {
    "id": "uuid-del-lote",
    "ownerUserId": "uuid-del-agricultor",
    "product": {
      "id": "uuid-del-producto",
      "name": "Glifosato 48%",
      "activeIngredient": "Glifosato",
      "unit": "L"
    },
    "warehouse": {
      "id": "uuid-del-almacen",
      "name": "Galpon principal",
      "location": null
    },
    "lotNumber": "LOTE-2026-01",
    "expirationDate": "2027-10-30T00:00:00.000Z",
    "initialQuantity": "25",
    "currentQuantity": "20",
    "receivedAt": "2026-05-28T10:00:00.000Z"
  }
]
```

Uso recomendado:

- Agrupar por `product.id` para mostrar stock total por producto.
- Ordenar visualmente por vencimiento mas cercano.
- Resaltar productos vencidos o proximos a vencer.
- Usar `id` del lote como `inventoryLotId` si el usuario quiere descontar un lote especifico.

## 5. Consultar historial de movimientos

Historia: como agricultor, quiero mantener trazabilidad de movimientos.

Endpoint:

```http
GET /api/v1/inventory/movements
```

Filtros opcionales:

```http
GET /api/v1/inventory/movements?type=SALIDA
GET /api/v1/inventory/movements?productId=uuid-del-producto
GET /api/v1/inventory/movements?from=2026-01-01&to=2026-12-31
GET /api/v1/inventory/movements?type=ENTRADA&productId=uuid-del-producto
```

Valores permitidos para `type`:

- `ENTRADA`
- `SALIDA`
- `AJUSTE`

Respuesta:

```json
[
  {
    "id": "uuid-del-movimiento",
    "ownerUserId": "uuid-del-agricultor",
    "type": "SALIDA",
    "quantity": "5",
    "reason": "Aplicacion en parcela norte",
    "occurredAt": "2026-05-28T10:00:00.000Z",
    "createdAt": "2026-05-28T10:00:00.000Z",
    "product": {
      "id": "uuid-del-producto",
      "name": "Glifosato 48%",
      "unit": "L"
    },
    "lot": {
      "id": "uuid-del-lote",
      "lotNumber": "LOTE-2026-01",
      "expirationDate": "2027-10-30T00:00:00.000Z"
    },
    "warehouse": {
      "id": "uuid-del-almacen",
      "name": "Galpon principal"
    },
    "registeredBy": {
      "id": "uuid-del-usuario",
      "name": "Juan Perez",
      "email": "juan@agro.local"
    }
  }
]
```

Uso recomendado:

- Tabla con columnas: fecha, producto, lote, tipo, cantidad, motivo, usuario.
- Filtros: tipo, producto, rango de fechas.
- Para trazabilidad, mostrar `registeredBy.name` y `occurredAt`.

## Ejemplo de servicio frontend

```ts
import { api } from '../lib/axios';

export const inventoryService = {
  initialStock: (payload: unknown) => api.post('/inventory/initial-stock', payload),
  entry: (payload: unknown) => api.post('/inventory/entries', payload),
  exit: (payload: unknown) => api.post('/inventory/exits', payload),
  stock: () => api.get('/inventory/stock'),
  movements: (params?: {
    type?: 'ENTRADA' | 'SALIDA' | 'AJUSTE';
    productId?: string;
    from?: string;
    to?: string;
  }) => api.get('/inventory/movements', { params }),
};
```

