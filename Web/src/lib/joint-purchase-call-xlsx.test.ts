import { AxiosError, AxiosHeaders } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { jointPurchaseCallsService } from '../services/joint-purchase-calls.service';
import { readXlsx, rowOf } from '../test/xlsx-read';
import type {
  JointPurchaseCallClosing,
  JointPurchaseCallDetail,
  JointPurchaseCallParticipants,
} from '../types/joint-purchase-calls';
import { downloadCallExcel, XLSX_MIME } from './joint-purchase-call-xlsx';

vi.mock('../services/joint-purchase-calls.service', () => ({
  jointPurchaseCallsService: {
    get: vi.fn(),
    closing: vi.fn(),
    participants: vi.fn(),
  },
}));

const ACTOR = { user_ref: 'u-dir-1', name: 'Directiva sintética' };

const OPEN_CALL: JointPurchaseCallDetail = {
  contractVersion: 2,
  call_id: 'call-1',
  name: 'Herbicidas de la siembra',
  status: 'OPEN',
  campaign: { campaign_ref: 'c-1', name: 'Campaña 2026', status: 'ABIERTA' },
  deadline_at: '2026-11-20T23:00:00.000Z',
  opened_at: '2026-11-13T15:00:00.000Z',
  closed_at: null,
  cancelled_at: null,
  cancel_reason: null,
  created_at: '2026-11-13T14:00:00.000Z',
  updated_at: '2026-11-13T15:00:00.000Z',
  server_time: '2026-11-13T16:00:00.000Z',
  responsible: { ...ACTOR, role: 'DIRECTIVA', eligible: true, version: 1 },
  created_by: ACTOR,
  opened_by: ACTOR,
  cancelled_by: null,
  source_proposal_ref: null,
  participant_count: 3,
  totals_source: 'LIVE',
  can_view_participants: false,
  is_responsible: true,
  can_manage: true,
  can_cancel_or_close: true,
  delegations_suspended: false,
  my_grants: ['MANAGE'],
  collaborator_count: 0,
  can_substitute_responsible: false,
  pending_delegation_reviews: 0,
  pending_consent_count: 1,
  responsible_changes: [],
  products: [
    {
      position: 0,
      product_ref: 'p-1',
      name: 'Glifosato 48 SL',
      unit: 'L',
      base_unit: 'ML',
      is_active: true,
      reference: null,
      totals: { participant_count: 2, total_quantity_base: '45000', visibility: 'VISIBLE', totals_basis: 'ROLE_CONSENT' },
    },
    {
      position: 1,
      product_ref: 'p-2',
      name: 'Urea granulada',
      unit: 'KG',
      base_unit: 'G',
      is_active: true,
      reference: null,
      totals: { participant_count: 1, total_quantity_base: null, visibility: 'PENDING_CONSENT', totals_basis: null },
    },
  ],
  origin: null,
  origin_differs_from_current: false,
  history: [],
};

const PARTICIPANTS_ADMIN: JointPurchaseCallParticipants = {
  contractVersion: 2,
  call_id: 'call-1',
  status: 'OPEN',
  provisional: true,
  notice: 'Lista provisional',
  participant_count: 3,
  pending_consent_count: 1,
  pending_consent_notice: '1 participación sin autorización vigente: sus datos no se muestran.',
  participants: [
    {
      participation_ref: 'pa-1',
      name: 'Agricultora autorizada A1',
      status: 'ACTIVE',
      accepted_at: '2026-11-13T15:10:00.000Z',
      lines: [
        { product_ref: 'p-1', product_name: 'Glifosato 48 SL', base_unit: 'ML', quantity_base: '20000' },
        { product_ref: 'p-2', product_name: 'Urea granulada', base_unit: 'G', quantity_base: '5000' },
      ],
    },
  ],
};

const CLOSED_CALL: JointPurchaseCallDetail = {
  ...OPEN_CALL,
  status: 'CLOSED',
  closed_at: '2026-11-20T23:00:05.000Z',
  totals_source: 'CLOSING',
};

const CLOSING_DIRECTIVA: JointPurchaseCallClosing = {
  contractVersion: 2,
  call_id: 'call-1',
  name: OPEN_CALL.name,
  status: 'CLOSED',
  label: 'Consolidado al cierre',
  mode: 'AUTOMATIC',
  cutoff_at: '2026-11-20T23:00:00.000Z',
  closed_at: '2026-11-20T23:00:05.000Z',
  closed_by: null,
  participant_count: 3,
  can_view_participants: false,
  lines: [
    { product_ref: 'p-1', product_name: 'Glifosato 48 SL', unit: 'L', base_unit: 'ML', participant_count: 2, total_quantity_base: '45000', visibility: 'VISIBLE', totals_basis: 'ROLE_CONSENT' },
    { product_ref: 'p-2', product_name: 'Urea granulada', unit: 'KG', base_unit: 'G', participant_count: 1, total_quantity_base: null, visibility: 'PENDING_CONSENT', totals_basis: null },
  ],
  participants: null,
  pending_consent_count: 1,
  pending_consent_notice: null,
};

