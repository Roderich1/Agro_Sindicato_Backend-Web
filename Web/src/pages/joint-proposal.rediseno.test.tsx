import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BLOCKER_MESSAGE,
  comparableWith,
  demo,
  empty,
  linkViewFor,
  one,
  worst,
  type ProposalFixture,
} from '../dev/fixtures/proposal-fixtures';
import { collectiveService } from '../services/collective.service';
import { campaignsService } from '../services/campaigns.service';
import { CAMPAIGN, renderAt } from '../test/render';
import type { EstimationLinkView } from '../types/estimation-link';
import { JointProposalPage } from './joint-proposal.page';

vi.mock('../services/collective.service', () => ({
  collectiveService: {
    proposals: vi.fn(),
    generateProposal: vi.fn(),
    proposal: vi.fn(),
    proposalCsv: vi.fn(),
    proposalEstimationReference: vi.fn(),
    estimationLink: vi.fn(),
    prepareEstimationLink: vi.fn(),
    clearEstimationLink: vi.fn(),
    proposalSelection: vi.fn(),
    saveProposalSelection: vi.fn(),
  },
}));
vi.mock('../services/campaigns.service', () => ({ campaignsService: { list: vi.fn() } }));
vi.mock('../services/estimation.service', () => ({ estimationService: { run: vi.fn() } }));

/** Rediseño, sesión C (2026-11-10): fixtures sintéticos demo, worst, empty y one. E3: la referencia fijada. */
const PATH = `/colectivo/propuestas?campaign=${CAMPAIGN.id}`;
const OTHER = { ...CAMPAIGN, id: '22222222-2222-4222-8222-222222222222', name: 'Otra campaña sintética', isActive: false };

function serve(fixture: ProposalFixture, link: EstimationLinkView | null = fixture.link) {
  vi.mocked(collectiveService.proposals).mockResolvedValue(fixture.history);
  vi.mocked(collectiveService.proposal).mockImplementation(async () => fixture.proposal!);
  vi.mocked(collectiveService.estimationLink).mockImplementation(async () => link!);
  vi.mocked(collectiveService.proposalSelection).mockImplementation(async () => fixture.selection!);
}

/** La vista del fixture con algunas líneas declaradas comparables por el servidor. */
function withComparable(fixture: ProposalFixture, comparisons: Record<number, ReturnType<typeof comparableWith>>): EstimationLinkView {
  const view = fixture.link!;
  return { ...view, lines: view.lines.map((line) => (comparisons[line.position] ? { ...line, comparison: comparisons[line.position]! } : line)) };
}

const row = (name: string, unit: 'ML' | 'G' = 'ML') => screen.getByTestId(`line-${name}-${unit}`);
const reference = (name: string, unit: 'ML' | 'G' = 'ML') => within(row(name, unit)).getByTestId('reference');

