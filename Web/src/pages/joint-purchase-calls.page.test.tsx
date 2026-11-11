import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { useLocation, useParams } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../App.tsx?raw';
import { AppShell } from '../components/app-shell';
import { CollectiveRoute } from '../components/collective-route';
import { RESPONSIBLE_NOTICE } from '../lib/joint-purchase-call-text';
import { COLLECTIVE_PATHS, menuPathsFor, WEB_NOT_FOR_FARMERS_PATH } from '../lib/navigation';
import { campaignsService } from '../services/campaigns.service';
import { collectiveService } from '../services/collective.service';
import { jointPurchaseCallsService } from '../services/joint-purchase-calls.service';
import { CAMPAIGN, renderAt } from '../test/render';
import type { AssociationList, CatalogEntry, Proposal, ProposalSummary } from '../types/collective';
import type { EligibleResponsible, JointPurchaseCallDetail, JointPurchaseCallSummary } from '../types/joint-purchase-calls';
import { JointPurchaseCallsPage } from './joint-purchase-calls.page';

vi.mock('../services/joint-purchase-calls.service', () => ({
  jointPurchaseCallsService: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    open: vi.fn(),
    cancel: vi.fn(),
    close: vi.fn(),
    participants: vi.fn(),
    closing: vi.fn(),
    eligibleResponsibles: vi.fn(),
  },
}));
vi.mock('../services/collective.service', () => ({
  collectiveService: { catalog: vi.fn(), associations: vi.fn(), proposals: vi.fn(), proposal: vi.fn() },
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
  { user_ref: 'u-2', name: 'Responsable sintética', role: 'DIRECTIVA' },
  { user_ref: 'u-3', name: 'Administrador sintético', role: 'ADMINISTRADOR' },
];

/** Respuesta 201 de `POST /joint-purchase-calls`: el detalle del borrador, identificado por `call_id`. */
const CREATED: JointPurchaseCallDetail = {
  contractVersion: 1,
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
  responsible: { user_ref: 'u-3', name: 'Administrador sintético', role: 'ADMINISTRADOR' },
  created_by: { user_ref: 'u-1', name: 'Usuario sintético' },
  opened_by: null,
  cancelled_by: null,
  source_proposal_ref: null,
  participant_count: 0,
  totals_source: 'NONE',
  totals_threshold: 3,
  can_view_participants: false,
  is_responsible: false,
  products: [
    {
      position: 0,
      product_ref: 'p-3',
      name: 'Urea',
      unit: 'KG',
      base_unit: 'G',
      is_active: true,
      reference: null,
      totals: { participant_count: 0, total_quantity_base: null, visibility: 'UNDER_THRESHOLD' },
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
  });

  it('muestra «Cargando…» y luego las filas con nombre, estado, campaña, fecha límite, responsable y participantes', async () => {
    render();
    expect(screen.getByTestId('calls-loading')).toBeTruthy();
    const row = await screen.findByTestId('call-row-c-1');
    expect(jointPurchaseCallsService.list).toHaveBeenCalledWith({ campaignId: CAMPAIGN.id, status: null });
    expect(within(row).getByRole('link', { name: 'Herbicidas de la siembra' }).getAttribute('href')).toBe(
      `/colectivo/compras-conjuntas/c-1?campaign=${CAMPAIGN.id}`,
    );
    expect(within(row).getByText('Abierta')).toBeTruthy();
    expect(within(row).getByText(CAMPAIGN.name)).toBeTruthy();
    expect(within(row).getByText('Responsable sintética')).toBeTruthy();
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

  it('filtra por estado en el servidor y, sin resultados, ofrece quitar el filtro', async () => {
    render();
    await screen.findByTestId('call-row-c-1');
    vi.mocked(jointPurchaseCallsService.list).mockResolvedValue([]);
    fireEvent.click(within(screen.getByTestId('call-status-filter')).getByRole('button', { name: 'Cancelada' }));
    expect((await screen.findByTestId('calls-no-match')).textContent).toMatch(/«Cancelada»/);
    expect(jointPurchaseCallsService.list).toHaveBeenLastCalledWith({ campaignId: CAMPAIGN.id, status: 'CANCELLED' });
  });

  it('nuevo borrador: valida los campos, avisa qué podrá ver el responsable, crea con productos del catálogo y navega por el call_id de la respuesta', async () => {
    vi.mocked(jointPurchaseCallsService.create).mockResolvedValue(CREATED);
    render();
    await screen.findByTestId('call-row-c-1');
    fireEvent.click(screen.getByRole('button', { name: 'Nueva convocatoria' }));
    expect(within(dialog()).getByTestId('responsible-notice').textContent).toBe(RESPONSIBLE_NOTICE);
    expect(within(dialog()).getByText(/Hora del servidor del sindicato/)).toBeTruthy();

    fireEvent.click(within(dialog()).getByRole('button', { name: 'Crear borrador' }));
    expect(within(dialog()).getByText('Escriba el nombre de la convocatoria.')).toBeTruthy();
    expect(within(dialog()).getByText('Elija la fecha y hora límite.')).toBeTruthy();
    expect(within(dialog()).getByText('Elija el responsable.')).toBeTruthy();
    expect(within(dialog()).getByText('Elija al menos un producto.')).toBeTruthy();
    expect(jointPurchaseCallsService.create).not.toHaveBeenCalled();

    // Una fecha pasada tampoco se envía.
    fireEvent.change(within(dialog()).getByLabelText('Fecha y hora límite'), { target: { value: '2020-01-01T10:00' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Crear borrador' }));
    expect(within(dialog()).getByText('La fecha límite debe ser posterior a este momento.')).toBeTruthy();

    fireEvent.change(within(dialog()).getByLabelText('Nombre'), { target: { value: '  Herbicidas de verano ' } });
    fireEvent.change(within(dialog()).getByLabelText('Fecha y hora límite'), { target: { value: '2099-12-01T18:00' } });
    await waitFor(() => expect(within(dialog()).getByRole('option', { name: 'Administrador sintético · Administrador' })).toBeTruthy());
    fireEvent.change(within(dialog()).getByLabelText('Responsable'), { target: { value: 'u-3' } });

    // Catálogo: sin inactivos, sin unidades que no sean L/KG y sin denominaciones asociadas.
    const list = await within(dialog()).findByRole('list', { name: 'Productos del catálogo' });
    const names = within(list).getAllByRole('checkbox').map((box) => box.closest('label')!.textContent);
    expect(names).toEqual(['Glifosato 48 SL (L)', 'Urea (KG)']);
    fireEvent.click(within(list).getByRole('checkbox', { name: /Urea/ }));

    fireEvent.click(within(dialog()).getByRole('button', { name: 'Crear borrador' }));
    await waitFor(() =>
      expect(jointPurchaseCallsService.create).toHaveBeenCalledWith({
        campaign_id: CAMPAIGN.id,
        name: 'Herbicidas de verano',
        deadline_at: new Date('2099-12-01T18:00').toISOString(),
        responsible_user_id: 'u-3',
        products: [{ product_ref: 'p-3' }],
      }),
    );
    const probe = await screen.findByTestId('detail-probe');
    expect(probe.textContent).toBe('detalle de la convocatoria c-9');
    expect(probe.getAttribute('data-message')).toMatch(/Borrador «Herbicidas de verano» creado/);
  });

  it('productos de un borrador de propuesta: la cifra es sólo «referencia» divulgada, nunca una cantidad comprometida', async () => {
    vi.mocked(jointPurchaseCallsService.create).mockResolvedValue({ ...CREATED, source_proposal_ref: 'pr-1' });
    render();
    await screen.findByTestId('call-row-c-1');
    fireEvent.click(screen.getByRole('button', { name: 'Nueva convocatoria' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Tomar productos de un borrador de propuesta' }));
    const select = await within(dialog()).findByLabelText('Borrador de propuesta');
    fireEvent.change(select, { target: { value: 'pr-1' } });
    expect(collectiveService.proposals).toHaveBeenCalledWith(CAMPAIGN.id);

    const disclosed = await within(dialog()).findByTestId('proposal-line-0');
    expect(disclosed.textContent).toMatch(/Referencia del borrador: 120 L \(divulgada\)/);
    const suppressed = within(dialog()).getByTestId('proposal-line-1');
    expect(suppressed.textContent).toMatch(/Sin cifra divulgada/);
    for (const node of [disclosed, suppressed]) expect(node.textContent).not.toMatch(/comprometid|comprad|pedid/i);
    expect(within(dialog()).getByTestId('proposal-reference-note').textContent).toMatch(/sólo como referencia/);

    fireEvent.click(within(disclosed).getByRole('checkbox'));
    fireEvent.change(within(dialog()).getByLabelText('Nombre'), { target: { value: 'Desde el borrador' } });
    fireEvent.change(within(dialog()).getByLabelText('Fecha y hora límite'), { target: { value: '2099-12-01T18:00' } });
    await waitFor(() => expect(within(dialog()).getByRole('option', { name: 'Responsable sintética · Directiva' })).toBeTruthy());
    fireEvent.change(within(dialog()).getByLabelText('Responsable'), { target: { value: 'u-2' } });
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
    await waitFor(() => expect(within(dialog()).getByRole('option', { name: 'Responsable sintética · Directiva' })).toBeTruthy());
    fireEvent.change(within(dialog()).getByLabelText('Responsable'), { target: { value: 'u-2' } });
    fireEvent.click(await within(dialog()).findByRole('checkbox', { name: /Glifosato 48 SL/ }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Crear borrador' }));
    expect(await within(dialog()).findByText(/no es un usuario activo de la Directiva o la Administración/)).toBeTruthy();
    expect(screen.queryByTestId('detail-probe')).toBeNull();
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
