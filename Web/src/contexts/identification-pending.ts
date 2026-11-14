import { createContext, useContext } from 'react';

/**
 * Insignia «Por identificar» del menú (H-02, U.5 del inventario v2).
 *
 * - El recuento es el largo de `identificationService.list('PENDING')`, pedido
 *   por `IdentificationPendingProvider` al iniciar la sesión institucional y
 *   cada vez que alguien llama `notifyIdentificationChanged()`. Sin sondeo.
 * - `null` = sin dato (cargando, error, otro rol o sin proveedor): no hay
 *   insignia. Un error nunca se muestra como «0».
 */
export interface IdentificationPendingValue {
  /** Solicitudes pendientes según la última respuesta del servidor; `null` si no hay dato. */
  pending: number | null;
}

export const IdentificationPendingContext = createContext<IdentificationPendingValue>({ pending: null });

/** Recuento de pendientes para el armazón; `null` fuera del proveedor (p. ej. en pruebas de una vista). */
export function useIdentificationPending(): number | null {
  return useContext(IdentificationPendingContext).pending;
}

/** Nombre del evento de ventana que pide volver a contar las solicitudes pendientes. */
export const IDENTIFICATION_CHANGED_EVENT = 'agro:identificacion-cambiada';

/**
 * Señal para la sesión C: llámela tras vincular, crear producto, posponer o
 * corregir una identificación. El proveedor vuelve a pedir la lista (una
 * llamada). Sin proveedor montado no hace nada.
 */
export function notifyIdentificationChanged(): void {
  window.dispatchEvent(new Event(IDENTIFICATION_CHANGED_EVENT));
}
