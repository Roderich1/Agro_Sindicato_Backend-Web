import { act, fireEvent, render as renderForm, screen, waitFor, within } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { useLocation, useParams } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../App.tsx?raw';
import { AppShell } from '../components/app-shell';
import { CollectiveRoute } from '../components/collective-route';
import { prepareCallPath, readPreparedCall } from '../lib/joint-purchase-call-text';
import { COLLECTIVE_PATHS, menuPathsFor, WEB_NOT_FOR_FARMERS_PATH } from '../lib/navigation';
import { campaignsService } from '../services/campaigns.service';
import { collectiveService } from '../services/collective.service';
import { jointPurchaseCallsService } from '../services/joint-purchase-calls.service';
import { CAMPAIGN, renderAt } from '../test/render';
import type { AssociationList, CatalogEntry, CollectiveSummary, Proposal, ProposalSummary } from '../types/collective';
import type { ClosedProductHistory, EligibleResponsible, JointPurchaseCallDetail, JointPurchaseCallSummary } from '../types/joint-purchase-calls';
import { JointPurchaseCallForm } from './joint-purchase-call-form';
import { JointPurchaseCallsPage } from './joint-purchase-calls.page';

vi.mock('../services/joint-purchase-calls.service', () => ({
  jointPurchaseCallsService: {
    list: vi.fn(),
    get: vi.fn(),
    closedProductHistory: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    open: vi.fn(),
    cancel: vi.fn(),
    close: vi.fn(),
    participants: vi.fn(),
    closing: vi.fn(),
    eligibleResponsibles: vi.fn(),
    collaborators: vi.fn(),
    grant: vi.fn(),
    revoke: vi.fn(),
    substitutionPermissionsHistory: vi.fn(),
  },
}));
vi.mock('../services/collective.service', () => ({
  collectiveService: { catalog: vi.fn(), associations: vi.fn(), proposals: vi.fn(), proposal: vi.fn(), summary: vi.fn() },
}));
vi.mock('../services/campaigns.service', () => ({ campaignsService: { list: vi.fn(), active: vi.fn() } }));

/**
 * E2 §6: «Compras conjuntas», con las formas que responde el servidor
 * (`call-views.ts`). Datos sintéticos: ningún agricultor, producto ni cifra real.
 */
const ROW: JointPurchaseCallSummary = {
  call_id: 'c-1',
  name: 'Herbicidas de la siembra',
  status: 'OPEN',
  campaign: { campaign_ref: CAMPAIGN.id, name: CAMPAIGN.name },
  deadline_at: '2026-12-01T22:00:00.000Z',
  opened_at: '2026-11-11T12:00:00.000Z',
  closed_at: null,
  cancelled_at: null,
  created_at: '2026-11-11T10:00:00.000Z',
  responsible: { user_ref: 'u-2', name: 'Responsable sintética' },
  product_count: 2,
  participant_count: 4,
};
const DRAFT_ROW: JointPurchaseCallSummary = { ...ROW, call_id: 'c-2', name: 'Fertilizantes', status: 'DRAFT', opened_at: null, participant_count: 0 };

const RESPONSIBLES: EligibleResponsible[] = [
  // Quien usa la Web en las pruebas (`renderAt`): puede elegirse a sí misma.
  { user_ref: 'u-1', name: 'Usuario sintético', role: 'DIRECTIVA' },
  { user_ref: 'u-2', name: 'Responsable sintética', role: 'DIRECTIVA' },
  { user_ref: 'u-3', name: 'Administrador sintético', role: 'ADMINISTRADOR' },
];

/** Respuesta 201 de `POST /joint-purchase-calls`: el detalle del borrador, identificado por `call_id`. */
const CREATED: JointPurchaseCallDetail = {
  contractVersion: 2,
  call_id: 'c-9',
  name: 'Herbicidas de verano',
  status: 'DRAFT',
  campaign: { campaign_ref: CAMPAIGN.id, name: CAMPAIGN.name, status: 'ABIERTA' },
  deadline_at: '2099-12-01T22:00:00.000Z',
  opened_at: null,
  closed_at: null,
  cancelled_at: null,
  cancel_reason: null,
  created_at: '2026-11-11T10:00:00.000Z',
  updated_at: '2026-11-11T10:00:00.000Z',
  server_time: '2026-11-11T10:00:00.000Z',
  responsible: { user_ref: 'u-3', name: 'Administrador sintético', role: 'ADMINISTRADOR', eligible: true, version: 1 },
  created_by: { user_ref: 'u-1', name: 'Usuario sintético' },
  opened_by: null,
  cancelled_by: null,
  source_proposal_ref: null,
  participant_count: 0,
  totals_source: 'NONE',
  can_view_participants: false,
  is_responsible: false,
  can_manage: true,
  can_cancel_or_close: true,
  delegations_suspended: false,
  can_substitute_responsible: false,
  pending_delegation_reviews: 0,
  pending_consent_count: 0,
  responsible_changes: [],
  my_grants: ['MANAGE'],
  collaborator_count: 0,
  products: [
    {
      position: 0,
      product_ref: 'p-3',
      name: 'Urea',
      unit: 'KG',
      base_unit: 'G',
      is_active: true,
      reference: null,
      totals: { participant_count: 0, total_quantity_base: '0', visibility: 'VISIBLE', totals_basis: 'ROLE_CONSENT' },
    },
  ],
  history: [],
};

