/**
 * Datos sintéticos de los prototipos del Resumen (sólo desarrollo). Misma
 * forma que `CollectiveSummary` y `Campaign[]` (src/types): ningún dato real,
 * ninguna llamada a la API. `?datos=worst|empty|one` elige el caso extremo
 * (catálogo `break-ui`); sin parámetro, `demo`.
 */
import type { Campaign } from '../../../types/campaigns';
import type { CollectiveSummary, SummaryCell } from '../../../types/collective';

export interface ResumenDataset {
  key: 'demo' | 'worst' | 'empty' | 'one';
  label: string;
  campaigns: Campaign[];
  /** Resumen por campaña; una campaña sin entrada no tiene datos de prueba. */
  summaries: Record<string, CollectiveSummary>;
}

const T = '2026-11-08T14:30:00.000Z';

function campaign(id: string, name: string, status: Campaign['status'], isActive: boolean, startDate: string): Campaign {
  return {
    id,
    name,
    status,
    isActive,
    startDate,
    estimatedEndDate: null,
    closedAt: status === 'CERRADA' ? '2026-04-30T00:00:00.000Z' : null,
    notes: null,
    createdAt: startDate,
    updatedAt: startDate,
  };
}

function need(overrides: Partial<SummaryCell> & Pick<SummaryCell, 'product_ref' | 'product_name' | 'base_unit'>): SummaryCell {
  return {
    projection_type: 'DECLARED_NEED',
    presentation_unit: overrides.base_unit === 'G' ? 'KG' : 'L',
    status: 'DISCLOSED',
    total_base: null,
    total_presentation: null,
    contributors: null,
    data_as_of: null,
    released_at: null,
    pending_changes: false,
    ...overrides,
  };
}

/** Cifra publicada: la presentación del servidor coincide con la base (÷ 1000). */
function published(product_ref: string, product_name: string, base_unit: 'ML' | 'G', total_base: string, contributors: number, extra: Partial<SummaryCell> = {}): SummaryCell {
  const big = BigInt(total_base);
  const whole = big / 1000n;
  const fraction = (big % 1000n).toString().padStart(3, '0').replace(/0+$/, '');
  return need({
    product_ref,
    product_name,
    base_unit,
    total_base,
    total_presentation: fraction ? `${whole}.${fraction}` : whole.toString(),
    contributors,
    data_as_of: T,
    released_at: T,
    ...extra,
  });
}

function summaryFor(c: Campaign, cells: SummaryCell[], extra: Partial<CollectiveSummary> = {}): CollectiveSummary {
  return {
    contractVersion: 1,
    campaign: { campaign_ref: c.id, name: c.name, status: c.status },
    seal: null,
    disclosure: { mode: 'PROVISIONAL_SYNTHETIC', policy: 'F07-POL-01', approved: false, threshold: 3 },
    coverage: { linked_members: 9, members_with_contribution: 6, suppressed_cells: cells.some((cell) => cell.status !== 'DISCLOSED') },
    cells,
    ...extra,
  };
}

/* ── demo: parecido a la DEMO ── */
const INVIERNO = campaign('a1111111-1111-4111-8111-111111111111', 'Campaña de invierno 2026', 'ABIERTA', true, '2026-06-01T00:00:00.000Z');
const VERANO = campaign('a2222222-2222-4222-8222-222222222222', 'Campaña de verano 2025-2026', 'CERRADA', false, '2025-11-01T00:00:00.000Z');

const demo: ResumenDataset = {
  key: 'demo',
  label: 'Datos de prueba',
  campaigns: [INVIERNO, VERANO],
  summaries: {
    [INVIERNO.id]: summaryFor(INVIERNO, [
      published('p-glifosato', 'Glifosato 480 SL', 'ML', '1250000', 7),
      published('p-paraquat', 'Paraquat 200 SL', 'ML', '640500', 5, { pending_changes: true }),
      need({ product_ref: 'p-clorpirifos', product_name: 'Clorpirifos 480 EC', base_unit: 'ML', status: 'SUPPRESSED_UNDER_THRESHOLD' }),
      published('p-24d', '2,4-D Amina 720 SL', 'ML', '385000', 4),
      published('p-mancozeb', 'Mancozeb 80 WP', 'G', '212000', 4),
      published('p-sulfato', 'Sulfato de amonio', 'G', '1500000', 6),
    ]),
  },
};

