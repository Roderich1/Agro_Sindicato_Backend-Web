# AG-2 directiva y offline: guia para frontend

Base URL:

```ts
const baseURL = '/api/v1';
```

Todos los endpoints requieren:

```http
Authorization: Bearer <accessToken>
```

## 1. Compra conjunta por directiva

Historia: como directiva, quiero crear compras conjuntas seleccionando varios agricultores y distribuyendo productos entre ellos.

Roles permitidos:

- `DIRECTIVA`
- `ADMINISTRADOR`

Endpoint:

```http
POST /api/v1/purchases/joint
```

Payload:

```json
{
  "supplier": {
    "supplierName": "Agroservicios San Julian",
    "phone": "70000000"
  },
  "paymentMode": "CREDITO",
  "dueDate": "2026-06-28",
  "purchasedAt": "2026-05-28",
  "warehouseName": "Deposito comun del sindicato",
  "notes": "Compra conjunta para descuento por volumen",
  "items": [
    {
      "product": {
        "productName": "Glifosato 48%",
        "activeIngredient": "Glifosato",
        "category": "Herbicida",
        "unit": "L"
      },
      "quantity": 50,
      "unitCost": 42,
      "discountAmount": 120,
      "lotNumber": "LOTE-CONJ-01",
      "expirationDate": "2027-12-31",
      "allocations": [
        {
          "userId": "uuid-agricultor-1",
          "quantity": 20
        },
        {
          "userId": "uuid-agricultor-2",
          "quantity": 30
        }
      ]
    }
  ]
}
```

Reglas:

- Cada `item.allocations` debe sumar exactamente `item.quantity`.
- Solo se aceptan agricultores activos del mismo sindicato.
- Crea una compra tipo `CONJUNTA`.
- Crea stock/lotes individuales para cada agricultor.
- Crea movimiento `ENTRADA` para cada agricultor afectado, registrado por la directiva.
- Si `paymentMode=CREDITO`, crea una cuenta por pagar por agricultor segun su parte.

Respuesta resumida:

```json
{
  "message": "Compra conjunta registrada y distribuida correctamente.",
  "purchase": {
    "id": "uuid-compra",
    "type": "CONJUNTA",
    "paymentMode": "CREDITO",
    "totalAmount": "1980",
    "discountAmount": "120"
  },
  "participants": [],
  "items": [],
  "allocations": [],
  "lots": [],
  "movements": [],
  "payables": []
}
```

UI recomendada:

- Paso 1: proveedor, modalidad, fecha y vencimiento si es credito.
- Paso 2: agregar productos, cantidades, costo, descuento, lote y vencimiento.
- Paso 3: seleccionar agricultores y distribuir cantidad por producto.
- Mostrar validacion visual: `cantidad distribuida / cantidad comprada`.
- Bloquear guardar si una distribucion no cuadra.
- Al guardar, mostrar resumen de stock creado y deudas generadas.

## 2. Inventario global para directiva

Historia: como directiva, quiero consultar el inventario global de todos los agricultores.

Roles permitidos:

- `DIRECTIVA`
- `ADMINISTRADOR`

Endpoint:

```http
GET /api/v1/inventory/global-stock
```

Filtros:

```http
GET /api/v1/inventory/global-stock?search=glifosato
GET /api/v1/inventory/global-stock?ownerUserId=uuid-agricultor
GET /api/v1/inventory/global-stock?category=Herbicida
GET /api/v1/inventory/global-stock?criticality=BAJO_MINIMO
GET /api/v1/inventory/global-stock?criticality=VENCIDO
GET /api/v1/inventory/global-stock?orderBy=expiration&orderDirection=asc
```

Criticidades:

- `BAJO_MINIMO`
- `VENCIDO`
- `POR_VENCER`
- `OK`

Respuesta:

```json
[
  {
    "id": "uuid-lote",
    "ownerUserId": "uuid-agricultor",
    "owner": {
      "id": "uuid-agricultor",
      "name": "Juan Perez",
      "email": "juan@agro.local",
      "role": "AGRICULTOR"
    },
    "product": {
      "id": "uuid-producto",
      "name": "Glifosato 48%",
      "category": "Herbicida",
      "unit": "L",
      "minimumStock": "5",
      "expirationWarningDays": 90
    },
    "supplier": {
      "id": "uuid-proveedor",
      "name": "Agroservicios San Julian"
    },
    "lotNumber": "LOTE-CONJ-01",
    "expirationDate": "2027-12-31T00:00:00.000Z",
    "currentQuantity": "20",
    "productTotalStock": "20",
    "criticality": "OK",
    "alerts": []
  }
]
```

