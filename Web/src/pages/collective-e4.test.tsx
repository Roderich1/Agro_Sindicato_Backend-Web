import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IdentificationPendingContext } from '../contexts/identification-pending';
import { SMALL_GROUP_NOTE } from '../lib/collective-text';
import { buildSummaryXlsx } from '../lib/collective-summary-xlsx';
import { buildTrendsXlsx } from '../lib/trends-xlsx';
import { campaignsService } from '../services/campaigns.service';
import { collectiveService } from '../services/collective.service';
import { point, sealStateWith, trendsWith } from '../test/fixtures';
import { CAMPAIGN, renderAt } from '../test/render';
import { readXlsx } from '../test/xlsx-read';
import type { CollectiveSummary, SealRef, TrendSeries } from '../types/collective';
import { CollectiveSummaryPage } from './collective-summary.page';
import { CollectiveTrendsPage } from './collective-trends.page';

vi.mock('../services/collective.service', () => ({
  collectiveService: { summary: vi.fn(), sealState: vi.fn(), seal: vi.fn(), generateProposal: vi.fn(), trends: vi.fn() },
}));
vi.mock('../services/campaigns.service', () => ({ campaignsService: { list: vi.fn() } }));

/*
 * E4 §5 en las vistas colectivas, con las formas de
 * `docs/architecture/E4_EJEMPLOS_RESPUESTAS.md` §4 (datos sintéticos del
 * documento; la campaña se ajusta a la del arnés de pruebas).
 */

/** §4.1: campaña sin sellar con `F07-POL-02` activa: una celda de 1 aportante y otra de 2 con un cero explícito. */
const SUMMARY_POL_02: CollectiveSummary = {
  contractVersion: 1,
  campaign: { campaign_ref: CAMPAIGN.id, name: CAMPAIGN.name, status: 'ABIERTA' },
  seal: null,
  disclosure: { mode: 'PROVISIONAL_SYNTHETIC', policy: 'F07-POL-02', approved: false, threshold: null },
  coverage: { linked_members: 12, members_with_contribution: 3, suppressed_cells: false },
  cells: [
    {
      projection_type: 'DECLARED_NEED', product_ref: 'p-0001', product_name: 'Producto sintético P1',
      base_unit: 'ML', presentation_unit: 'L', status: 'DISCLOSED',
      total_base: '12500', total_presentation: '12.5', contributors: 1,
      data_as_of: '2026-11-13T14:00:00.000Z', released_at: '2026-11-13T16:00:00.000Z', pending_changes: false,
    },
    {
      projection_type: 'DECLARED_NEED', product_ref: 'p-0002', product_name: 'Producto sintético P2',
      base_unit: 'G', presentation_unit: 'KG', status: 'DISCLOSED',
      total_base: '0', total_presentation: '0', contributors: 2,
      data_as_of: '2026-11-13T14:30:00.000Z', released_at: '2026-11-13T16:00:00.000Z', pending_changes: false,
    },
  ],
};

const SEAL_POL_01: SealRef = {
  seal_ref: '9b2e0000-0000-4000-8000-000000000031',
  version: 1,
  sealed_at: '2026-10-30T12:00:00.000Z',
  accepted_until: '2026-10-30T12:00:00.000Z',
  sealed_by: { user_ref: 'u-dir-1', name: 'Directiva sintética D1', role: 'DIRECTIVA' },
  policy: 'F07-POL-01',
  threshold: 3,
};

/** §4.2: campaña sellada con `F07-POL-01`, servida con su política aunque `F07-POL-02` esté activa. */
const SUMMARY_SEALED_POL_01: CollectiveSummary = {
  contractVersion: 1,
  campaign: { campaign_ref: CAMPAIGN.id, name: CAMPAIGN.name, status: 'CERRADA' },
  seal: SEAL_POL_01,
  disclosure: { mode: 'PROVISIONAL_SYNTHETIC', policy: 'F07-POL-01', approved: false, threshold: 3 },
  coverage: { linked_members: 12, members_with_contribution: 4, suppressed_cells: true },
  cells: [
    {
      projection_type: 'CONSUMPTION_TOTAL', product_ref: 'p-0001', product_name: 'Producto sintético P1',
      base_unit: 'ML', presentation_unit: 'L', status: 'DISCLOSED',
      total_base: '84000', total_presentation: '84', contributors: 4,
      data_as_of: '2026-10-29T18:00:00.000Z', released_at: '2026-10-30T11:59:00.000Z', pending_changes: false,
    },
    {
      projection_type: 'CONSUMPTION_TOTAL', product_ref: 'p-0002', product_name: 'Producto sintético P2',
      base_unit: 'G', presentation_unit: 'KG', status: 'SUPPRESSED_UNDER_THRESHOLD',
      total_base: null, total_presentation: null, contributors: null,
      data_as_of: null, released_at: null, pending_changes: false,
    },
  ],
};

