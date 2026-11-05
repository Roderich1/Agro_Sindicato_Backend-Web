import axios from 'axios';
import { offlineMessage } from './format';

/**
 * Textos y reglas de presentación del catálogo de productos (Gestión →
 * Productos). La unidad se elige al crear: L o kg, las dos que el servidor
 * convierte a una unidad base vinculable (mL o g).
 */
export type ProductUnit = 'L' | 'kg';

export const UNIT_OPTIONS: { value: ProductUnit; label: string }[] = [
  { value: 'L', label: 'Litros (L)' },
  { value: 'kg', label: 'Kilogramos (kg)' },
];

export const CATEGORY_SUGGESTIONS = ['Herbicida', 'Fungicida', 'Insecticida', 'Fertilizante', 'Coadyuvante'];

/** Nombre comparable: sin mayúsculas, tildes ni espacios repetidos. */
export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Mensaje claro para un error del servidor al crear o editar. */
export function productError(err: unknown, fallback: string): string {
  const offline = offlineMessage(err);
  if (offline) return offline;
  if (axios.isAxiosError(err) && err.response) {
    const status = err.response.status;
    const message = (err.response.data as { message?: unknown } | undefined)?.message;
    if (status === 409) {
      return typeof message === 'string' && /QR/.test(message)
        ? message
        : 'Ya existe un producto con ese nombre en este sindicato. Use el existente o elija otro nombre.';
    }
    if (status === 403) return 'Su rol no puede administrar productos: sólo la Directiva y el Administrador.';
    if (status === 404) return 'El producto ya no existe en este sindicato.';
    if (status === 400) return 'Datos no válidos: el nombre debe tener entre 2 y 160 caracteres.';
  }
  if (axios.isAxiosError(err) && !err.response) return 'Sin conexión con el servidor. Vuelva a intentarlo en línea.';
  return fallback;
}