UI recomendada:

- Vista tipo tabla para directiva.
- Columnas: agricultor, producto, categoria, lote, stock, vencimiento, proveedor, criticidad.
- Filtros: agricultor, producto, categoria, criticidad.
- Ordenamiento por stock y vencimiento.
- Usar `owner.id` para navegar al detalle del agricultor.

## 3. Operaciones offline y sincronizacion

Historia: como usuario, quiero registrar operaciones sin conexion y sincronizarlas automaticamente cuando vuelva internet.

Roles permitidos:

- `AGRICULTOR`
- `DIRECTIVA`
- `ADMINISTRADOR`

Endpoint para sincronizar:

```http
POST /api/v1/sync/operations
```

Payload:

```json
{
  "clientId": "device-juan-001",
  "operations": [
    {
      "clientOperationId": "op-001",
      "operation": "INITIAL_STOCK",
      "payload": {
        "product": {
          "productName": "Glifosato 48%",
          "unit": "L"
        },
        "quantity": 25,
        "lotNumber": "LOTE-OFF-01",
        "expirationDate": "2027-10-30",
        "warehouseName": "Galpon principal"
      }
    },
    {
      "clientOperationId": "op-002",
      "operation": "STOCK_EXIT",
      "payload": {
        "productId": "uuid-producto",
        "quantity": 5,
        "reason": "Aplicacion en parcela norte"
      }
    }
  ]
}
```

Operaciones soportadas:

- `INITIAL_STOCK`: usa el mismo payload de `POST /inventory/initial-stock`.
- `STOCK_ENTRY`: usa el mismo payload de `POST /inventory/entries`.
- `STOCK_EXIT`: usa el mismo payload de `POST /inventory/exits`.

Respuesta:

```json
{
  "message": "Sincronizacion procesada.",
  "clientId": "device-juan-001",
  "total": 2,
  "applied": 1,
  "conflicts": 1,
  "rejected": 0,
  "results": [
    {
      "clientOperationId": "op-001",
      "operation": "INITIAL_STOCK",
      "status": "APLICADA",
      "syncOperationId": "uuid-sync"
    },
    {
      "clientOperationId": "op-002",
      "operation": "STOCK_EXIT",
      "status": "CONFLICTO",
      "syncOperationId": "uuid-sync-2",
      "errorMessage": "Stock insuficiente. Disponible: 3 L."
    }
  ]
}
```

Consultar estado:

```http
GET /api/v1/sync/operations
GET /api/v1/sync/operations?clientId=device-juan-001
```

UI/arquitectura recomendada:

- Guardar operaciones offline en IndexedDB o almacenamiento local persistente.
- Cada operacion debe tener `clientOperationId` unico.
- Usar un `clientId` estable por dispositivo.
- Cuando vuelva internet, enviar la cola en orden a `POST /sync/operations`.
- Si una operacion vuelve `APLICADA`, quitarla de la cola local.
- Si vuelve `CONFLICTO`, mantenerla en una bandeja de conflictos para que el usuario revise.
- Si vuelve `RECHAZADA`, mostrar error y permitir descartar o editar.
- Evitar reenviar operaciones ya aplicadas; si se reenvian, el backend responde como duplicadas aplicadas.

Servicio sugerido:

```ts
import { api } from '../lib/axios';

export const jointPurchasesService = {
  create: (payload: unknown) => api.post('/purchases/joint', payload),
};

export const globalInventoryService = {
  list: (params?: {
    search?: string;
    ownerUserId?: string;
    category?: string;
    criticality?: 'BAJO_MINIMO' | 'VENCIDO' | 'POR_VENCER' | 'OK';
    orderBy?: 'name' | 'stock' | 'expiration';
    orderDirection?: 'asc' | 'desc';
  }) => api.get('/inventory/global-stock', { params }),
};

export const syncService = {
  syncOperations: (payload: {
    clientId: string;
    operations: Array<{
      clientOperationId: string;
      operation: 'INITIAL_STOCK' | 'STOCK_ENTRY' | 'STOCK_EXIT';
      payload: Record<string, unknown>;
    }>;
  }) => api.post('/sync/operations', payload),
  listOperations: (params?: { clientId?: string }) =>
    api.get('/sync/operations', { params }),
};
```