const CLOSING_ADMIN: JointPurchaseCallClosing = {
  ...CLOSING_DIRECTIVA,
  can_view_participants: true,
  participants: [
    {
      participation_ref: 'pa-1',
      name: 'Agricultora autorizada A1',
      accepted_at: '2026-11-18T10:00:00.000Z',
      lines: [{ product_ref: 'p-1', product_name: 'Glifosato 48 SL', base_unit: 'ML', quantity_base: '20000' }],
    },
  ],
  pending_consent_notice: '1 participación sin autorización vigente: sus datos no se muestran.',
};

function httpError(status: number) {
  return new AxiosError('fail', 'ERR', undefined, undefined, {
    status,
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: { errorCode: 'PARTICIPANTS_FORBIDDEN' },
  });
}

let saved: Blob[];

beforeEach(() => {
  saved = [];
  vi.clearAllMocks();
  URL.createObjectURL = vi.fn((blob: Blob) => {
    saved.push(blob);
    return 'blob:call';
  }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

async function bookOf(blob: Blob) {
  return readXlsx(new Uint8Array(await blob.arrayBuffer()));
}

describe('downloadCallExcel (Excel de reparto y consolidado)', () => {
  it('Directiva en convocatoria abierta: exporta solo portada y consolidado, nunca pide /participants ni escribe 0 en pendientes', async () => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue(OPEN_CALL);
    const book = await downloadCallExcel('call-1');

    expect(jointPurchaseCallsService.participants).not.toHaveBeenCalled();
    expect(book.includesIndividual).toBe(false);
    expect(book.fileName).toBe('convocatoria-herbicidas-de-la-siembra-provisional.xlsx');
    expect(saved).toHaveLength(1);
    expect(saved[0]!.type).toBe(XLSX_MIME);

    const { sheets } = await bookOf(saved[0]!);
    expect([...sheets.keys()]).toEqual(['Convocatoria', 'Consolidado']);
    const consolidated = sheets.get('Consolidado')!;
    expect(consolidated.cells.get(`B${rowOf(consolidated, 'Glifosato 48 SL')}`)).toMatchObject({ type: 'n', value: '45' });
    // Pendiente de autorización: celda numérica vacía, nunca 0.
    expect(consolidated.cells.has(`B${rowOf(consolidated, 'Urea granulada')}`)).toBe(false);
  });

  it('Administración habilitada en convocatoria cerrada: incluye hoja «Reparto por participante» con pedidos autorizados', async () => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue({ ...CLOSED_CALL, can_view_participants: true });
    vi.mocked(jointPurchaseCallsService.closing).mockResolvedValue(CLOSING_ADMIN);
    const book = await downloadCallExcel('call-1');

    expect(book.includesIndividual).toBe(true);
    expect(book.fileName).toBe('convocatoria-herbicidas-de-la-siembra-cierre.xlsx');
    const { sheets } = await bookOf(saved[0]!);
    expect([...sheets.keys()]).toEqual(['Convocatoria', 'Consolidado', 'Reparto por participante']);

    const individual = sheets.get('Reparto por participante')!;
    const row = rowOf(individual, 'Agricultora autorizada A1');
    expect(individual.cells.get(`B${row}`)?.value).toBe('Glifosato 48 SL');
    expect(individual.cells.get(`C${row}`)).toMatchObject({ type: 'n', value: '20' });
    expect(individual.cells.get(`D${row}`)?.value).toBe('L');
    expect(sheets.get('Convocatoria')!.text).toContain('1 participación sin autorización vigente');
  });

  it('Directiva en convocatoria cerrada: incluso si /closing trajera nombres por error, no se incluye hoja de reparto', async () => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue({ ...CLOSED_CALL, can_view_participants: false });
    vi.mocked(jointPurchaseCallsService.closing).mockResolvedValue(CLOSING_ADMIN);
    const book = await downloadCallExcel('call-1');

    expect(book.includesIndividual).toBe(false);
    const { sheets } = await bookOf(saved[0]!);
    expect([...sheets.keys()]).toEqual(['Convocatoria', 'Consolidado']);
    const allText = [...sheets.values()].map((s) => s.text).join('\n');
    expect(allText).not.toContain('Agricultora autorizada A1');
  });

  it('Administración habilitada en convocatoria abierta: pide /participants y exporta reparto provisional', async () => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue({ ...OPEN_CALL, can_view_participants: true });
    vi.mocked(jointPurchaseCallsService.participants).mockResolvedValue(PARTICIPANTS_ADMIN);
    const book = await downloadCallExcel('call-1');

    expect(jointPurchaseCallsService.participants).toHaveBeenCalledWith('call-1');
    expect(book.includesIndividual).toBe(true);
    const { sheets } = await bookOf(saved[0]!);
    expect(sheets.has('Reparto por participante')).toBe(true);
    expect(sheets.get('Reparto por participante')!.text).toContain('Agricultora autorizada A1');
  });

  it('si /participants devuelve 403 al exportar, rechaza y no descarga nada', async () => {
    const error = httpError(403);
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue({ ...OPEN_CALL, can_view_participants: true });
    vi.mocked(jointPurchaseCallsService.participants).mockRejectedValue(error);

    await expect(downloadCallExcel('call-1')).rejects.toBe(error);
    expect(saved).toHaveLength(0);
  });
});