const RETIRED_TEXTS = /umbral|Oculta por privacidad|Oculto por privacidad|Menos de \d+ agricultores|anónim/i;

const showSummary = () =>
  renderAt(
    <IdentificationPendingContext.Provider value={{ pending: null }}>
      <CollectiveSummaryPage />
    </IdentificationPendingContext.Provider>,
    { path: `/colectivo/resumen?campaign=${CAMPAIGN.id}` },
  );

describe('E4: Resumen colectivo sin umbral (F07-POL-02) y lo sellado con F07-POL-01', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(campaignsService.list).mockResolvedValue([CAMPAIGN]);
    vi.mocked(collectiveService.sealState).mockResolvedValue(sealStateWith({ can_seal: false, blocked_by: ['CAMPAIGN_NOT_CLOSED'], review: null }));
  });

  it('§4.1: una celda de 1 aportante y otra de 2 se publican; el cero es un cero; la política se ve; ningún texto de umbral', async () => {
    vi.mocked(collectiveService.summary).mockResolvedValue(SUMMARY_POL_02);
    showSummary();
    const one = await screen.findByTestId('cell-DECLARED_NEED-Producto sintético P1-ML');
    expect(one.querySelector('[data-figure]')!.textContent).toBe('12,5 L');
    expect(one.textContent).toMatch(/1 agricultor · datos hasta/);
    const two = screen.getByTestId('cell-DECLARED_NEED-Producto sintético P2-G');
    expect(two.querySelector('[data-figure]')!.textContent).toBe('0 KG');
    expect(two.textContent).toMatch(/2 agricultores/);
    expect(screen.queryByTestId('needs-hidden')).toBeNull();
    const policy = screen.getByTestId('policy-line');
    expect(policy.textContent).toContain('F07-POL-02 (totales sin nombres, sin mínimo de aportantes)');
    expect(policy.textContent).toContain(SMALL_GROUP_NOTE);
    expect(screen.getByTestId('needs-footnote').textContent).toMatch(/aunque aporte una sola persona/);
    expect(document.body.textContent).not.toMatch(RETIRED_TEXTS);
  });

  it('§4.2: campaña sellada con F07-POL-01: su política visible, la fila sin cifra rotulada con ella, sin «oculto por privacidad»', async () => {
    vi.mocked(collectiveService.summary).mockResolvedValue(SUMMARY_SEALED_POL_01);
    showSummary();
    const p2 = await screen.findByTestId('cell-CONSUMPTION_TOTAL-Producto sintético P2-G');
    expect(p2.textContent).toMatch(/Sin cifra según la política F07-POL-01 \(mínimo de 3 aportantes\)/);
    expect(p2.textContent).not.toMatch(/\d[\d.,]*\s?KG\b/);
    expect(screen.getByTestId('seal-policy').textContent).toMatch(/Política aplicada al sellar: F07-POL-01 \(mínimo de 3 aportantes por cifra\)/);
    expect(screen.getByTestId('cell-CONSUMPTION_TOTAL-Producto sintético P1-ML').querySelector('[data-figure]')!.textContent).toBe('84 L');
    expect(document.body.textContent).not.toMatch(/privacidad|anónim/i);
  });

  it('Excel del §4.1: «Política aplicada» F07-POL-02, el aviso de totales con pocas personas y las cifras de 1 y 2 aportantes', () => {
    const { sheets } = readXlsx(buildSummaryXlsx({ summary: SUMMARY_POL_02, exportedAt: new Date('2026-11-13T17:00:00.000Z') }).bytes);
    const cover = sheets.get('Resumen')!;
    expect(cover.text).toContain('Política aplicada');
    expect(cover.text).toContain('F07-POL-02 (totales sin nombres, sin mínimo de aportantes)');
    expect(cover.text).toContain(SMALL_GROUP_NOTE);
    expect(cover.text).toContain('2 productos: 2 con cifra publicada · 0 sin cifra publicada.');
    expect(cover.text + sheets.get('Necesidad declarada')!.text).not.toMatch(RETIRED_TEXTS);
    expect(sheets.get('Necesidad declarada')!.text).toContain('12.5');
  });

  it('Excel del §4.2: «Política aplicada al sellar» F07-POL-01 y el estado sin cifra rotulado con esa política', () => {
    const { sheets } = readXlsx(buildSummaryXlsx({ summary: SUMMARY_SEALED_POL_01, exportedAt: new Date('2026-11-13T17:00:00.000Z') }).bytes);
    const cover = sheets.get('Resumen')!;
    expect(cover.text).toContain('Política aplicada al sellar');
    expect(cover.text).toContain('F07-POL-01 (mínimo de 3 aportantes por cifra)');
    expect(cover.text).not.toContain(SMALL_GROUP_NOTE);
    const consumption = sheets.get('Consumo publicado')!;
    expect(consumption.text).toContain('Sin cifra (F07-POL-01)');
    expect(consumption.text).not.toMatch(/privacidad|anónim/i);
  });
});

