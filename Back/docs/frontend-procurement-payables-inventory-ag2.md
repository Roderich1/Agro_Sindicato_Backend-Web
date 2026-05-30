# AG-2 compras, cuentas, consulta y alertas: guia para frontend

Base URL:

```ts
const baseURL = '/api/v1';
```

Todos los endpoints requieren:

```http
Authorization: Bearer <accessToken>
```

Roles permitidos:

- `AGRICULTOR`
- `DIRECTIVA`
- `ADMINISTRADOR`

## 1. Registrar compras al contado o credito

Endpoint:

```http
POST /api/v1/purchases
```

Payload compra al contado:

```json
{
  "supplier": {
    "supplierName": "Agroservicios San Julian",
    "phone": "70000000",
    "address": "San Julian, Santa Cruz"
  },
  "paymentMode": "CONTADO",
  "purchasedAt": "2026-05-28",
  "warehouseName": "Galpon principal",
  "notes": "Compra al contado",
  "items": [
    {
      "product": {
        "productName": "Glifosato 48%",
        "activeIngredient": "Glifosato",
        "category": "Herbicida",
        "unit": "L",
        "minimumStock": 5,
        "expirationWarningDays": 90
      },
      "quantity": 20,
      "unitCost": 45.5,
      "discountAmount": 10,
      "lotNumber": "LOTE-GLI-01",
      "expirationDate": "2027-12-31"
    }
  ]
}
```

Payload compra a credito:

```json
{
  "supplier": {
    "supplierId": "uuid-del-proveedor"
  },
  "paymentMode": "CREDITO",
  "dueDate": "2026-06-28",
  "warehouseName": "Galpon principal",
  "items": [
    {
      "product": {
        "productId": "uuid-del-producto"
      },
      "quantity": 10,
      "unitCost": 50,
      "lotNumber": "LOTE-CRED-01",
      "expirationDate": "2027-11-15"
    }
  ]
}
```

Reglas de negocio:

- `paymentMode` acepta `CONTADO` o `CREDITO`.
- Si `paymentMode=CREDITO`, `dueDate` es obligatorio.
- La compra crea movimiento de entrada automaticamente.
- La compra crea lote de inventario por cada item.
- La compra aumenta el stock disponible.
- Si es credito, crea cuenta por pagar pendiente.

Respuesta:

```json
{
  "message": "Compra registrada correctamente.",
  "purchase": {
    "id": "uuid-compra",
    "supplier": {
      "id": "uuid-proveedor",
      "name": "Agroservicios San Julian"
    },
    "paymentMode": "CREDITO",
    "status": "RECIBIDA",
    "totalAmount": "500",
    "discountAmount": "0",
    "purchasedAt": "2026-05-28T00:00:00.000Z",
    "receivedAt": "2026-05-28T10:00:00.000Z"
  },
  "items": [],
  "lots": [],
  "movements": [],
  "payable": {
    "id": "uuid-cuenta",
    "dueDate": "2026-06-28T00:00:00.000Z",
    "totalAmount": "500",
    "paidAmount": "0",
    "status": "PENDIENTE"
  }
}
```

UI recomendada:

- Formulario con proveedor, modalidad, fecha, fecha de vencimiento de deuda si es credito, productos y cantidades.
- Al guardar, mostrar `message`.
- Si hay `payable`, redirigir o mostrar enlace a cuentas por pagar.
- Refrescar inventario despues de guardar.

## 2. Gestionar cuentas por pagar

Listar cuentas:

```http
GET /api/v1/accounts-payable
```

Filtros:

```http
GET /api/v1/accounts-payable?status=PENDIENTE
GET /api/v1/accounts-payable?supplierId=uuid-del-proveedor
```

Estados:

- `PENDIENTE`
- `PARCIAL`
- `PAGADA`
- `VENCIDA`

Respuesta:

```json
[
  {
    "id": "uuid-cuenta",
    "purchaseId": "uuid-compra",
    "supplier": {
      "id": "uuid-proveedor",
      "name": "Agroservicios San Julian",
      "phone": "70000000"
    },
    "dueDate": "2026-06-28T00:00:00.000Z",
    "totalAmount": "500",
    "paidAmount": "150",
    "balance": "350",
    "status": "PARCIAL",
    "items": [],
    "payments": []
  }
]
```

Registrar abono parcial:

```http
POST /api/v1/accounts-payable/{id}/payments
```

```json
{
  "amount": 150,
  "paidAt": "2026-05-28",
  "notes": "Abono en efectivo"
}
```

Registrar pago total:

```http
POST /api/v1/accounts-payable/{id}/pay-total
```

```json
{
  "notes": "Pago final"
}
```

Reglas de negocio:

- No permite abonos mayores al saldo pendiente.
- Recalcula `paidAmount`, `balance` y `status`.
- Si el saldo llega a cero, queda `PAGADA`.
- Si la fecha de vencimiento ya paso y no esta pagada, queda `VENCIDA`.

UI recomendada:

