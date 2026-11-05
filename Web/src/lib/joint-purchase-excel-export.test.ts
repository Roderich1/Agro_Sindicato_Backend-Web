import { AxiosError, AxiosHeaders } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { collectiveService } from '../services/collective.service';
import { line, proposalWith } from '../test/fixtures';
import type { ProposalEstimationReference } from '../types/estimation';
import { downloadProposalExcel } from './joint-purchase-excel-export';
import { XLSX_MIME } from './joint-purchase-xlsx';

vi.mock('../services/collective.service', () => ({
  collectiveService: { proposal: vi.fn(), proposalEstimationReference: vi.fn() },
}));

/** Enganche de «Descargar Excel» (kind 'proposal'). HTTP simulado, datos sintéticos. */
const DRAFT = proposalWith([line({ product_name: 'Glifosato', quantity_base: '310000', quantity_presentation: '310', contributors: 7 })]);
const REFERENCE: ProposalEstimationReference = {
  contract_version: 1,
  kind: 'PROPOSAL_ESTIMATION_REFERENCE',
  label: 'Estimación del consumo',
  proposal_ref: DRAFT.proposal_ref,
  proposal_generated_at: DRAFT.generated_at,
  target_campaign_ref: DRAFT.campaign.campaign_ref,
  availability: 'AVAILABLE',
  evaluated_at: '2026-11-05T16:00:00.000Z',
  season: null,
  lines: [],
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
  vi.mocked(collectiveService.proposalEstimationReference).mockReset();
  URL.createObjectURL = vi.fn((blob: Blob) => {
    saved.push(blob);
    return 'blob:muestra';
  }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

describe('downloadProposalExcel', () => {
  it('pide el borrador y su referencia por el mismo proposal_ref y descarga el .xlsx', async () => {
    vi.mocked(collectiveService.proposal).mockResolvedValue(DRAFT);
    vi.mocked(collectiveService.proposalEstimationReference).mockResolvedValue(REFERENCE);
    const book = await downloadProposalExcel(DRAFT.proposal_ref);
    expect(collectiveService.proposal).toHaveBeenCalledWith(DRAFT.proposal_ref);
    expect(collectiveService.proposalEstimationReference).toHaveBeenCalledWith(DRAFT.proposal_ref);
    expect(book.includesReference).toBe(true);
    expect(book.fileName).toBe(`propuesta-${DRAFT.proposal_ref}.xlsx`);
    expect(saved).toHaveLength(1);
    expect(saved[0]!.type).toBe(XLSX_MIME);
    expect(saved[0]!.size).toBe(book.bytes.length);
  });

  it('sin referencia (error del servidor) descarga el libro sin esa hoja', async () => {
    vi.mocked(collectiveService.proposal).mockResolvedValue(DRAFT);
    vi.mocked(collectiveService.proposalEstimationReference).mockRejectedValue(httpError(500));
    const book = await downloadProposalExcel(DRAFT.proposal_ref);
    expect(book.includesReference).toBe(false);
    expect(saved).toHaveLength(1);
  });

  it('si el borrador no se puede cargar, rechaza con el error original y no descarga nada', async () => {
    const error = httpError(403);
    vi.mocked(collectiveService.proposal).mockRejectedValue(error);
    vi.mocked(collectiveService.proposalEstimationReference).mockResolvedValue(REFERENCE);
    await expect(downloadProposalExcel(DRAFT.proposal_ref)).rejects.toBe(error);
    expect(saved).toHaveLength(0);
  });

  it('si el servidor devuelve otro borrador, no exporta', async () => {
    vi.mocked(collectiveService.proposal).mockResolvedValue({ ...DRAFT, proposal_ref: 'otro' });
    vi.mocked(collectiveService.proposalEstimationReference).mockResolvedValue(REFERENCE);
    await expect(downloadProposalExcel(DRAFT.proposal_ref)).rejects.toThrow('otro borrador');
    expect(saved).toHaveLength(0);
  });
});
