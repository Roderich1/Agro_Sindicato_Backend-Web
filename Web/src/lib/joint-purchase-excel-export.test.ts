import { AxiosError, AxiosHeaders } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { available, linkViewFor } from '../dev/fixtures/proposal-fixtures';
import { collectiveService } from '../services/collective.service';
import { line, proposalWith } from '../test/fixtures';
import { readXlsx, rowOf } from '../test/xlsx-read';
import type { ProposalEstimationReference } from '../types/estimation';
import { downloadProposalExcel } from './joint-purchase-excel-export';
import { XLSX_MIME } from './joint-purchase-xlsx';

vi.mock('../services/collective.service', () => ({
  collectiveService: { proposal: vi.fn(), estimationLink: vi.fn(), proposalEstimationReference: vi.fn() },
}));

/**
 * Enganche de «Descargar Excel» (kind 'proposal'). HTTP simulado, datos
 * sintéticos. El libro lleva la referencia **fijada** del borrador (E3), pedida
 * al servidor en el momento de exportar.
 */
const DRAFT = proposalWith([line({ product_name: 'Glifosato', quantity_base: '310000', quantity_presentation: '310', contributors: 7 })]);
/** Referencia fijada: 295 L (ejecución fijada al obtenerla). */
const FIXED = linkViewFor(DRAFT, [available('295000.000000')], { update: { available: true, reason: 'NEWER_RUN' } });
/** Lo que diría la estimación más reciente (F12-EST-08): 280 L. No debe usarse. */
const LATEST: ProposalEstimationReference = {
  contract_version: 1,
  kind: 'PROPOSAL_ESTIMATION_REFERENCE',
  label: 'Estimación del consumo',
  proposal_ref: DRAFT.proposal_ref,
  proposal_generated_at: DRAFT.generated_at,
  target_campaign_ref: DRAFT.campaign.campaign_ref,
  availability: 'AVAILABLE',
  evaluated_at: '2026-11-05T16:00:00.000Z',
  season: null,
  lines: [
    {
      position: 0,
      product_ref: DRAFT.lines[0]!.product_ref,
      base_unit: 'ML',
      presentation_unit: 'L',
      absence: null,
      estimation: {
        status: 'ESTIMATED',
        reason_code: null,
        estimate_base: '280000.000000',
        validity: 'CURRENT',
        validity_reason: null,
        method: 'SES_NAIVE',
        run_ref: 'run-mas-reciente',
        generated_at: '2026-11-05T15:00:00.000Z',
        span_length: 4,
        run_relation: 'AFTER_PROPOSAL',
      },
    },
  ],
  notice: 'Referencia separada.',
};

function httpError(status: number) {
  return new AxiosError('fail', 'ERR', undefined, undefined, {
    status,
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: {},
  });
}