const CATALOG: CatalogEntry[] = [
  { product_ref: 'p-1', product_name: 'Glifosato 48 SL', unit: 'L', base_unit: 'ML', is_active: true },
  { product_ref: 'p-2', product_name: 'Glifosato del vecino', unit: 'L', base_unit: 'ML', is_active: true },
  { product_ref: 'p-3', product_name: 'Urea', unit: 'kg', base_unit: 'G', is_active: true },
  { product_ref: 'p-4', product_name: 'Herbicida retirado', unit: 'L', base_unit: 'ML', is_active: false },
  { product_ref: 'p-5', product_name: 'Adherente', unit: 'unidad', base_unit: null, is_active: true },
];
const ASSOCIATIONS: AssociationList = {
  current: [
    {
      association_ref: 'a-1',
      product_ref: 'p-2',
      product_name: 'Glifosato del vecino',
      canonical_product_ref: 'p-1',
      canonical_product_name: 'Glifosato 48 SL',
      valid_from: '2026-10-01T00:00:00.000Z',
      valid_to: null,
      actor_ref: 'u-2',
      actor_name: 'Responsable sintética',
      reason: 'misma etiqueta',
      closed_by_ref: null,
      closed_by_name: null,
      close_reason: null,
    },
  ],
  history: [],
};

const SUMMARY: CollectiveSummary = {
  contractVersion: 1,
  campaign: { campaign_ref: CAMPAIGN.id, name: CAMPAIGN.name, status: 'ABIERTA' },
  seal: null,
  disclosure: { mode: 'APPROVED', policy: 'F07-POL-02', approved: true, threshold: null },
  coverage: null,
  cells: [{
    projection_type: 'DECLARED_NEED', product_ref: 'p-3', product_name: 'Urea', base_unit: 'G', presentation_unit: 'KG',
    status: 'DISCLOSED', total_base: '100000', total_presentation: '100', contributors: null,
    data_as_of: null, released_at: null, pending_changes: false,
  }],
};

const UREA_HISTORY: ClosedProductHistory = {
  product_ref: 'p-3', product_name: 'Urea', base_unit: 'G', status: 'VISIBLE', total_quantity_base: '70000',
  calls: [
    { call_id: 'closed-1', call_name: 'Primera compra', base_unit: 'G', visibility: 'VISIBLE', quantity_base: '40000' },
    { call_id: 'closed-2', call_name: 'Segunda compra', base_unit: 'G', visibility: 'VISIBLE', quantity_base: '30000' },
  ],
};

const DRAFTS: ProposalSummary[] = [
  { proposal_ref: 'pr-1', status: 'DRAFT', generated_at: '2026-11-10T15:00:00.000Z', generated_by: { user_ref: 'u-2', name: 'Responsable sintética' }, inputs_fingerprint: null, line_count: 2 },
];
const line = (position: number, over: Partial<Proposal['lines'][number]>): Proposal['lines'][number] => ({
  position,
  product_ref: 'p-1',
  product_name: 'Glifosato 48 SL',
  base_unit: 'ML',
  presentation_unit: 'L',
  status: 'DISCLOSED',
  quantity_base: '120000',
  quantity_presentation: '120',
  contributors: 5,
  data_as_of: '2026-11-10T15:00:00.000Z',
  released_at: '2026-11-10T15:00:00.000Z',
  pending_changes: false,
  ...over,
});
const PROPOSAL: Proposal = {
  contractVersion: 1,
  proposal_ref: 'pr-1',
  status: 'DRAFT',
  basis: 'DECLARED_NEED',
  campaign: { campaign_ref: CAMPAIGN.id, name: CAMPAIGN.name, status: 'ABIERTA' },
  seal: null,
  generated_at: '2026-11-10T15:00:00.000Z',
  generated_by: { user_ref: 'u-2', name: 'Responsable sintética' },
  inputs_fingerprint: null,
  disclosure: { mode: 'PROVISIONAL_SYNTHETIC', policy: 'F07-POL-01', approved: false },
  coverage: null,
  lines: [
    line(0, {}),
    line(1, { product_ref: 'p-3', product_name: 'Urea', base_unit: 'G', presentation_unit: 'KG', status: 'SUPPRESSED_UNDER_THRESHOLD', quantity_base: null, quantity_presentation: null, contributors: null }),
  ],
  notice: '',
};

function axiosError(status: number, data: unknown = {}) {
  const error = new AxiosError(String(status), String(status));
  error.response = { status, data, statusText: '', headers: {}, config: { headers: new AxiosHeaders() } };
  return error;
}

/** La ruta del detalle muestra el `:id` al que se navegó y el mensaje recibido. */
function DetailProbe() {
  const { id } = useParams();
  const message = (useLocation().state as { message?: string } | null)?.message ?? '';
  return (
    <p data-testid="detail-probe" data-message={message}>
      detalle de la convocatoria {id}
    </p>
  );
}
const DETAIL_ROUTE = { path: '/colectivo/compras-conjuntas/:id', element: <DetailProbe /> };
const render = (role = 'DIRECTIVA') =>
  renderAt(<JointPurchaseCallsPage />, { role, path: COLLECTIVE_PATHS.jointPurchaseCalls, routes: [DETAIL_ROUTE] });
const dialog = () => screen.getByRole('dialog');