describe('Necesidades y propuestas (rediseño)', () => {
  beforeEach(() => {
    vi.mocked(campaignsService.list).mockResolvedValue([CAMPAIGN, OTHER]);
    vi.mocked(collectiveService.generateProposal).mockReset();
    vi.mocked(collectiveService.proposalCsv).mockReset();
    vi.mocked(collectiveService.prepareEstimationLink).mockReset();
    vi.mocked(collectiveService.clearEstimationLink).mockReset();
    vi.mocked(collectiveService.saveProposalSelection).mockReset();
  });

  it('al entrar, al cambiar de campaña y al volver no hace ningún POST: sólo consulta', async () => {
    serve(demo);
    renderAt(<JointProposalPage />, { path: PATH });
    await screen.findByText(`Borrador · ${demo.proposal!.campaign.name}`);
    fireEvent.change(screen.getByLabelText('Campaña'), { target: { value: OTHER.id } });
    await waitFor(() => expect(collectiveService.proposals).toHaveBeenCalledWith(OTHER.id));
    fireEvent.change(screen.getByLabelText('Campaña'), { target: { value: CAMPAIGN.id } });
    await screen.findByText(`Borrador · ${demo.proposal!.campaign.name}`);
    await screen.findByText('295 L');
    expect(collectiveService.generateProposal).not.toHaveBeenCalled();
    expect(collectiveService.proposalCsv).not.toHaveBeenCalled();
    // E3-D2: ni obtener, ni quitar, ni guardar la selección sin un botón.
    expect(collectiveService.prepareEstimationLink).not.toHaveBeenCalled();
    expect(collectiveService.clearEstimationLink).not.toHaveBeenCalled();
    expect(collectiveService.saveProposalSelection).not.toHaveBeenCalled();
  });

  it('rótulo E3 y, con los datos de hoy, sin diferencia: el motivo del servidor una sola vez, sin porcentaje', async () => {
    serve(demo);
    renderAt(<JointProposalPage />, { path: PATH });
    await screen.findByText('295 L');
    // E3 §8: Producto · Necesidad declarada · Consumo estimado (antes «Estimación del consumo (referencia)», F12 §7.1).
    expect(screen.getByTestId('reference-header').textContent).toBe('Consumo estimado');
    expect([...screen.getByRole('table', { name: 'Líneas del borrador' }).querySelectorAll('thead th')].map((th) => th.textContent)).toEqual([
      'Producto',
      'Necesidad declarada',
      'Consumo estimado',
    ]);
    // El detalle abre el contenedor «Histórico y estimaciones» en la vista de la estimación, con la misma campaña.
    expect(screen.getByRole('link', { name: 'Detalle en «Estimación del consumo»' }).getAttribute('href')).toBe(
      `/colectivo/historico?vista=estimacion&campaign=${demo.proposal!.campaign.campaign_ref}`,
    );
    // Antes la Web restaba en el navegador («15 L menor», «2,5005 KG mayor»): ahora el servidor dice que no es comparable.
    expect(within(reference('Glifosato')).queryByTestId('reference-difference')).toBeNull();
    expect(within(reference('Urea', 'G')).queryByTestId('reference-difference')).toBeNull();
    expect(document.body.textContent).not.toMatch(/15 L|2,5005 KG/);
    // El motivo (población no comprobada) se dice una vez, no en cada fila.
    expect(screen.getByTestId('comparison-note').textContent).toBe(BLOCKER_MESSAGE.POPULATION_NOT_VERIFIED);
    expect(screen.queryAllByTestId('comparison-message')).toHaveLength(0);
    // E3-P1 (1b): la nota remite al alcance de cada cifra, y se dice una sola vez.
    expect(BLOCKER_MESSAGE.POPULATION_NOT_VERIFIED).toBe(
      'No se calcula la diferencia: no se puede comprobar que la necesidad y la estimación provengan de los mismos agricultores (vea el alcance de cada cifra).',
    );
    expect(document.body.textContent!.split('provengan de los mismos agricultores').length - 1).toBe(1);
    // El alcance de la estimación va en su celda: mínimo ≠ máximo y mínimo = máximo.
    expect(within(reference('Glifosato')).getByTestId('estimate-scope').textContent).toBe('Cifras de 4 a 6 agricultores por campaña (11 campañas)');
    expect(within(reference('Urea', 'G')).getByTestId('estimate-scope').textContent).toBe('Cifras de 5 agricultores por campaña (8 campañas)');
    // Sin cifra (datos insuficientes, sin resultado): sin alcance.
    expect(within(reference('Cipermetrina')).queryByTestId('estimate-scope')).toBeNull();
    expect(within(reference('Amina')).queryByTestId('estimate-scope')).toBeNull();
    // Datos insuficientes y necesidad oculta: no se compara.
    expect(within(reference('Cipermetrina')).queryByTestId('reference-difference')).toBeNull();
    expect(within(reference('Amina')).queryByTestId('reference-difference')).toBeNull();
    // La necesidad no cambia y no hay sumas ni porcentajes.
    expect(within(row('Glifosato')).getByTestId('need').textContent).toMatch(/310 L/);
    expect(document.body.textContent).not.toMatch(/605|%/);
    expect(screen.getByTestId('lines-summary').textContent).toMatch(/4 productos en el borrador: 3 con cifra publicada y 1 sin cifra/);
    // Los aportantes siguen a la vista, dentro de la necesidad.
    expect(within(row('Glifosato')).getByTestId('contributors').textContent).toBe('7 aportantes');
    expect(within(row('Amina')).getByTestId('contributors').textContent).toBe('Aportantes no revelados');
  });

  it('cuando el servidor declara comparable una línea, escribe su texto tal cual en esa línea y en ninguna otra', async () => {
    serve(
      demo,
      withComparable(demo, {
        0: comparableWith({ difference_base: '15000.000000', difference_percent: '5.0847', direction: 'ABOVE', observation: 'La necesidad declarada supera en 15 L la estimación de consumo para el mismo período y alcance.' }),
        2: comparableWith({ difference_base: '-2500.500000', difference_percent: '-9.0900', direction: 'BELOW', observation: 'La necesidad declarada es inferior en 2,501 KG a la estimación de consumo para el mismo período y alcance.' }),
      }),
    );
    renderAt(<JointProposalPage />, { path: PATH });
    await screen.findByText('295 L');
    expect(within(reference('Glifosato')).getByTestId('reference-difference').textContent).toMatch(
      /^La necesidad declarada supera en 15 L la estimación de consumo para el mismo período y alcance\. Diferencia: \+5\s?% respecto de la estimación\. Sólo informativo/,
    );
    // El texto es el del servidor, redondeado allí (no la resta exacta del navegador, 2,5005 KG).
    expect(within(reference('Urea', 'G')).getByTestId('reference-difference').textContent).toMatch(/es inferior en 2,501 KG a la estimación/);
    expect(document.body.textContent).not.toMatch(/2,5005/);
    // E3 §5 (decisión del autor): con cifras comparables, también la diferencia porcentual del servidor, redondeada
    // sólo al presentar (formateador del rediseño, sin decimales); nunca la cifra cruda ni sumas.
    expect(within(reference('Glifosato')).getByTestId('reference-difference').textContent).toMatch(/Diferencia: \+5\s?% respecto de la estimación\./);
    expect(within(reference('Urea', 'G')).getByTestId('reference-difference').textContent).toMatch(/Diferencia: −9\s?% respecto de la estimación\./);
    expect(document.body.textContent).not.toMatch(/5,0847|5\.0847|605/);
    expect(within(reference('Cipermetrina')).queryByTestId('reference-difference')).toBeNull();
    // Ninguna línea comparable queda pendiente: no se repite el motivo de población.
    expect(screen.queryByTestId('comparison-note')).toBeNull();
  });

  it('peor caso: nombres largos, cifras grandes y pequeñas, retiradas, sustituidas y referencias no comparables', async () => {
    serve(worst);
    renderAt(<JointProposalPage />, { path: PATH });
    const long = 'Herbicida sistémico de amplio espectro para barbecho químico 480 g/L';
    await waitFor(() => expect(within(row(long)).getByTestId('need').textContent).toMatch(/123\.456\.789,012 L/));
    // La cifra grande de la estimación se presenta redondeada a la décima (E3 §5: sólo al presentar), con la exacta
    // en el título, y sin restarla a la necesidad.
    await waitFor(() => expect(within(reference(long)).getByTestId('estimate-figure').textContent).toBe('≈ 123.456.800 L'));
    expect(within(reference(long)).getByTestId('estimate-figure').getAttribute('title')).toMatch(/123\.456\.800,00025 L/);
    expect(within(reference(long)).queryByTestId('reference-difference')).toBeNull();
    expect(within(row('Urea', 'G')).getByTestId('need').textContent).toMatch(/0,025 KG/);
    // No vigente, sin resultado, datos insuficientes, necesidad oculta, error, retirada y referencia cero: sin diferencia.
    for (const [name, unit] of [
      [long, 'ML'],
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
    expect(reference('Urea', 'G').textContent).toMatch(/Desactualizada/);
    // Menos de 1 KG: en gramos con una décima (no «≈ 0 KG»); la exacta, en el título.
    expect(within(reference('Urea', 'G')).getByTestId('estimate-figure').textContent).toBe('≈ 30,1 g');
    expect(within(reference('Urea', 'G')).getByTestId('estimate-figure').getAttribute('title')).toMatch(/0,030123456 KG/);
    expect(reference('Glifosato').textContent).toMatch(/Restringida/);
    expect(reference('Glifosato').textContent).toMatch(/ya no se divulga/);
    expect(reference('Glifosato').textContent).not.toMatch(/\d[\d.,]* L\b/);
    // Antes: «política de divulgación no está aprobada» (F12-EST-08 por línea). En E3 la política pendiente
    // restringe toda la referencia; dentro de una referencia fijada, esta línea es un error de cálculo.
    expect(reference('Coadyuvante siliconado no iónico').textContent).toMatch(/Error: sin cifra/);
    expect(reference('Coadyuvante siliconado no iónico').textContent).toMatch(/El cálculo de este producto falló/);
    expect(reference('GLIFÓSATO').textContent).toMatch(/0 L/);
    expect(row('Fungicida protectante a base de mancozeb 80 % WP (polvo mojable)', 'G').textContent).toMatch(/Genere un borrador nuevo/);
    expect(row('Insecticida piretroide Cipermetrina 25 % EC').textContent).toMatch(/Sustituido/);
    // Dos líneas con las dos cifras (la grande y la de estimación cero) comparten el motivo: una sola vez.
    expect(screen.getByTestId('comparison-note').textContent).toBe(BLOCKER_MESSAGE.POPULATION_NOT_VERIFIED);
    // La franja ofrece la actualización explícita, con su motivo.
    expect(screen.getByTestId('link-detail').textContent).toMatch(/Alguna línea quedó desactualizada/);
    expect(screen.getByRole('button', { name: 'Actualizar referencia' })).toBeTruthy();
    // Huella oculta en el borrador mostrado y en el historial; plurales correctos.
    expect(screen.getAllByText('huella oculta').length).toBeGreaterThanOrEqual(2);
    const history = screen.getByLabelText('Historial de borradores');
    expect(history.textContent).toMatch(/8 líneas/);
    expect(history.textContent).toMatch(/1 línea(?!s)/);
    expect(history.textContent).toMatch(/sin líneas/);
    expect(collectiveService.generateProposal).not.toHaveBeenCalled();
    expect(collectiveService.prepareEstimationLink).not.toHaveBeenCalled();
  });

  it('sin borradores: lo dice sin cifras y no genera ninguno', async () => {
    serve(empty);
    renderAt(<JointProposalPage />, { path: PATH });
    expect((await screen.findAllByText('Todavía no hay borradores para esta campaña')).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText('Detalle del borrador')).toBeNull();
    expect(collectiveService.proposal).not.toHaveBeenCalled();
    expect(collectiveService.generateProposal).not.toHaveBeenCalled();
    expect(collectiveService.estimationLink).not.toHaveBeenCalled();
  });

  it('un solo borrador con una sola línea: singulares y «coincide» cuando el servidor la declara comparable', async () => {
    serve(one, withComparable(one, { 0: comparableWith({ direction: 'EQUAL', observation: 'La necesidad declarada coincide con la estimación de consumo para el mismo período y alcance.' }) }));
    renderAt(<JointProposalPage />, { path: PATH });
    await waitFor(() => expect(within(reference('Urea', 'G')).getByTestId('reference-difference').textContent).toMatch(/coincide con la estimación de consumo/));
    expect(screen.getByTestId('lines-summary').textContent).toMatch(/^1 producto en el borrador: 1 con cifra publicada\./);
    expect(screen.getByLabelText('Historial de borradores').textContent).toMatch(/\(1 borrador\)/);
    expect(screen.getByRole('button', { name: 'Preparar convocatoria (0 productos)' })).toBeTruthy();
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

/**
 * Antes: pruebas de `compareNeedWithEstimate` (lib/estimation-compare, borrada en E3). La resta exacta,
 * la estimación cero y la cifra ausente las prueba ahora el servidor (Back `proposal-link.spec`); aquí se
 * comprueba que la Web no compara por su cuenta en ninguno de esos casos.
 */
describe('La comparación es la del servidor', () => {
  it('sin `comparable`, ninguna diferencia, aunque las cifras se pudieran restar (vigente > 0, cero, ausente, desactualizada, otra unidad)', async () => {
    const proposal = demo.proposal!;
    const view = linkViewFor(proposal, [
      { state: 'AVAILABLE', status: 'ESTIMATED', estimate_base: '295000.000000', validity: 'CURRENT', comparison: { comparable: false, blockers: ['UNIT_MISMATCH'], message: BLOCKER_MESSAGE.UNIT_MISMATCH, difference: null } },
      { state: 'OUTDATED', status: 'ESTIMATED', estimate_base: '48000.000000', validity: 'SUPERSEDED', validity_reason: 'LATER_RUN' },
      { state: 'AVAILABLE', status: 'ESTIMATED', estimate_base: '0.000000', validity: 'CURRENT' },
      { state: 'AVAILABLE', status: 'ESTIMATED', estimate_base: '12000.000000', validity: 'CURRENT' },
    ]);
    serve(demo, view);
    renderAt(<JointProposalPage />, { path: PATH });
    await screen.findByText('295 L');
    expect(screen.queryAllByTestId('reference-difference')).toHaveLength(0);
    // Mensajes distintos entre las líneas que tienen las dos cifras: cada una lleva el suyo.
    expect(screen.queryByTestId('comparison-note')).toBeNull();
    expect(within(reference('Glifosato')).getByTestId('comparison-message').textContent).toBe(BLOCKER_MESSAGE.UNIT_MISMATCH);
    expect(within(reference('Urea', 'G')).getByTestId('comparison-message').textContent).toBe(BLOCKER_MESSAGE.POPULATION_NOT_VERIFIED);
    // La desactualizada lleva su cifra rotulada, sin diferencia ni mensaje de comparación.
    expect(reference('Cipermetrina').textContent).toMatch(/48 L/);
    expect(reference('Cipermetrina').textContent).toMatch(/Desactualizada/);
    expect(within(reference('Cipermetrina')).queryByTestId('comparison-message')).toBeNull();
    // Necesidad oculta: sin mensaje de comparación (la celda ya lo explica).
    expect(within(reference('Amina')).queryByTestId('comparison-message')).toBeNull();
    expect(document.body.textContent).not.toMatch(/mayor que la necesidad|menor que la necesidad|%/);
  });

  it('estimación cero comparable: el texto del servidor, sin porcentaje (no definido)', async () => {
    const proposal = demo.proposal!;
    serve(
      demo,
      linkViewFor(proposal, [
        {
          state: 'AVAILABLE',
          status: 'ESTIMATED',
          estimate_base: '0.000000',
          validity: 'CURRENT',
          comparison: comparableWith({ difference_base: '310000.000000', difference_percent: null, percent_undefined: 'ESTIMATE_ZERO', direction: 'ABOVE', observation: 'La necesidad declarada supera en 310 L la estimación de consumo para el mismo período y alcance.' }),
        },
      ]),
    );
    renderAt(<JointProposalPage />, { path: PATH });
    const difference = await waitFor(() => within(reference('Glifosato')).getByTestId('reference-difference'));
    expect(difference.textContent).toMatch(/supera en 310 L la estimación/);
    expect(reference('Glifosato').textContent).toMatch(/0 L/);
    // Estimación cero: el porcentaje no está definido y se dice; nunca un número.
    expect(difference.textContent).toMatch(/Porcentaje no definido: la estimación es cero\./);
    expect(document.body.textContent).not.toMatch(/\d\s?%|Infinity|NaN|recomendad|excesiv/i);
  });
});
