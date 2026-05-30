# HU-16 a HU-20: guia de uso para frontend

Base URL:

```ts
const baseURL = '/api/v1';
```

Todos los endpoints requieren sesion:

```http
Authorization: Bearer <accessToken>
```

El frontend no debe enviar `tenantId`. El backend lo toma del usuario autenticado para que un sindicato no vea datos de otro.

## HU-16 Productos agroquimicos

Historia: como agricultor, quiero registrar y administrar productos con unidad, ingrediente activo y stock minimo.

### Listar productos

```http
GET /api/v1/inventory/products
GET /api/v1/inventory/products?search=glifosato
GET /api/v1/inventory/products?category=Herbicida
```

### Crear producto

```http
POST /api/v1/inventory/products
```

```json
{
  "name": "Glifosato 48%",
  "commercialName": "Glifosato Max",
  "activeIngredient": "Glifosato",
  "category": "Herbicida",
  "unit": "L",
  "minimumStock": 5,
  "expirationWarningDays": 90
}
```

### Actualizar producto

```http
PATCH /api/v1/inventory/products/{productId}
```

```json
{
  "unit": "L",
  "minimumStock": 10,
  "expirationWarningDays": 60
}
```

Uso frontend:

- Pantalla/catalogo de productos.
- Formulario con nombre, unidad, ingrediente activo, categoria, stock minimo y dias de alerta.
- Usar `minimumStock` para alertas de reposicion.
- Usar `productId` en compras, entradas, salidas, ajustes y lotes.

## HU-17 Lotes y vencimientos

Historia: como agricultor, quiero controlar lotes y fechas de vencimiento para reducir perdidas.

### Listar lotes

```http
GET /api/v1/inventory/lots
GET /api/v1/inventory/lots?productId={productId}
```

### Actualizar lote

```http
PATCH /api/v1/inventory/lots/{lotId}
```

```json
{
  "lotNumber": "LOTE-2026-01",
  "expirationDate": "2027-12-31",
  "warehouseName": "Galpon principal"
}
```

Uso frontend:

- Mostrar lotes por producto.
- Resaltar lotes vencidos y proximos a vencer.
- Permitir editar numero de lote, vencimiento y almacen.
- Para salidas, sugerir primero el lote con vencimiento mas cercano.

## HU-18 Ajustes de inventario

Historia: como agricultor, quiero registrar ajustes por perdida, dano o correccion.

Endpoint:

```http
POST /api/v1/inventory/adjustments
```

### Decremento por perdida o dano

```json
{
  "productId": "uuid-producto",
  "inventoryLotId": "uuid-lote",
  "direction": "DECREMENTO",
  "reasonType": "PERDIDA",
  "quantity": 2,
  "reason": "Producto derramado durante traslado"
}
```

### Incremento por correccion

```json
{
  "productId": "uuid-producto",
  "direction": "INCREMENTO",
  "reasonType": "CORRECCION",
  "quantity": 3,
  "lotNumber": "LOTE-AJUSTE-01",
  "expirationDate": "2027-11-30",
  "warehouseName": "Galpon principal",
  "reason": "Correccion por conteo fisico"
}
```

Valores:

- `direction`: `INCREMENTO` o `DECREMENTO`
- `reasonType`: `PERDIDA`, `DANO`, `CORRECCION`

Reglas:

- Si es `DECREMENTO`, valida stock disponible.
- Si no se envia `inventoryLotId` en decremento, descuenta primero lotes con vencimiento mas cercano.
- Todo ajuste genera movimiento tipo `AJUSTE`.

Uso frontend:

- Formulario de ajuste separado de entrada/salida normal.
- Mostrar cantidad disponible antes de guardar.
- Pedir motivo obligatorio a nivel visual, aunque backend lo deja opcional.
- Actualizar stock e historial despues de guardar.

## HU-19 Proveedores

Historia: como agricultor, quiero registrar proveedores y asociarlos a mis compras.

### Listar proveedores

```http
GET /api/v1/suppliers
GET /api/v1/suppliers?search=agro
```

### Crear proveedor

```http
POST /api/v1/suppliers
```

```json
{
  "name": "Agroservicios San Julian",
  "phone": "70000000",
  "address": "San Julian, Santa Cruz",
  "notes": "Proveedor frecuente de herbicidas"
}
```

### Actualizar proveedor

```http
PATCH /api/v1/suppliers/{supplierId}
```

```json
{
  "phone": "71111111",
  "notes": "Entrega los viernes"
}
```

Uso frontend:

- Pantalla simple de proveedores.
- Buscador por nombre.
- En formulario de compra, permitir seleccionar proveedor existente o crear uno rapido.
- El backend asocia compras al proveedor mediante `supplierId`.

## HU-20 Pagos parciales y totales

Historia: como agricultor, quiero registrar pagos parciales o totales de compras a credito.

### Listar cuentas por pagar

```http
GET /api/v1/accounts-payable
GET /api/v1/accounts-payable?status=PENDIENTE
GET /api/v1/accounts-payable?supplierId={supplierId}
```

Estados:

- `PENDIENTE`
- `PARCIAL`
- `PAGADA`
- `VENCIDA`

### Registrar abono

```http
POST /api/v1/accounts-payable/{payableId}/payments
```

```json
{
  "amount": 150,
  "paidAt": "2026-05-29",
  "notes": "Abono en efectivo"
}
```

### Registrar pago total

```http
POST /api/v1/accounts-payable/{payableId}/pay-total
```

```json
{
  "notes": "Pago final"
}
```

Reglas:

- No permite abonos mayores al saldo.
- Recalcula `paidAmount`, `balance` y `status`.
- Si se paga todo, cambia a `PAGADA`.
- Si esta vencida y aun tiene saldo, se mantiene como `VENCIDA`.

Uso frontend:

- Tabla por proveedor: total, pagado, saldo, vencimiento y estado.
- Acciones por fila: `Registrar abono`, `Pagar total`.
- Mostrar cuentas vencidas con color de alerta.

## Servicios sugeridos

```ts
import { api } from '../lib/axios';

export const productsService = {
  list: (params?: { search?: string; category?: string }) =>
    api.get('/inventory/products', { params }),
  create: (payload: unknown) => api.post('/inventory/products', payload),
  update: (id: string, payload: unknown) => api.patch(`/inventory/products/${id}`, payload),
};

export const lotsService = {
  list: (params?: { productId?: string }) => api.get('/inventory/lots', { params }),
  update: (id: string, payload: unknown) => api.patch(`/inventory/lots/${id}`, payload),
};

export const adjustmentsService = {
  create: (payload: unknown) => api.post('/inventory/adjustments', payload),
};

export const suppliersService = {
  list: (params?: { search?: string }) => api.get('/suppliers', { params }),
  create: (payload: unknown) => api.post('/suppliers', payload),
  update: (id: string, payload: unknown) => api.patch(`/suppliers/${id}`, payload),
};

export const payablesService = {
  list: (params?: { status?: string; supplierId?: string }) =>
    api.get('/accounts-payable', { params }),
  registerPayment: (id: string, payload: unknown) =>
    api.post(`/accounts-payable/${id}/payments`, payload),
  payTotal: (id: string, payload?: unknown) =>
    api.post(`/accounts-payable/${id}/pay-total`, payload ?? {}),
};
```

