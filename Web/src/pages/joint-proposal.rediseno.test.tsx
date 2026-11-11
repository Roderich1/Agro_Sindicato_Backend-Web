import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { demo, empty, one, worst, type ProposalFixture } from '../dev/fixtures/proposal-fixtures';
import { compareNeedWithEstimate } from '../lib/estimation-compare';
import { collectiveService } from '../services/collective.service';
import { campaignsService } from '../services/campaigns.service';
import { CAMPAIGN, renderAt } from '../test/render';
import { JointProposalPage } from './joint-proposal.page';

vi.mock('../services/collective.service', () => ({
  collectiveService: { proposals: vi.fn(), generateProposal: vi.fn(), proposal: vi.fn(), proposalCsv: vi.fn(), proposalEstimationReference: vi.fn() },
}));
vi.mock('../services/campaigns.service', () => ({ campaignsService: { list: vi.fn() } }));

/** Rediseño, sesión C (2026-11-10): fixtures sintéticos demo, worst, empty y one. */
const PATH = `/colectivo/propuestas?campaign=${CAMPAIGN.id}`;
const OTHER = { ...CAMPAIGN, id: '22222222-2222-4222-8222-222222222222', name: 'Otra campaña sintética', isActive: false };

function serve(fixture: ProposalFixture) {
  vi.mocked(collectiveService.proposals).mockResolvedValue(fixture.history);
  vi.mocked(collectiveService.proposal).mockImplementation(async () => fixture.proposal!);
  vi.mocked(collectiveService.proposalEstimationReference).mockImplementation(async () => fixture.reference!);
}

const row = (name: string, unit: 'ML' | 'G' = 'ML') => screen.getByTestId(`line-${name}-${unit}`);
const reference = (name: string, unit: 'ML' | 'G' = 'ML') => within(row(name, unit)).getByTestId('reference');

describe('Necesidades y propuestas (rediseño)', () => {
  beforeEach(() => {
    vi.mocked(campaignsService.list).mockResolvedValue([CAMPAIGN, OTHER]);
    vi.mocked(collectiveService.generateProposal).mockReset();
    vi.mocked(collectiveService.proposalCsv).mockReset();
  });

  it('al entrar, al cambiar de campaña y al volver no hace ningún POST: sólo consulta', async () => {
    serve(demo);
    renderAt(<JointProposalPage />, { path: PATH });
    await screen.findByText(`Borrador · ${demo.proposal!.campaign.name}`);
    fireEvent.change(screen.getByLabelText('Campaña'), { target: { value: OTHER.id } });
    await waitFor(() => expect(collectiveService.proposals).toHaveBeenCalledWith(OTHER.id));
    fireEvent.change(screen.getByLabelText('Campaña'), { target: { value: CAMPAIGN.id } });
    await screen.findByText(`Borrador · ${demo.proposal!.campaign.name}`);
    expect(collectiveService.generateProposal).not.toHaveBeenCalled();
    expect(collectiveService.proposalCsv).not.toHaveBeenCalled();
  });

  it('rótulo del contrato y diferencia sólo en la línea comparable, en la misma unidad y sin porcentaje', async () => {
    serve(demo);
    renderAt(<JointProposalPage />, { path: PATH });
    await screen.findByText('295 L');
    expect(screen.getByTestId('reference-header').textContent).toBe('Estimación del consumo (referencia)');
    // El detalle abre el contenedor «Histórico y estimaciones» en la vista de la estimación, con la misma campaña.
    expect(screen.getByRole('link', { name: 'Detalle en «Estimación del consumo»' }).getAttribute('href')).toBe(
      `/colectivo/historico?vista=estimacion&campaign=${demo.proposal!.campaign.campaign_ref}`,
    );
    expect(within(reference('Glifosato')).getByTestId('reference-difference').textContent).toMatch(
      /^La estimación es 15 L menor que la necesidad declarada\./,
    );
    expect(within(reference('Urea', 'G')).getByTestId('reference-difference').textContent).toMatch(/2,5005 KG mayor/);
    // Datos insuficientes y necesidad oculta: no se compara.
    expect(within(reference('Cipermetrina')).queryByTestId('reference-difference')).toBeNull();
    expect(within(reference('Amina')).queryByTestId('reference-difference')).toBeNull();
    // La necesidad no cambia y no hay sumas ni porcentajes.
    expect(within(row('Glifosato')).getByTestId('need').textContent).toMatch(/310 L/);
    expect(document.body.textContent).not.toMatch(/605|%/);
    expect(screen.getByTestId('lines-summary').textContent).toMatch(/4 productos en el borrador: 3 con cifra publicada y 1 sin cifra/);
  });

  it('peor caso: nombres largos, cifras grandes y pequeñas, retiradas, sustituidas y referencias no comparables', async () => {
    serve(worst);
    renderAt(<JointProposalPage />, { path: PATH });
    const long = 'Herbicida sistémico de amplio espectro para barbecho químico 480 g/L';
    await waitFor(() => expect(within(row(long)).getByTestId('need').textContent).toMatch(/123\.456\.789,012 L/));
    // 123456800000,25 mL − 123456789012 mL = 10988,25 mL, exacto (más allá de 2^53 no se pierde nada).
    await waitFor(() => expect(within(reference(long)).getByTestId('reference-difference').textContent).toMatch(/10,98825 L mayor/));
    expect(within(row('Urea', 'G')).getByTestId('need').textContent).toMatch(/0,025 KG/);
    // No vigente, sin resultado, datos insuficientes, necesidad oculta, política pendiente, retirada y referencia cero: sin diferencia.
    for (const [name, unit] of [
      ['Urea', 'G'],
      ['Fungicida protectante a base de mancozeb 80 % WP (polvo mojable)', 'G'],
      ['Insecticida piretroide Cipermetrina 25 % EC', 'ML'],
      ['Amina', 'ML'],
      ['Coadyuvante siliconado no iónico', 'ML'],
      ['Glifosato', 'ML'],
      ['GLIFÓSATO', 'ML'],
    ] as const) {
      expect(within(reference(name, unit)).queryByTestId('reference-difference')).toBeNull();
      expect(reference(name, unit).textContent).not.toMatch(/%/);
    }
    expect(reference('Glifosato').textContent).toMatch(/Cifra retirada/);
    expect(reference('Glifosato').textContent).not.toMatch(/\d[\d.,]* L\b/);
    expect(reference('Coadyuvante siliconado no iónico').textContent).toMatch(/política de divulgación no está aprobada/);
    expect(row('Fungicida protectante a base de mancozeb 80 % WP (polvo mojable)', 'G').textContent).toMatch(/Genere un borrador nuevo/);
    expect(row('Insecticida piretroide Cipermetrina 25 % EC').textContent).toMatch(/Sustituido/);
    // Huella oculta en el borrador mostrado y en el historial; plurales correctos.
    expect(screen.getAllByText('huella oculta').length).toBeGreaterThanOrEqual(2);
    const history = screen.getByLabelText('Historial de borradores');
    expect(history.textContent).toMatch(/8 líneas/);
    expect(history.textContent).toMatch(/1 línea(?!s)/);
    expect(history.textContent).toMatch(/sin líneas/);
    expect(collectiveService.generateProposal).not.toHaveBeenCalled();
  });

  it('sin borradores: lo dice sin cifras y no genera ninguno', async () => {
    serve(empty);
    renderAt(<JointProposalPage />, { path: PATH });
    expect((await screen.findAllByText('Todavía no hay borradores para esta campaña')).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText('Detalle del borrador')).toBeNull();
    expect(collectiveService.proposal).not.toHaveBeenCalled();
    expect(collectiveService.generateProposal).not.toHaveBeenCalled();
  });

  it('un solo borrador con una sola línea: singulares y «coincide»', async () => {
    serve(one);
    renderAt(<JointProposalPage />, { path: PATH });
    await waitFor(() => expect(within(reference('Urea', 'G')).getByTestId('reference-difference').textContent).toMatch(/coincide con la necesidad declarada/));
    expect(screen.getByTestId('lines-summary').textContent).toMatch(/^1 producto en el borrador: 1 con cifra publicada\./);
    expect(screen.getByLabelText('Historial de borradores').textContent).toMatch(/\(1 borrador\)/);
  });

  it('un 403 al cargar el historial es «sin permiso», sin cifras', async () => {
    const { AxiosError, AxiosHeaders } = await import('axios');
    const error = new AxiosError('forbidden', '403');
    error.response = { status: 403, data: {}, statusText: '', headers: {}, config: { headers: new AxiosHeaders() } };
    vi.mocked(collectiveService.proposals).mockRejectedValue(error);
    renderAt(<JointProposalPage />, { path: PATH });
    const problem = await screen.findByTestId('proposal-problem');
    expect(problem.getAttribute('data-state')).toBe('forbidden');
    expect(problem.textContent).toMatch(/Su rol no tiene acceso/);
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull();
  });
});

