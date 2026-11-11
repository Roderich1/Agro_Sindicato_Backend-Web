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


/**
 * Búsqueda del catálogo (rediseño, sesión C): nombre, nombre comercial o
 * ingrediente activo, sin distinguir mayúsculas, tildes ni espacios repetidos.
 * Una búsqueda vacía coincide con todo.
 */
export function matchesProduct(
  product: { name: string; commercialName?: string | null; activeIngredient?: string | null },
  query: string,
): boolean {
  const wanted = normalizeName(query);
  if (!wanted) return true;
  return [product.name, product.commercialName, product.activeIngredient].some((value) => value != null && normalizeName(value).includes(wanted));
}

/** Nombre comparable sin la normalización de espacios: sólo para ordenar. */
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });

export type ProductGrouping = 'category' | 'unit' | 'none';

export interface ProductGroup<T> {
  key: string;
  label: string;
  products: T[];
}

/**
 * Agrupa con los datos que ya existen: la categoría (opcional, texto libre;
 * «Herbicida» y «herbicida» van juntas) o la unidad (L, kg y las demás, que no
 * se vinculan a cifras colectivas). Dentro de cada grupo, por nombre.
 */
export function groupProducts<T extends { name: string; category: string | null; unit: string }>(products: T[], grouping: ProductGrouping): ProductGroup<T>[] {
  if (grouping === 'none') return [{ key: 'todos', label: 'Todos los productos', products: [...products].sort(byName) }];
  const groups = new Map<string, ProductGroup<T>>();
  for (const product of products) {
    let key: string;
    let label: string;
    if (grouping === 'category') {
      key = product.category ? normalizeName(product.category) : '';
      label = product.category?.trim() || 'Sin categoría';
    } else {
      const upper = product.unit.trim().toUpperCase();
      key = upper === 'L' ? 'l' : upper === 'KG' ? 'kg' : '~otras';
      label = upper === 'L' ? 'Litros (L)' : upper === 'KG' ? 'Kilogramos (kg)' : 'Otras unidades (no vinculables a cifras colectivas)';
    }
    if (key === '') key = '~sin';
    const group = groups.get(key) ?? { key, label, products: [] };
    group.products.push(product);
    groups.set(key, group);
  }
  return [...groups.values()]
    .sort((a, b) => (a.key.startsWith('~') === b.key.startsWith('~') ? a.label.localeCompare(b.label, 'es', { sensitivity: 'base' }) : a.key.startsWith('~') ? 1 : -1))
    .map((group) => ({ ...group, products: group.products.sort(byName) }));
}
