import axios from 'axios';
import type { TagTone } from '../../components/ui';
import { offlineMessage } from '../../lib/format';
import type { UserRole } from '../../types/users';

export const NUMBER = new Intl.NumberFormat('es-BO');
export const ROLE_TONE: Record<UserRole, TagTone> = { ADMINISTRADOR: 'dark', DIRECTIVA: 'positive', AGRICULTOR: 'neutral' };
export const ROLE_TAB: Record<UserRole, string> = { DIRECTIVA: 'Directiva', ADMINISTRADOR: 'Administración', AGRICULTOR: 'Agricultores' };
export const MIN_PASSWORD = 8;
export const ROLE_ORDER: Record<UserRole, number> = { ADMINISTRADOR: 0, DIRECTIVA: 1, AGRICULTOR: 2 };

export function extractError(err: unknown, fallback: string): string {
  const offline = offlineMessage(err);
  if (offline) return offline;
  if (axios.isAxiosError(err) && err.response) {
    const data = err.response.data as { message?: string | string[] } | undefined;
    if (data?.message) return Array.isArray(data.message) ? data.message.join(', ') : data.message;
    if (err.response.status === 401) return 'Sesión expirada. Inicie sesión nuevamente.';
    if (err.response.status === 403) return 'No tiene permisos para esta acción.';
    if (err.response.status === 429) return 'Demasiadas solicitudes. Espere un momento.';
  }
  return fallback;
}
