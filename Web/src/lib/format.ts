import axios from 'axios';

export function extractError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && err.response) {
    const data = err.response.data as { message?: string | string[] } | undefined;
    if (data?.message) return Array.isArray(data.message) ? data.message.join(', ') : data.message;
    if (err.response.status === 403) return 'No tienes permisos para esta accion.';
    if (err.response.status === 401) return 'Sesion expirada. Inicia sesion nuevamente.';
  }
  return fallback;
}

export function fmtDate(value: string | null | undefined): string {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('es-BO', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

export function fmtNumber(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n.toLocaleString('es-BO', { maximumFractionDigits: 2 }) : '0';
}

export function toNumber(value: string | number | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function fmtQuantity(value: string | number | null | undefined, unit?: string | null): string {
  const formatted = fmtNumber(value);
  return unit ? `${formatted} ${unit}` : formatted;
}

export function fmtMoney(value: string | number | null | undefined): string {
  const n = toNumber(value);
  return n.toLocaleString('es-BO', {
    style: 'currency',
    currency: 'BOB',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
