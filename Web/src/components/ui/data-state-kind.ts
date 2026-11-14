import axios from 'axios';
import type { DataStateKind } from './types';

/**
 * Estado de `DataState` para un error de una llamada (lámina 05): sin
 * respuesta → `offline`; 429 → `busy` (la sesión sigue abierta, H-17);
 * 401/403 → `forbidden`; cualquier otro → `error`. No interpreta el cuerpo:
 * cada vista conserva sus textos propios (`collectiveError`, etc.) en `description`.
 */
export function dataStateKindForError(error: unknown): DataStateKind {
  if (!axios.isAxiosError(error)) return 'error';
  if (!error.response) return 'offline';
  const status = error.response.status;
  if (status === 429) return 'busy';
  if (status === 401 || status === 403) return 'forbidden';
  return 'error';
}
