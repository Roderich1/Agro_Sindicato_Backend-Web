import { beforeEach, describe, expect, it, vi } from 'vitest';
import { collectiveService } from '../services/collective.service';
import { estimationService } from '../services/estimation.service';
import { cell, line, proposalWith, summaryWith, trendsWith } from '../test/fixtures';
import { readXlsx } from '../test/xlsx-read';
import { downloadExcel, excelExport } from './exports';
import { XLSX_MIME } from './xlsx-common';

vi.mock('../services/collective.service', () => ({
  collectiveService: { summary: vi.fn(), trends: vi.fn(), proposal: vi.fn(), estimationLink: vi.fn() },
}));
vi.mock('../services/estimation.service', () => ({ estimationService: { results: vi.fn(), run: vi.fn() } }));

/** «Descargar Excel» de cada vista: mismos GET que la pantalla y un .xlsx con la identidad de Agrocuentas. */
let saved: Blob[];
beforeEach(() => {
  saved = [];
  URL.createObjectURL = vi.fn((blob: Blob) => {
    saved.push(blob);
    return 'blob:muestra';
  }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

async function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

describe('excelExport', () => {
  it('está disponible en las cuatro vistas', () => {
    for (const kind of ['summary', 'proposal', 'trends', 'estimation'] as const) expect(excelExport.supports(kind)).toBe(true);
    expect(excelExport.download).toBe(downloadExcel);
  });

  it('resumen: pide la campaña y descarga el libro', async () => {
    vi.mocked(collectiveService.summary).mockResolvedValue(summaryWith([cell({ product_name: 'Urea', base_unit: 'G', total_base: '25000', total_presentation: '25', contributors: 3 })]));
    await downloadExcel('summary', 'campaign-1');
    expect(collectiveService.summary).toHaveBeenCalledWith('campaign-1');
    expect(saved).toHaveLength(1);
    expect(saved[0]!.type).toBe(XLSX_MIME);
    const { sheetNames } = readXlsx(await bytesOf(saved[0]!));
    expect(sheetNames).toEqual(['Resumen', 'Necesidad declarada', 'Consumo publicado']);
  });

  it('propuesta: pide el borrador y su referencia fijada por la referencia del borrador', async () => {
    const draft = proposalWith([line({ product_name: 'Urea', base_unit: 'G', quantity_base: '25000', quantity_presentation: '25', contributors: 3 })]);
    vi.mocked(collectiveService.proposal).mockResolvedValue(draft);
    vi.mocked(collectiveService.estimationLink).mockRejectedValue(new Error('sin referencia'));
    await downloadExcel('proposal', draft.proposal_ref);
    expect(collectiveService.proposal).toHaveBeenCalledWith(draft.proposal_ref);
    expect(collectiveService.estimationLink).toHaveBeenCalledWith(draft.proposal_ref);
    expect(saved).toHaveLength(1);
  });

  it('tendencias: pide el tipo elegido y rechaza uno desconocido', async () => {
    vi.mocked(collectiveService.trends).mockResolvedValue(trendsWith([]));
    await downloadExcel('trends', 'DECLARED_NEED');
    expect(collectiveService.trends).toHaveBeenCalledWith('DECLARED_NEED');
    expect(saved).toHaveLength(1);
    await expect(downloadExcel('trends', 'OTRA_COSA')).rejects.toThrow('no reconocido');
    expect(saved).toHaveLength(1);
  });

  it('estimación: pide los resultados y el detalle de cada ejecución citada', async () => {
    vi.mocked(estimationService.results).mockResolvedValue({
      contract_version: 1,
      profile: 'INSTITUTIONAL',
      scope: { tenant_ref: 't' },
      target: { campaign_ref: 'c', name: 'Objetivo', status: 'ABIERTA', start_date: '2026-10-14', end_date: null },
      season: null,
      evaluated_at: '2026-11-05T18:00:00.000Z',
      results: [],
      notice: 'n',
    });
    await downloadExcel('estimation', 'c');
    expect(estimationService.results).toHaveBeenCalledWith('c');
    expect(estimationService.run).not.toHaveBeenCalled();
    expect(saved).toHaveLength(1);
  });

  it('si la petición falla, no descarga nada y propaga el error', async () => {
    const error = new Error('403');
    vi.mocked(collectiveService.summary).mockRejectedValue(error);
    await expect(downloadExcel('summary', 'campaign-1')).rejects.toBe(error);
    expect(saved).toHaveLength(0);
  });
});