let saved: Blob[];
beforeEach(() => {
  saved = [];
  vi.mocked(collectiveService.proposal).mockReset();
  vi.mocked(collectiveService.estimationLink).mockReset();
  vi.mocked(collectiveService.proposalEstimationReference).mockReset().mockResolvedValue(LATEST);
  URL.createObjectURL = vi.fn((blob: Blob) => {
    saved.push(blob);
    return 'blob:muestra';
  }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

async function bookOf(blob: Blob) {
  return readXlsx(new Uint8Array(await blob.arrayBuffer()));
}

describe('downloadProposalExcel', () => {
  it('pide el borrador y su referencia fijada por el mismo proposal_ref y descarga el .xlsx', async () => {
    vi.mocked(collectiveService.proposal).mockResolvedValue(DRAFT);
    vi.mocked(collectiveService.estimationLink).mockResolvedValue(FIXED);
    const book = await downloadProposalExcel(DRAFT.proposal_ref);
    expect(collectiveService.proposal).toHaveBeenCalledWith(DRAFT.proposal_ref);
    expect(collectiveService.estimationLink).toHaveBeenCalledWith(DRAFT.proposal_ref);
    expect(book.includesReference).toBe(true);
    expect(book.referenceState).toBe('LINKED');
    expect(book.fileName).toBe(`propuesta-${DRAFT.proposal_ref}.xlsx`);
    expect(saved).toHaveLength(1);
    expect(saved[0]!.type).toBe(XLSX_MIME);
    expect(saved[0]!.size).toBe(book.bytes.length);
  });

  it('la cifra fijada, no la vigente: con otra estimación más reciente, el libro lleva la fijada y no consulta la vigente', async () => {
    vi.mocked(collectiveService.proposal).mockResolvedValue(DRAFT);
    vi.mocked(collectiveService.estimationLink).mockResolvedValue(FIXED);
    await downloadProposalExcel(DRAFT.proposal_ref);
    expect(collectiveService.proposalEstimationReference).not.toHaveBeenCalled();
    const { sheets } = await bookOf(saved[0]!);
    const ref = sheets.get('Consumo estimado')!;
    expect(ref.cells.get(`B${rowOf(ref, 'Glifosato')}`)).toMatchObject({ type: 'n', value: '295' });
    const all = [...sheets.values()].map((sheet) => sheet.text).join('\n');
    expect(all).not.toMatch(/\b280\b|run-mas-reciente/);
  });

  it('cada exportación vuelve a pedir los datos al servidor (nada de la pantalla en memoria)', async () => {
    vi.mocked(collectiveService.proposal).mockResolvedValue(DRAFT);
    vi.mocked(collectiveService.estimationLink)
      .mockResolvedValueOnce(FIXED)
      .mockResolvedValueOnce(linkViewFor(DRAFT, [{ state: 'RESTRICTED', status: 'ESTIMATED', validity: 'NOT_USABLE', validity_reason: 'SOURCES_WITHDRAWN' }]));
    await downloadProposalExcel(DRAFT.proposal_ref);
    await downloadProposalExcel(DRAFT.proposal_ref);
    expect(collectiveService.proposal).toHaveBeenCalledTimes(2);
    expect(collectiveService.estimationLink).toHaveBeenCalledTimes(2);
    // Entre una y otra la fuente se retiró: la segunda ya no lleva la cifra.
    const second = (await bookOf(saved[1]!)).sheets.get('Consumo estimado')!;
    const r = rowOf(second, 'Glifosato');
    expect(second.cells.has(`B${r}`)).toBe(false);
    expect(second.cells.get(`D${r}`)!.value).toBe('Restringida');
    expect(second.text).not.toMatch(/\b295\b/);
  });

  it('sin referencia (error del servidor que no es de permisos) descarga el libro sin estimación y lo dice', async () => {
    vi.mocked(collectiveService.proposal).mockResolvedValue(DRAFT);
    vi.mocked(collectiveService.estimationLink).mockRejectedValue(httpError(500));
    const book = await downloadProposalExcel(DRAFT.proposal_ref);
    expect(book.includesReference).toBe(false);
    expect(collectiveService.proposalEstimationReference).not.toHaveBeenCalled();
    expect(saved).toHaveLength(1);
    expect((await bookOf(saved[0]!)).sheets.get('Borrador')!.text).toContain('No se usa ninguna otra estimación en su lugar.');
  });

  it.each([401, 403, 404])('un %i en la referencia rechaza la exportación con el error original y no descarga nada', async (status) => {
    const error = httpError(status);
    vi.mocked(collectiveService.proposal).mockResolvedValue(DRAFT);
    vi.mocked(collectiveService.estimationLink).mockRejectedValue(error);
    await expect(downloadProposalExcel(DRAFT.proposal_ref)).rejects.toBe(error);
    expect(saved).toHaveLength(0);
  });

  it('si el borrador no se puede cargar, rechaza con el error original y no descarga nada', async () => {
    const error = httpError(403);
    vi.mocked(collectiveService.proposal).mockRejectedValue(error);
    vi.mocked(collectiveService.estimationLink).mockResolvedValue(FIXED);
    await expect(downloadProposalExcel(DRAFT.proposal_ref)).rejects.toBe(error);
    expect(saved).toHaveLength(0);
  });

  it('si el servidor devuelve otro borrador, no exporta', async () => {
    vi.mocked(collectiveService.proposal).mockResolvedValue({ ...DRAFT, proposal_ref: 'otro' });
    vi.mocked(collectiveService.estimationLink).mockResolvedValue(FIXED);
    await expect(downloadProposalExcel(DRAFT.proposal_ref)).rejects.toThrow('otro borrador');
    expect(saved).toHaveLength(0);
  });
});