/* ── worst: catálogo break-ui ── */
const LARGA = campaign(
  'b1111111-1111-4111-8111-111111111111',
  'Campaña conjunta de invierno para las comunidades del norte integrado y la zona de expansión 2026',
  'ABIERTA',
  true,
  '2026-06-01T00:00:00.000Z',
);
const PARALELA = campaign('b2222222-2222-4222-8222-222222222222', 'Campaña paralela de soya 2026', 'ABIERTA', false, '2026-07-01T00:00:00.000Z');
const PLANIFICADA = campaign('b3333333-3333-4333-8333-333333333333', 'Campaña de verano 2026-2027', 'PLANIFICADA', false, '2026-11-15T00:00:00.000Z');

const worst: ResumenDataset = {
  key: 'worst',
  label: 'Peor caso',
  campaigns: [LARGA, PARALELA, PLANIFICADA],
  summaries: {
    [LARGA.id]: summaryFor(
      LARGA,
      [
        published('w-largo', 'Herbicida sistémico de amplio espectro para barbecho químico 480 g/L', 'ML', '123456789012', 31),
        published('w-chico', 'Coadyuvante siliconado', 'ML', '25', 3, { pending_changes: true }),
        published('w-cero', 'Insecticida de contacto 50 EC', 'ML', '0', 3),
        need({ product_ref: 'w-umbral', product_name: 'Fungicida triazol 250 EC', base_unit: 'ML', status: 'SUPPRESSED_UNDER_THRESHOLD' }),
        need({ product_ref: 'w-revision', product_name: 'Clorpirifos 480 EC', base_unit: 'ML', status: 'SUPPRESSED_REVISION' }),
        need({ product_ref: 'w-overflow', product_name: 'Urea granulada', base_unit: 'G', status: 'OVERFLOW' }),
        published('w-kg', 'Fertilizante foliar completo con micronutrientes quelatados', 'G', '987654321', 12),
      ],
      {
        seal: {
          seal_ref: 'c0ffee00-0000-4000-8000-000000000001',
          version: 3,
          sealed_at: '2026-11-01T18:00:00.000Z',
          accepted_until: '2026-11-01T17:45:00.000Z',
          sealed_by: { user_ref: 'u-sintetico', name: 'Usuaria sintética de la Directiva', role: 'DIRECTIVA' },
        },
        // Denominador 0: la vista no muestra porcentaje.
        coverage: { linked_members: 0, members_with_contribution: 0, suppressed_cells: true },
      },
    ),
    [PARALELA.id]: summaryFor(PARALELA, [published('w-soya', 'Glifosato 480 SL', 'ML', '90000', 3)]),
  },
};

/* ── empty: sin necesidades publicadas ── */
const empty: ResumenDataset = {
  key: 'empty',
  label: 'Vacío',
  campaigns: [INVIERNO],
  summaries: {
    [INVIERNO.id]: summaryFor(INVIERNO, [], { coverage: { linked_members: 9, members_with_contribution: 0, suppressed_cells: false } }),
  },
};

/* ── one: un solo registro ── */
const one: ResumenDataset = {
  key: 'one',
  label: 'Uno',
  campaigns: [INVIERNO],
  summaries: {
    [INVIERNO.id]: summaryFor(INVIERNO, [published('p-glifosato', 'Glifosato 480 SL', 'ML', '1250000', 3)], {
      coverage: { linked_members: 9, members_with_contribution: 3, suppressed_cells: false },
    }),
  },
};

export const DATASETS: readonly ResumenDataset[] = [demo, worst, empty, one];

/** `?datos=` → conjunto; cualquier otro valor, `demo`. Sólo lo leen las rutas `/prototipos/*`. */
export function datasetFor(param: string | null): ResumenDataset {
  return DATASETS.find((entry) => entry.key === param) ?? demo;
}
