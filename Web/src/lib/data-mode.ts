import { useSyncExternalStore } from 'react';
import type { DisclosureMode } from '../types/collective';

/**
 * Modo de divulgación que el servidor declara en cada respuesta colectiva
 * (`disclosure.mode`). Las vistas lo comunican al recibirlo y el armazón lo
 * muestra como una etiqueta compacta («Datos sintéticos») sin repetir un banner
 * en cada pantalla. Nunca se deduce en el navegador: sin respuesta, no hay
 * etiqueta.
 */
let current: DisclosureMode | null = null;
const listeners = new Set<() => void>();

export function reportDisclosureMode(mode: DisclosureMode | null | undefined): void {
  const next = mode ?? null;
  if (next === current) return;
  current = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const read = () => current;

export function useDisclosureMode(): DisclosureMode | null {
  return useSyncExternalStore(subscribe, read, read);
}
