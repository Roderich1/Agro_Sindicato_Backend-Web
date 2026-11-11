import type { Campaign } from '../../types/campaigns';

/**
 * Campañas sintéticas con la forma exacta de `GET /campaigns` (`types/campaigns.ts`).
 * Sólo para pruebas y el arnés de desarrollo (contrato §7): nunca se envían a un servidor.
 *
 * Límites del servidor usados en `worst`: nombre 2–160 caracteres y notas hasta
 * 500 (`Back/src/modules/campaigns/application/dto/campaign.dto.ts:21-38`). El
 * índice único `(tenantId, name)` (migración `20260618010000`, línea 512) es
 * sensible a mayúsculas: dos nombres que sólo difieren en mayúsculas o en un
 * espacio final son posibles; un duplicado exacto no lo es.
 *
 * Fechas de referencia: las pruebas fijan «hoy» en 2026-11-10.
 */

function campaign(id: string, overrides: Partial<Campaign>): Campaign {
  return {
    id,
    name: 'Campaña',
    status: 'PLANIFICADA',
    isActive: false,
    startDate: '2026-09-01T00:00:00.000Z',
    estimatedEndDate: null,
    closedAt: null,
    notes: null,
    createdAt: '2026-08-20T13:00:00.000Z',
    updatedAt: '2026-08-20T13:00:00.000Z',
    ...overrides,
  };
}

export const CAMPAIGN_IDS = {
  demoActive: 'c0000001-0000-4000-8000-000000000001',
  demoClosed: 'c0000001-0000-4000-8000-000000000002',
  demoPlanned: 'c0000001-0000-4000-8000-000000000003',
  worstActive: 'c0000002-0000-4000-8000-000000000001',
  worstOpenNotActive: 'c0000002-0000-4000-8000-000000000002',
  worstOpenCaseTwin: 'c0000002-0000-4000-8000-000000000003',
  worstClosedSealed: 'c0000002-0000-4000-8000-000000000004',
  worstClosedUnsealed: 'c0000002-0000-4000-8000-000000000005',
  worstCancelled: 'c0000002-0000-4000-8000-000000000006',
  worstPlannedShort: 'c0000002-0000-4000-8000-000000000007',
  one: 'c0000003-0000-4000-8000-000000000001',
} as const;

/** Parecido a la DEMO: una activa, una cerrada, una planificada. */
export const demo: Campaign[] = [
  campaign(CAMPAIGN_IDS.demoActive, {
    name: 'Campaña invierno 2026',
    status: 'ABIERTA',
    isActive: true,
    startDate: '2026-06-01T00:00:00.000Z',
    estimatedEndDate: '2026-12-15T00:00:00.000Z',
    notes: 'Trigo y papa en el valle.',
  }),
  campaign(CAMPAIGN_IDS.demoPlanned, {
    name: 'Campaña verano 2027',
    startDate: '2027-01-10T00:00:00.000Z',
    estimatedEndDate: '2027-05-30T00:00:00.000Z',
  }),
  campaign(CAMPAIGN_IDS.demoClosed, {
    name: 'Campaña verano 2026',
    status: 'CERRADA',
    startDate: '2026-01-10T00:00:00.000Z',
    estimatedEndDate: '2026-05-30T00:00:00.000Z',
    closedAt: '2026-06-02T21:14:00.000Z',
  }),
];

/** Nombre de 158 caracteres (límite 160): largo pero plausible. */
export const LONG_CAMPAIGN_NAME =
  'Campaña de invierno 2026 — Valle Alto de Cochabamba: trigo, cebada y papa de segunda siembra con riego por gravedad (zonas Punata, Cliza y Tolata, ciclo largo)';

/** Nombre largo de sindicato para la cabecera (el armazón lo toma de la sesión). */
export const LONG_TENANT_NAME =
  'Sindicato Agrario de Productores Agroecológicos y Afines de la Provincia Germán Jordán «Tierra Fértil»';

/**
 * Peor caso (`break-ui`/CATALOG.md): varias `ABIERTA` (la regla «una activa» la
 * aplica la API en `open`, no la base), una `ABIERTA` activa con fin estimado ya
 * vencido y sin cierre, `CERRADA` con `closedAt` (sellada y sin sellar),
 * `CANCELADA`, nombres que sólo difieren en mayúsculas, nombre de dos letras
 * y notas largas. Orden del servidor: activa primero, después por inicio
 * descendente.
 */
export const worst: Campaign[] = [
  campaign(CAMPAIGN_IDS.worstActive, {
    name: LONG_CAMPAIGN_NAME,
    status: 'ABIERTA',
    isActive: true,
    startDate: '2026-05-04T00:00:00.000Z',
    estimatedEndDate: '2026-10-15T00:00:00.000Z',
    closedAt: null,
    notes:
      'Se amplió el plazo de siembra por la helada de agosto. La directiva acordó en asamblea del 3 de octubre esperar la cosecha de papa antes de cerrar; el fin estimado no se actualizó en el sistema.',
  }),
  campaign(CAMPAIGN_IDS.worstOpenCaseTwin, {
    name: 'Campaña de Verano 2026',
    status: 'ABIERTA',
    isActive: false,
    startDate: '2026-02-01T00:00:00.000Z',
    estimatedEndDate: '2026-06-30T00:00:00.000Z',
  }),
  campaign(CAMPAIGN_IDS.worstOpenNotActive, {
    name: 'Campaña de verano 2026',
    status: 'ABIERTA',
    isActive: false,
    startDate: '2026-01-15T00:00:00.000Z',
    estimatedEndDate: null,
  }),
  campaign(CAMPAIGN_IDS.worstPlannedShort, {
    name: 'Q1',
    status: 'PLANIFICADA',
    startDate: '2027-01-02T00:00:00.000Z',
    estimatedEndDate: '2027-01-02T00:00:00.000Z',
  }),
  campaign(CAMPAIGN_IDS.worstClosedUnsealed, {
    name: 'Campaña de invierno 2025',
    status: 'CERRADA',
    startDate: '2025-05-01T00:00:00.000Z',
    estimatedEndDate: '2025-10-30T00:00:00.000Z',
    closedAt: '2025-11-03T22:41:00.000Z',
  }),
  campaign(CAMPAIGN_IDS.worstClosedSealed, {
    name: 'Campaña de verano 2025',
    status: 'CERRADA',
    startDate: '2025-01-10T00:00:00.000Z',
    estimatedEndDate: '2025-04-30T00:00:00.000Z',
    closedAt: '2025-05-02T14:05:00.000Z',
  }),
  campaign(CAMPAIGN_IDS.worstCancelled, {
    name: 'Campaña piloto de quinua orgánica 2024 (cancelada por falta de semilla certificada)',
    status: 'CANCELADA',
    startDate: '2024-08-01T00:00:00.000Z',
    estimatedEndDate: '2024-12-20T00:00:00.000Z',
    notes: 'Sin aportes.',
  }),
];

export const empty: Campaign[] = [];

/** Una sola campaña, activa, sin fin estimado ni notas. */
export const one: Campaign[] = [
  campaign(CAMPAIGN_IDS.one, {
    name: 'Campaña única 2026',
    status: 'ABIERTA',
    isActive: true,
    startDate: '2026-09-01T00:00:00.000Z',
  }),
];

/** La que el servidor devolvería en `GET /campaigns/active`: `isActive` y `ABIERTA`. */
export function activeOf(list: Campaign[]): Campaign | null {
  return list.find((entry) => entry.isActive && entry.status === 'ABIERTA') ?? null;
}