describe('Compras conjuntas: lista (E2 §6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(campaignsService.list).mockResolvedValue([CAMPAIGN]);
    vi.mocked(jointPurchaseCallsService.list).mockResolvedValue([ROW, DRAFT_ROW]);
    vi.mocked(jointPurchaseCallsService.eligibleResponsibles).mockResolvedValue(RESPONSIBLES);
    vi.mocked(collectiveService.catalog).mockResolvedValue(CATALOG);
    vi.mocked(collectiveService.associations).mockResolvedValue(ASSOCIATIONS);
    vi.mocked(collectiveService.proposals).mockResolvedValue(DRAFTS);
    vi.mocked(collectiveService.proposal).mockResolvedValue(PROPOSAL);
    vi.mocked(collectiveService.summary).mockResolvedValue(SUMMARY);
    vi.mocked(jointPurchaseCallsService.closedProductHistory).mockResolvedValue([]);
  });

  it('muestra «Cargando…» y luego las filas con nombre, estado, campaña, fecha límite y participantes', async () => {
    render();
    expect(screen.getByTestId('calls-loading')).toBeTruthy();
    const row = await screen.findByTestId('call-row-c-1');
    expect(jointPurchaseCallsService.list).toHaveBeenCalledWith({ campaignId: CAMPAIGN.id, status: null });
    expect(within(row).getByRole('link', { name: 'Herbicidas de la siembra' }).getAttribute('href')).toBe(
      `/colectivo/compras-conjuntas/c-1?campaign=${CAMPAIGN.id}`,
    );
    expect(within(row).getByText('Abierta')).toBeTruthy();
    // Rediseño v2 (lámina 09): la campaña ya no se repite en cada tarjeta; es la elegida en el selector de la cabecera.
    expect((screen.getByLabelText('Campaña') as HTMLSelectElement).value).toBe(CAMPAIGN.id);
    expect(screen.getByRole('option', { name: new RegExp(CAMPAIGN.name) })).toBeTruthy();
    expect(within(row).queryByText('Responsable sintética')).toBeNull();
    expect(within(row).getByText('4')).toBeTruthy();
    expect(within(screen.getByTestId('call-row-c-2')).getByText('Borrador')).toBeTruthy();
  });

  it('sin convocatorias: estado vacío sin un «0»', async () => {
    vi.mocked(jointPurchaseCallsService.list).mockResolvedValue([]);
    render();
    expect((await screen.findByTestId('calls-empty')).textContent).toMatch(/Todavía no hay convocatorias/);
  });

  it('error con «Reintentar»: vuelve a pedir la lista', async () => {
    vi.mocked(jointPurchaseCallsService.list).mockRejectedValueOnce(axiosError(500)).mockResolvedValueOnce([ROW]);
    render();
    const error = await screen.findByTestId('calls-error');
    fireEvent.click(within(error).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByTestId('call-row-c-1')).toBeTruthy();
    expect(jointPurchaseCallsService.list).toHaveBeenCalledTimes(2);
  });

  // Rediseño v2 (B.1): los filtros y sus contadores se calculan en el navegador sobre la lista de la campaña (una sola llamada).
  it('filtra por estado con contadores y, sin resultados, ofrece quitar el filtro', async () => {
    render();
    await screen.findByTestId('call-row-c-1');
    const filters = screen.getByTestId('call-status-filter');
    expect(within(filters).getByRole('button', { name: 'Todas 2' })).toBeTruthy();
    expect(within(filters).getByRole('button', { name: 'Abiertas 1' })).toBeTruthy();
    fireEvent.click(within(filters).getByRole('button', { name: 'Canceladas 0' }));
    expect((await screen.findByTestId('calls-no-match')).textContent).toMatch(/«Cancelada»/);
    expect(screen.queryByTestId('call-row-c-1')).toBeNull();
    expect(jointPurchaseCallsService.list).toHaveBeenCalledTimes(1);
    expect(jointPurchaseCallsService.list).toHaveBeenLastCalledWith({ campaignId: CAMPAIGN.id, status: null });
    fireEvent.click(screen.getByRole('button', { name: 'Quitar filtros' }));
    expect(await screen.findByTestId('call-row-c-1')).toBeTruthy();
  });

  it('nuevo borrador: valida los campos sin asignación y crea con productos del catálogo y navega por el call_id de la respuesta', async () => {
    vi.mocked(jointPurchaseCallsService.create).mockResolvedValue(CREATED);
    vi.mocked(jointPurchaseCallsService.closedProductHistory).mockResolvedValue([UREA_HISTORY]);
    render();
    await screen.findByTestId('call-row-c-1');
    fireEvent.click(screen.getByRole('button', { name: 'Nueva convocatoria' }));
    expect(within(dialog()).getByText(/El plazo se cumple con el reloj del servidor/)).toBeTruthy();

    fireEvent.click(within(dialog()).getByRole('button', { name: 'Crear borrador' }));
    expect(within(dialog()).getByText('Escriba el nombre de la convocatoria.')).toBeTruthy();
    expect(within(dialog()).getByText('Elija la fecha y hora límite.')).toBeTruthy();
    expect(within(dialog()).getByText('Elija al menos un producto.')).toBeTruthy();
    expect(jointPurchaseCallsService.create).not.toHaveBeenCalled();

    // Una fecha pasada tampoco se envía.
    fireEvent.change(within(dialog()).getByLabelText('Fecha y hora límite'), { target: { value: '2020-01-01T10:00' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Crear borrador' }));
    expect(within(dialog()).getByText('La fecha límite debe ser posterior a este momento.')).toBeTruthy();

    fireEvent.change(within(dialog()).getByLabelText('Nombre'), { target: { value: '  Herbicidas de verano ' } });
    fireEvent.change(within(dialog()).getByLabelText('Fecha y hora límite'), { target: { value: '2099-12-01T18:00' } });

    // Catálogo: sin inactivos, sin unidades que no sean L/KG y sin denominaciones asociadas.
    const list = await within(dialog()).findByRole('list', { name: 'Productos del catálogo' });
    const names = within(list).getAllByRole('checkbox').map((box) => box.closest('label')!.textContent);
    expect(names).toEqual(['Glifosato 48 SL · L', 'Urea · kg']);
    fireEvent.click(within(list).getByRole('checkbox', { name: /Urea/ }));
    const reference = within(dialog()).getByRole('region', { name: 'Referencia por producto' });
    expect(await within(reference).findByText('Solicitado en convocatorias cerradas: 70 kg')).toBeTruthy();
    expect(within(reference).getByText('Necesidad declarada: 100 kg')).toBeTruthy();
    expect(within(reference).getByText('Primera compra: 40 kg')).toBeTruthy();
    expect(within(reference).getByText('Segunda compra: 30 kg')).toBeTruthy();

    fireEvent.click(within(dialog()).getByRole('button', { name: 'Crear borrador' }));
    await waitFor(() =>
      expect(jointPurchaseCallsService.create).toHaveBeenCalledWith({
        campaign_id: CAMPAIGN.id,
        name: 'Herbicidas de verano',
        deadline_at: new Date('2099-12-01T18:00').toISOString(),
        products: [{ product_ref: 'p-3' }],
      }),
    );
    const probe = await screen.findByTestId('detail-probe');
    expect(probe.textContent).toBe('detalle de la convocatoria c-9');
    expect(probe.getAttribute('data-message')).toMatch(/Borrador «Herbicidas de verano» creado/);
  });

  it('en edición excluye la convocatoria y descarta datos de la campaña o producto anterior', async () => {
    let resolveOld!: (rows: ClosedProductHistory[]) => void;
    const oldResponse = new Promise<ClosedProductHistory[]>((resolve) => { resolveOld = resolve; });
    const zero: ClosedProductHistory = {
      product_ref: 'p-1', product_name: 'Glifosato 48 SL', base_unit: 'ML', status: 'VISIBLE', total_quantity_base: '0',
      calls: [{ call_id: 'closed-zero', call_name: 'Cierre vacío', base_unit: 'ML', visibility: 'VISIBLE', quantity_base: '0' }],
    };
    const pending: ClosedProductHistory = {
      ...zero, status: 'PENDING_CONSENT', total_quantity_base: null,
      calls: [
        { ...zero.calls[0]!, call_name: 'Cierre protegido', visibility: 'PENDING_CONSENT', quantity_base: null },
        { ...zero.calls[0]!, call_id: 'closed-other', call_name: 'Otro cierre', quantity_base: '12500' },
      ],
    };
    vi.mocked(jointPurchaseCallsService.closedProductHistory).mockImplementation((campaignId, refs) => {
      if (refs.includes('p-3')) return oldResponse;
      return Promise.resolve(campaignId === CAMPAIGN.id ? [zero] : [pending]);
    });
    const form = (campaignId: string) => (
      <JointPurchaseCallForm campaignId={campaignId} campaignName="Campaña de prueba"
        call={CREATED} onClose={vi.fn()} onSaved={vi.fn()} />
    );
    const { rerender } = renderForm(form(CAMPAIGN.id));
    await waitFor(() => expect(jointPurchaseCallsService.closedProductHistory).toHaveBeenCalledWith(
      CAMPAIGN.id, ['p-3'], CREATED.call_id, expect.any(AbortSignal),
    ));
    const reference = () => within(dialog()).getByRole('region', { name: 'Referencia por producto' });
    fireEvent.click(await within(dialog()).findByRole('checkbox', { name: /Urea/ }));
    expect(within(dialog()).queryByRole('region', { name: 'Referencia por producto' })).toBeNull();
    fireEvent.click(within(dialog()).getByRole('checkbox', { name: /Glifosato/ }));
    expect(await within(reference()).findByText('Solicitado en convocatorias cerradas: 0 L')).toBeTruthy();
    await act(async () => resolveOld([UREA_HISTORY]));
    expect(within(reference()).queryByText(/70 kg/)).toBeNull();

    rerender(form('otra-campana'));
    expect(within(reference()).queryByText(/0 L/)).toBeNull();
    expect(await within(reference()).findByText(/Total pendiente de autorización/)).toBeTruthy();
    expect(within(reference()).getByText('Cierre protegido: Pendiente de autorización')).toBeTruthy();
    expect(within(reference()).getByText('Otro cierre: 12,5 L')).toBeTruthy();
    expect(jointPurchaseCallsService.closedProductHistory).toHaveBeenLastCalledWith(
      'otra-campana', ['p-1'], CREATED.call_id, expect.any(AbortSignal),
    );
  });

  it('editar solo productos activa el aviso de cambios sin guardar al intentar cerrar con Escape', async () => {
    const onClose = vi.fn();
    renderForm(<JointPurchaseCallForm campaignId={CAMPAIGN.id} campaignName="Campaña de prueba" call={CREATED} onClose={onClose} onSaved={vi.fn()} />);
    await within(dialog()).findByRole('checkbox', { name: /Glifosato 48 SL/ });

    // Sin cambios: Escape cierra directamente sin pedir confirmación.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    onClose.mockClear();

    // Al añadir únicamente un producto, Escape muestra el aviso de cambios sin guardar y no cierra.
    fireEvent.click(within(dialog()).getByRole('checkbox', { name: /Glifosato 48 SL/ }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(within(dialog()).getByText(/Hay cambios sin guardar/i)).toBeTruthy();

    // Seguir editando mantiene el cambio; al revertir el producto vuelve a quedar limpio.
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Seguir editando' }));
    fireEvent.click(within(dialog()).getByRole('checkbox', { name: /Glifosato 48 SL/ }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    onClose.mockClear();

    // Quitar el único producto original también activa el aviso; confirmar «Descartar cambios» cierra.
    fireEvent.click(within(dialog()).getByRole('checkbox', { name: /Urea/ }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Descartar cambios' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('productos de un borrador de propuesta: la cifra es sólo «referencia» divulgada, nunca una cantidad comprometida', async () => {
    vi.mocked(jointPurchaseCallsService.create).mockResolvedValue({ ...CREATED, source_proposal_ref: 'pr-1' });
    vi.mocked(jointPurchaseCallsService.closedProductHistory).mockResolvedValue([{
      product_ref: 'p-1', product_name: 'Glifosato 48 SL', base_unit: 'ML', status: 'NO_HISTORY', total_quantity_base: null, calls: [],
    }]);
    render();
    await screen.findByTestId('call-row-c-1');
    fireEvent.click(screen.getByRole('button', { name: 'Nueva convocatoria' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'De un borrador de compra' }));
    const select = await within(dialog()).findByLabelText('Borrador de compra');
    fireEvent.change(select, { target: { value: 'pr-1' } });
    expect(collectiveService.proposals).toHaveBeenCalledWith(CAMPAIGN.id);

    const disclosed = await within(dialog()).findByTestId('proposal-line-0');
    expect(disclosed.textContent).toMatch(/Necesidad declarada en el borrador: 120 L/);
    const suppressed = within(dialog()).getByTestId('proposal-line-1');
    expect(suppressed.textContent).toMatch(/Sin cifra publicada en el borrador/);
    for (const node of [disclosed, suppressed]) expect(node.textContent).not.toMatch(/comprometid|comprad|pedid/i);
    expect(within(dialog()).getByTestId('proposal-reference-note').textContent).toMatch(/sólo como referencia/);

    fireEvent.click(within(disclosed).getByRole('checkbox'));
    const reference = within(dialog()).getByRole('region', { name: 'Referencia por producto' });
    expect(await within(reference).findByText(/Sin convocatorias cerradas para este producto/)).toBeTruthy();
    expect(within(reference).queryByText(/Necesidad declarada/)).toBeNull();
    expect(collectiveService.summary).not.toHaveBeenCalled();
    fireEvent.change(within(dialog()).getByLabelText('Nombre'), { target: { value: 'Desde el borrador' } });
    fireEvent.change(within(dialog()).getByLabelText('Fecha y hora límite'), { target: { value: '2099-12-01T18:00' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Crear borrador' }));
    await waitFor(() =>
      expect(jointPurchaseCallsService.create).toHaveBeenCalledWith(
        // `CreateCallDto`: los productos llevan sólo `product_ref`; el servidor deduce la línea de origen.
        expect.objectContaining({ source_proposal_id: 'pr-1', products: [{ product_ref: 'p-1' }] }),
      ),
    );
  });

  it('un error del servidor al crear se explica en español por su errorCode', async () => {
    vi.mocked(jointPurchaseCallsService.create).mockRejectedValue(axiosError(422, { errorCode: 'RESPONSIBLE_NOT_ELIGIBLE' }));
    render();
    await screen.findByTestId('call-row-c-1');
    fireEvent.click(screen.getByRole('button', { name: 'Nueva convocatoria' }));
    fireEvent.change(within(dialog()).getByLabelText('Nombre'), { target: { value: 'X' } });
    fireEvent.change(within(dialog()).getByLabelText('Fecha y hora límite'), { target: { value: '2099-12-01T18:00' } });
    fireEvent.click(await within(dialog()).findByRole('checkbox', { name: /Glifosato 48 SL/ }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Crear borrador' }));
    // El error se muestra en el formulario, que vuelve a la vista con lo escrito.
    expect(await within(dialog()).findByText(/no es un usuario activo de la Directiva o la Administración/)).toBeTruthy();
    expect((within(dialog()).getByLabelText('Nombre') as HTMLInputElement).value).toBe('X');
    expect(screen.queryByTestId('detail-probe')).toBeNull();
  });

  it('selectores del catálogo y del borrador filtran sin tildes y por unidad sin fijar ya marcados encima de la búsqueda', async () => {
    const accentedCatalog: CatalogEntry[] = [
      ...CATALOG,
      { product_ref: 'p-6', product_name: 'ÁCIDO húmico', unit: 'L', base_unit: 'ML', is_active: true },
    ];
    vi.mocked(collectiveService.catalog).mockResolvedValue(accentedCatalog);
    render();
    fireEvent.click(await screen.findByRole('button', { name: 'Nueva convocatoria' }));
    const form = dialog();
    await within(form).findByRole('list', { name: 'Productos del catálogo' });

    // Marcar Urea y buscar «acido»: Urea no queda fijada tapando el resultado buscado.
    fireEvent.click(within(form).getByRole('checkbox', { name: /Urea/ }));
    fireEvent.change(within(form).getByLabelText('Buscar producto'), { target: { value: 'acido' } });
    expect(within(form).getByRole('checkbox', { name: /ÁCIDO húmico/ })).toBeTruthy();
    expect(within(form).queryByRole('checkbox', { name: /Urea/ })).toBeNull();

    // Filtrar por Kilogramos en catálogo cuando no coincide muestra «Sin coincidencias» y permite limpiar.
    fireEvent.click(within(within(form).getByTestId('catalog-picker-unit')).getByRole('button', { name: 'Kilogramos' }));
    expect(within(form).getByText('Sin coincidencias')).toBeTruthy();
    fireEvent.click(within(form).getByRole('button', { name: 'Quitar filtros' }));
    expect((within(form).getByRole('checkbox', { name: /Urea/ }) as HTMLInputElement).checked).toBe(true);

    // En «De un borrador de compra», buscar sin tildes y filtrar por unidad.
    fireEvent.click(within(form).getByRole('button', { name: 'De un borrador de compra' }));
    fireEvent.change(await within(form).findByLabelText('Borrador de compra'), { target: { value: 'pr-1' } });
    await within(form).findByTestId('proposal-line-0');
    fireEvent.change(within(form).getByLabelText('Buscar en el borrador'), { target: { value: 'urea' } });
    expect(within(form).getByTestId('proposal-line-1')).toBeTruthy();
    expect(within(form).queryByTestId('proposal-line-0')).toBeNull();
    fireEvent.click(within(within(form).getByTestId('proposal-picker-unit')).getByRole('button', { name: 'Litros' }));
    expect(within(form).getByText('Sin coincidencias')).toBeTruthy();
  });

  /** Completa el formulario de una convocatoria nueva con un producto del catálogo y el responsable dado. */
  it('crea con el rol institucional, sin consulta de responsables ni pasos de traspaso', async () => {
    vi.mocked(jointPurchaseCallsService.create).mockResolvedValue(CREATED);
    render();
    fireEvent.click(await screen.findByRole('button', { name: 'Nueva convocatoria' }));
    const form = dialog();
    expect(within(form).queryByLabelText('Responsable')).toBeNull();
    expect(jointPurchaseCallsService.eligibleResponsibles).not.toHaveBeenCalled();
    fireEvent.change(within(form).getByLabelText('Nombre'), { target: { value: 'Fungicidas' } });
    fireEvent.change(within(form).getByLabelText('Fecha y hora límite'), { target: { value: '2099-12-01T18:00' } });
    fireEvent.click(await within(form).findByRole('checkbox', { name: /Urea/ }));
    fireEvent.click(within(form).getByRole('button', { name: 'Crear borrador' }));
    await waitFor(() => expect(jointPurchaseCallsService.create).toHaveBeenCalledTimes(1));
    expect(vi.mocked(jointPurchaseCallsService.create).mock.calls[0]![0]).not.toHaveProperty('responsible_user_id');
    expect(screen.queryByTestId('handover-warning')).toBeNull();
  });
});

/** La consulta de la URL actual, para comprobar qué parámetros quedan. */
function SearchProbe() {
  return <p data-testid="search-probe">{useLocation().search}</p>;
}
const renderPrepared = (path: string) =>
  renderAt(
    <>
      <JointPurchaseCallsPage />
      <SearchProbe />
    </>,
    { path, routePath: COLLECTIVE_PATHS.jointPurchaseCalls, routes: [DETAIL_ROUTE] },
  );
const searchParams = () => new URLSearchParams(screen.getByTestId('search-probe').textContent ?? '');

describe('Compras conjuntas: «Preparar convocatoria» desde un borrador de propuesta', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(campaignsService.list).mockResolvedValue([CAMPAIGN]);
    vi.mocked(jointPurchaseCallsService.list).mockResolvedValue([ROW]);
    vi.mocked(jointPurchaseCallsService.eligibleResponsibles).mockResolvedValue(RESPONSIBLES);
    vi.mocked(collectiveService.catalog).mockResolvedValue(CATALOG);
    vi.mocked(collectiveService.associations).mockResolvedValue(ASSOCIATIONS);
    vi.mocked(collectiveService.proposals).mockResolvedValue(DRAFTS);
    vi.mocked(collectiveService.proposal).mockResolvedValue(PROPOSAL);
    vi.mocked(jointPurchaseCallsService.create).mockResolvedValue({ ...CREATED, source_proposal_ref: 'pr-1' });
  });

  it('la URL usa la ruta de la lista y codifica los valores; se lee igual sin recortar a 50 en silencio', () => {
    const path = prepareCallPath(CAMPAIGN.id, 'pr 1/á', ['p-1', 'p&2']);
    expect(path.startsWith(`${COLLECTIVE_PATHS.jointPurchaseCalls}?nueva=1&`)).toBe(true);
    expect(path).not.toMatch(/ |&2|\/á/);
    expect(readPreparedCall(new URLSearchParams(path.split('?')[1]))).toEqual({
      campaignId: CAMPAIGN.id,
      proposalId: 'pr 1/á',
      productRefs: ['p-1', 'p&2'],
    });
    const refs51 = Array.from({ length: 51 }, (_, i) => `p-${i + 1}`);
    const path51 = prepareCallPath(CAMPAIGN.id, 'pr-51', refs51);
    expect(readPreparedCall(new URLSearchParams(path51.split('?')[1]))?.productRefs).toEqual(refs51);
    expect(readPreparedCall(new URLSearchParams('nueva=1&campana=no-uuid&propuesta=pr-1'))).toBeNull();
    expect(readPreparedCall(new URLSearchParams(`campana=${CAMPAIGN.id}&propuesta=pr-1`))).toBeNull();
  });

  it('con 50 productos llegan completos; con 51 conserva los 51 marcados y exige ajustar antes de crear', async () => {
    const refs51 = Array.from({ length: 51 }, (_, i) => `p-${i + 1}`);
    const proposal51: Proposal = {
      ...PROPOSAL,
      proposal_ref: 'pr-51',
      lines: refs51.map((product_ref, position) => line(position, { product_ref, product_name: `Producto ${position + 1}` })),
    };
    vi.mocked(collectiveService.proposals).mockResolvedValue([{ ...DRAFTS[0]!, proposal_ref: 'pr-51', line_count: 51 }]);
    vi.mocked(collectiveService.proposal).mockResolvedValue(proposal51);

    renderPrepared(prepareCallPath(CAMPAIGN.id, 'pr-51', refs51));
    const form = await screen.findByRole('dialog', { name: 'Nueva convocatoria' });
    await waitFor(() => expect((within(within(form).getByTestId('proposal-line-50')).getByRole('checkbox') as HTMLInputElement).checked).toBe(true));

    // Conserva los 51 marcados y avisa del límite de 50.
    expect(within(form).getAllByRole('checkbox').filter((box) => (box as HTMLInputElement).checked)).toHaveLength(51);
    expect(within(form).getByTestId('call-products-limit').textContent).toMatch(/hasta 50 productos.*Tiene 51 elegidos.*quite al menos 1/i);

    // No envía mientras exceda 50.
    fireEvent.change(within(form).getByLabelText('Nombre'), { target: { value: 'Compra grande' } });
    fireEvent.change(within(form).getByLabelText('Fecha y hora límite'), { target: { value: '2099-12-01T18:00' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Crear borrador' }));
    expect(jointPurchaseCallsService.create).not.toHaveBeenCalled();

    // Al desmarcar 1 (quedan 50), desaparece el aviso y se envían los 50 completos.
    fireEvent.click(within(within(form).getByTestId('proposal-line-50')).getByRole('checkbox'));
    expect(within(form).queryByTestId('call-products-limit')).toBeNull();
    fireEvent.click(within(form).getByRole('button', { name: 'Crear borrador' }));
    await waitFor(() => expect(jointPurchaseCallsService.create).toHaveBeenCalledTimes(1));
    expect(vi.mocked(jointPurchaseCallsService.create).mock.calls[0]![0].products).toHaveLength(50);
  });

  it('abre el formulario con la campaña, el borrador y sólo sus líneas de esos productos; avisa de los ignorados; nada se envía sin confirmar', async () => {
    renderPrepared(prepareCallPath(CAMPAIGN.id, 'pr-1', ['p-1', 'p-9', 'p-8']));
    const form = await screen.findByRole('dialog', { name: 'Nueva convocatoria' });
    expect(within(form).getByText(CAMPAIGN.name)).toBeTruthy();
    expect(within(form).getByTestId('prepared-notice').textContent).toMatch(/Revise los productos/);
    expect(within(form).getByRole('button', { name: 'De un borrador de compra' }).getAttribute('aria-pressed')).toBe('true');
    expect(((await within(form).findByLabelText('Borrador de compra')) as HTMLSelectElement).value).toBe('pr-1');
    await waitFor(() => expect((within(within(form).getByTestId('proposal-line-0')).getByRole('checkbox') as HTMLInputElement).checked).toBe(true));
    // Urea (p-3) es línea del borrador pero no se pidió: queda sin elegir.
    expect((within(within(form).getByTestId('proposal-line-1')).getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    expect(within(form).getByTestId('prepared-ignored').textContent).toBe(
      '2 productos indicados no son líneas de este borrador de compra y no se preseleccionaron.',
    );
    expect(collectiveService.proposal).toHaveBeenCalledWith('pr-1');
    expect(collectiveService.proposals).toHaveBeenCalledWith(CAMPAIGN.id);
    // Nombre, plazo y responsable siguen vacíos: la persona los completa.
    expect((within(form).getByLabelText('Nombre') as HTMLInputElement).value).toBe('');
    expect((within(form).getByLabelText('Fecha y hora límite') as HTMLInputElement).value).toBe('');
    expect(jointPurchaseCallsService.create).not.toHaveBeenCalled();

    // Sin completar, «Crear borrador» no envía nada.
    fireEvent.click(within(form).getByRole('button', { name: 'Crear borrador' }));
    expect(within(form).getByText('Escriba el nombre de la convocatoria.')).toBeTruthy();
    expect(jointPurchaseCallsService.create).not.toHaveBeenCalled();

    fireEvent.change(within(form).getByLabelText('Nombre'), { target: { value: 'Desde el borrador' } });
    fireEvent.change(within(form).getByLabelText('Fecha y hora límite'), { target: { value: '2099-12-01T18:00' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Crear borrador' }));
    await waitFor(() =>
      expect(jointPurchaseCallsService.create).toHaveBeenCalledWith({
        campaign_id: CAMPAIGN.id,
        name: 'Desde el borrador',
        deadline_at: new Date('2099-12-01T18:00').toISOString(),
        products: [{ product_ref: 'p-1' }],
        source_proposal_id: 'pr-1',
      }),
    );
    expect(jointPurchaseCallsService.create).toHaveBeenCalledTimes(1);
    expect((await screen.findByTestId('detail-probe')).textContent).toBe('detalle de la convocatoria c-9');
  });

  it('todos los productos son líneas del borrador: los preselecciona sin aviso', async () => {
    renderPrepared(prepareCallPath(CAMPAIGN.id, 'pr-1', ['p-1', 'p-3']));
    const form = await screen.findByRole('dialog', { name: 'Nueva convocatoria' });
    await waitFor(() => expect((within(within(form).getByTestId('proposal-line-1')).getByRole('checkbox') as HTMLInputElement).checked).toBe(true));
    expect((within(within(form).getByTestId('proposal-line-0')).getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
    expect(within(form).queryByTestId('prepared-ignored')).toBeNull();
  });

  it('cerrar el formulario quita los parámetros de la URL, conserva la campaña y no crea nada', async () => {
    renderPrepared(prepareCallPath(CAMPAIGN.id, 'pr-1', ['p-1']));
    const form = await screen.findByRole('dialog', { name: 'Nueva convocatoria' });
    await waitFor(() => expect((within(within(form).getByTestId('proposal-line-0')).getByRole('checkbox') as HTMLInputElement).checked).toBe(true));
    fireEvent.click(within(form).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const params = searchParams();
    for (const name of ['nueva', 'campana', 'propuesta', 'productos']) expect(params.has(name)).toBe(false);
    expect(params.get('campaign')).toBe(CAMPAIGN.id);
    expect(await screen.findByTestId('call-row-c-1')).toBeTruthy();
    expect(jointPurchaseCallsService.create).not.toHaveBeenCalled();
  });

  it('una campaña que no está disponible: no abre el formulario, lo avisa y quita los parámetros', async () => {
    renderPrepared(prepareCallPath('22222222-2222-4222-8222-222222222222', 'pr-1', ['p-1']));
    expect((await screen.findByTestId('prepare-problem')).textContent).toMatch(/No se pudo preparar la convocatoria/);
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(searchParams().has('nueva')).toBe(false));
    expect(collectiveService.proposal).not.toHaveBeenCalled();
    expect(jointPurchaseCallsService.create).not.toHaveBeenCalled();
  });
});

describe('Compras conjuntas: menú y ruta (E2 §6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(campaignsService.list).mockResolvedValue([CAMPAIGN]);
    vi.mocked(jointPurchaseCallsService.list).mockResolvedValue([]);
  });

  it.each(['DIRECTIVA', 'ADMINISTRADOR'])('%s tiene «Compras conjuntas» en el menú colectivo', (role) => {
    expect(menuPathsFor(role)).toContain(COLLECTIVE_PATHS.jointPurchaseCalls);
    renderAt(
      <AppShell title="Compras conjuntas" section="Colectivo">
        <p>contenido</p>
      </AppShell>,
      { role, path: COLLECTIVE_PATHS.jointPurchaseCalls },
    );
    const nav = screen.getAllByRole('navigation', { name: 'Navegación principal' })[0]!;
    const link = within(nav).getByRole('link', { name: 'Compras conjuntas' });
    expect(link.getAttribute('href')).toBe(COLLECTIVE_PATHS.jointPurchaseCalls);
    expect(link.getAttribute('aria-current')).toBe('page');
  });

  it('AGRICULTOR no tiene el ítem ni entra a la ruta: va al aviso', () => {
    expect(menuPathsFor('AGRICULTOR')).not.toContain(COLLECTIVE_PATHS.jointPurchaseCalls);
    renderAt(
      <CollectiveRoute>
        <JointPurchaseCallsPage />
      </CollectiveRoute>,
      { role: 'AGRICULTOR', path: COLLECTIVE_PATHS.jointPurchaseCalls, routes: [{ path: WEB_NOT_FOR_FARMERS_PATH, element: <p>aviso para agricultores</p> }] },
    );
    expect(screen.getByText('aviso para agricultores')).toBeTruthy();
    expect(screen.queryByText('Compras conjuntas')).toBeNull();
    expect(jointPurchaseCallsService.list).not.toHaveBeenCalled();
  });

  it('App.tsx envuelve la lista y el detalle en CollectiveRoute', () => {
    expect(app).toMatch(/path=\{COLLECTIVE_PATHS\.jointPurchaseCalls\}\s*element=\{\s*<CollectiveRoute>\s*<JointPurchaseCallsPage \/>/);
    expect(app).toMatch(/path=\{`\$\{COLLECTIVE_PATHS\.jointPurchaseCalls\}\/:id`\}\s*element=\{\s*<CollectiveRoute>\s*<JointPurchaseCallDetailPage \/>/);
  });
});
