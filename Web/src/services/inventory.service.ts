import { api } from '../lib/axios';
import type {
  CreateProductPayload,
  ListGlobalStockQuery,
  ListProductsQuery,
  Product,
  StockLot,
  UpdateProductPayload,
} from '../types/inventory';

/** Catálogo de productos del sindicato (Catálogo y equivalencias). */
export const productsService = {
  list: (params?: ListProductsQuery) =>
    api.get<Product[]>('/inventory/products', { params }).then((r) => r.data),
  create: (payload: CreateProductPayload) =>
    api.post<Product>('/inventory/products', payload).then((r) => r.data),
  update: (id: string, payload: UpdateProductPayload) =>
    api.patch<Product>(`/inventory/products/${id}`, payload).then((r) => r.data),
  deactivate: (id: string) =>
    api.post<Product>(`/inventory/products/${id}/deactivate`).then((r) => r.data),
};

/**
 * Sólo la consulta de existencias que usa la página heredada `directiva.page`
 * (sin ruta desde la etapa 2 del rediseño). Las operaciones de inventario del
 * agricultor (stock inicial, entradas, salidas, lotes, ajustes, alertas y
 * movimientos) se retiraron de la Web el 2026-11-12: el agricultor usa la app.
 */
export const inventoryService = {
  globalStock: (params?: ListGlobalStockQuery) =>
    api.get<StockLot[]>('/inventory/global-stock', { params }).then((r) => r.data),
};