describe('compareNeedWithEstimate', () => {
  const need = demo.proposal!.lines[0]!;
  const ref = demo.reference!.lines[0]!;
  const withEstimate = (estimate: string | null, overrides = {}) => ({ ...ref, estimation: { ...ref.estimation!, estimate_base: estimate, ...overrides } });

  it('sólo con estimación vigente, mayor que cero y necesidad publicada', () => {
    expect(compareNeedWithEstimate(need, ref)).toEqual({ kind: 'smaller', difference: '15 L' });
    expect(compareNeedWithEstimate(need, withEstimate('0.000000'))).toBeNull();
    expect(compareNeedWithEstimate(need, withEstimate(null))).toBeNull();
    expect(compareNeedWithEstimate(need, withEstimate('295000.000000', { validity: 'OUTDATED', validity_reason: 'SOURCES_CHANGED' }))).toBeNull();
    expect(compareNeedWithEstimate(need, withEstimate('295000.000000', { status: 'INSUFFICIENT_DATA' }))).toBeNull();
    expect(compareNeedWithEstimate({ ...need, status: 'SUPPRESSED_UNDER_THRESHOLD', quantity_base: null }, ref)).toBeNull();
    expect(compareNeedWithEstimate(need, { ...ref, base_unit: 'G', presentation_unit: 'KG' })).toBeNull();
    expect(compareNeedWithEstimate(need, { ...ref, absence: 'NO_RESULT' })).toBeNull();
    expect(compareNeedWithEstimate(need, null)).toBeNull();
  });

  it('exacta con cifras grandes y decimales, sin Number', () => {
    const big = { ...need, quantity_base: '9007199254740993', quantity_presentation: '9007199254740.993' };
    expect(compareNeedWithEstimate(big, withEstimate('9007199254740993.000001'))).toEqual({ kind: 'greater', difference: '0,000000001 L' });
    expect(compareNeedWithEstimate(big, withEstimate('9007199254740993'))).toEqual({ kind: 'equal' });
  });
});