- Tabla por proveedor con total, pagado, saldo, vencimiento y estado.
- Acciones: `Registrar abono`, `Pagar total`.
- Mostrar vencidas con criticidad alta.

## 3. Consultar inventario actualizado

Endpoint:

```http
GET /api/v1/inventory/stock
```

Filtros:

```http
GET /api/v1/inventory/stock?search=glifosato
GET /api/v1/inventory/stock?category=Herbicida
GET /api/v1/inventory/stock?criticality=BAJO_MINIMO
GET /api/v1/inventory/stock?criticality=VENCIDO
GET /api/v1/inventory/stock?criticality=POR_VENCER
GET /api/v1/inventory/stock?orderBy=expiration&orderDirection=asc
GET /api/v1/inventory/stock?orderBy=stock&orderDirection=desc
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
    "product": {
      "id": "uuid-producto",
      "name": "Glifosato 48%",
      "activeIngredient": "Glifosato",
      "category": "Herbicida",
      "unit": "L",
      "minimumStock": "5",
      "expirationWarningDays": 90
    },
    "supplier": {
      "id": "uuid-proveedor",
      "name": "Agroservicios San Julian"
    },
    "warehouse": {
      "id": "uuid-almacen",
      "name": "Galpon principal",
      "location": null
    },
    "lotNumber": "LOTE-GLI-01",
    "expirationDate": "2027-12-31T00:00:00.000Z",
    "currentQuantity": "20",
    "productTotalStock": "20",
    "criticality": "OK",
    "alerts": [],
    "receivedAt": "2026-05-28T10:00:00.000Z"
  }
]
```

UI recomendada:

- Buscador por nombre.
- Filtros por categoria y criticidad.
- Orden por stock o vencimiento.
- Mostrar proveedor si el lote viene de una compra.

## 4. Configurar stock minimo y umbral de vencimiento

Endpoint:

```http
PATCH /api/v1/inventory/products/{productId}/settings
```

Payload:

```json
{
  "category": "Herbicida",
  "minimumStock": 5,
  "expirationWarningDays": 90
}
```

Respuesta:

```json
{
  "id": "uuid-producto",
  "name": "Glifosato 48%",
  "category": "Herbicida",
  "unit": "L",
  "minimumStock": "5",
  "expirationWarningDays": 90
}
```

UI recomendada:

- En la ficha del producto permitir editar categoria, stock minimo y dias de alerta.
- Usar `minimumStock` para alertas de reposicion.
- Usar `expirationWarningDays` para proximos a vencer.

## 5. Alertas de stock minimo y vencimiento

Endpoint:

```http
GET /api/v1/inventory/alerts
```

Respuesta:

```json
{
  "stockMinimum": [
    {
      "type": "BAJO_MINIMO",
      "product": {
        "id": "uuid-producto",
        "name": "Glifosato 48%",
        "unit": "L",
        "minimumStock": "5",
        "currentStock": "3"
      },
      "message": "Stock bajo minimo para Glifosato 48%."
    }
  ],
  "expiration": [
    {
      "type": "POR_VENCER",
      "product": {
        "id": "uuid-producto",
        "name": "Glifosato 48%",
        "unit": "L"
      },
      "lot": {
        "id": "uuid-lote",
        "lotNumber": "LOTE-GLI-01",
        "expirationDate": "2026-06-15T00:00:00.000Z",
        "currentQuantity": "3"
      },
      "message": "Glifosato 48% tiene un lote proximo a vencer."
    }
  ],
  "total": 2
}
```

UI recomendada:

- Dashboard: contador de alertas totales.
- Seccion separada para stock bajo y vencimientos.
- Enlazar cada alerta con el producto/lote afectado.
- Mantener alerta visible hasta que suba el stock o cambie la fecha/cantidad del lote.

## Servicio frontend sugerido

```ts
import { api } from '../lib/axios';

export const purchasesService = {
  create: (payload: unknown) => api.post('/purchases', payload),
};

export const payablesService = {
  list: (params?: { status?: string; supplierId?: string }) =>
    api.get('/accounts-payable', { params }),
  registerPayment: (id: string, payload: { amount: number; paidAt?: string; notes?: string }) =>
    api.post(`/accounts-payable/${id}/payments`, payload),
  payTotal: (id: string, payload?: { notes?: string }) =>
    api.post(`/accounts-payable/${id}/pay-total`, payload ?? {}),
};

export const inventoryQueryService = {
  stock: (params?: {
    search?: string;
    productId?: string;
    category?: string;
    criticality?: 'BAJO_MINIMO' | 'VENCIDO' | 'POR_VENCER' | 'OK';
    orderBy?: 'name' | 'stock' | 'expiration';
    orderDirection?: 'asc' | 'desc';
  }) => api.get('/inventory/stock', { params }),
  alerts: () => api.get('/inventory/alerts'),
  updateProductSettings: (
    productId: string,
    payload: { category?: string; minimumStock?: number; expirationWarningDays?: number },
  ) => api.patch(`/inventory/products/${productId}/settings`, payload),
};
```