describe('E4: tendencias con la política de cada campaña sellada (§4.3)', () => {
  const series: TrendSeries = {
    projection_type: 'CONSUMPTION_TOTAL',
    product_ref: 'p-0002',
    product_name: 'Producto sintético P2',
    base_unit: 'G',
    presentation_unit: 'KG',
    points: [
      point('c-2024', { status: 'SUPPRESSED_UNDER_THRESHOLD' }),
      point('c-2025', { total_base: '5000', total_presentation: '5', contributors: 1 }),
      point('c-2026', { status: 'NOT_SEALED' }),
    ],
  };
  /** 2024 sellada con F07-POL-01; 2025 sellada con F07-POL-02 (1 aportante publicado); configurada F07-POL-02. */
  const trends = () => {
    const base = trendsWith([series]);
    return {
      ...base,
      disclosure: { ...base.disclosure, policy: 'F07-POL-02' as const, threshold: null },
      campaigns: base.campaigns.map((campaign) =>
        campaign.campaign_ref === 'c-2025' && campaign.seal ? { ...campaign, seal: { ...campaign.seal, policy: 'F07-POL-02' as const, threshold: null } } : campaign,
      ),
    };
  };

  beforeEach(() => vi.clearAllMocks());

  it('cada campaña muestra su política; el hueco de 2024 dice su política y la cifra de 1 aportante de 2025 se publica', async () => {
    vi.mocked(collectiveService.trends).mockResolvedValue(trends());
    renderAt(<CollectiveTrendsPage />, { path: '/colectivo/tendencias' });
    expect((await screen.findByTestId('campaign-policy-Campaña 2024')).textContent).toBe('F07-POL-01 (mínimo de 3 aportantes por cifra)');
    expect(screen.getByTestId('campaign-policy-Campaña 2025').textContent).toBe('F07-POL-02 (totales sin nombres, sin mínimo de aportantes)');
    const table = screen.getByTestId('series-CONSUMPTION_TOTAL-Producto sintético P2-G');
    expect(within(table).getByTestId('point-Campaña 2024').textContent).toMatch(/Sin cifra según la política F07-POL-01 \(mínimo de 3 aportantes\)/);
    expect(within(table).getByTestId('point-Campaña 2025').textContent).toMatch(/5 KG/);
    expect(screen.getByTestId('how-to-read').textContent).toMatch(/conserva la política con que se selló/);
    expect(document.body.textContent).not.toMatch(/umbral|privacidad|anónim/i);
  });

  it('Excel: la portada y «Campañas» llevan la política de cada campaña; sin «Umbral de privacidad»', () => {
    const { sheets } = readXlsx(buildTrendsXlsx({ trends: trends(), type: 'CONSUMPTION_TOTAL', exportedAt: new Date('2026-11-13T17:00:00.000Z') }).bytes);
    const cover = sheets.get('Tendencias')!;
    expect(cover.text).toContain('Campaña 2024: Cerrada, versión 1 sellada con F07-POL-01 (mínimo de 3 aportantes por cifra)');
    expect(cover.text).toContain('Campaña 2025: Cerrada, versión 1 sellada con F07-POL-02 (totales sin nombres, sin mínimo de aportantes)');
    expect(cover.text).toContain('Configurada ahora: F07-POL-02');
    expect(cover.text).not.toMatch(/Umbral de privacidad|anónim/i);
    expect(sheets.get('Campañas')!.text).toContain('F07-POL-02 (totales sin nombres, sin mínimo de aportantes)');
  });
});
