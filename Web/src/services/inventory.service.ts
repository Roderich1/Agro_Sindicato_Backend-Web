import { api } from '../lib/axios';
import type {
  CreateProductPayload,
  ListProductsQuery,
  Product,
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
