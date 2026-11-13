import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { closeContext, memoryBackend, openContext, saveCopy, setCopyBackend, type CopyBackend } from '../lib/estimation-copy';
import { renderAt } from '../test/render';
import type { InstitutionalDownload } from '../types/estimation';
import { EstimationCopyPage } from './estimation-copy.page';

const PATH = '/estimacion/copia-sin-conexion';
const OWNER = { userId: 'u-1', tenantId: 't-1', name: 'Usuario sintético', tenantName: 'Sindicato sintético', role: 'DIRECTIVA' };

/** Una copia sintética de `GET /download` (perfil institucional). */
const copy = (target: string, name: string, tenant = 't-1'): InstitutionalDownload => ({
  contract_version: 1,
  kind: 'ESTIMATION_DOWNLOAD',
  profile: 'INSTITUTIONAL',
  scope: { tenant_ref: tenant },
  subject: { member_ref: 'm-1', role: 'DIRECTIVA' },
  downloaded_at: '2026-11-02T16:00:00.000Z',
  target: { campaign_ref: target, name, status: 'PLANIFICADA', start_date: '2019-09-01T00:00:00.000Z', end_date: null },
  season: null,
  results: [
    {
      product: { product_ref: 'p-1', name: 'Herbicida' }, base_unit: 'ML', presentation_unit: 'L', status: 'ESTIMATED', reason_code: null, method: 'SES_NAIVE',
      run_ref: 'r-1', generated_at: '2026-11-02T15:00:00.000Z', span_length: 4, estimate_base: '111000.000000', naive_base: '116000',
      coverage: { status: 'IDENTIFIED', campaigns: [] }, validity_at_download: 'CURRENT', validity_reason: null,
    },
  ],
  may_be_outdated: true,
  notice: 'Aviso fijo del servicio.',
  storage: { backup: 'EXCLUDED_FROM_PRIVATE_BACKUP', discard_on: ['IDENTITY_CHANGE', 'SIGN_OUT'], replace_only_with: 'NEWER_SAME_SUBJECT_AND_SCOPE' },
});

let memory: CopyBackend;
const saveAs = async (owner: typeof OWNER, body: InstitutionalDownload) => saveCopy(openContext(owner)!, owner, body);

describe('lectura sin conexión de la copia (F12-EST-07-WEB, #180)', () => {
  beforeEach(() => {
    localStorage.clear();
    memory = memoryBackend();
    setCopyBackend(memory);
  });

  it('recarga sin conexión con contexto local admisible: muestra la copia sin pedir nada al servidor', async () => {
    await saveAs(OWNER, copy('c-1', 'Objetivo sintético invierno'));
    renderAt(<EstimationCopyPage />, { role: '', path: PATH });
    const view = await screen.findByTestId('copy-c-1');
    expect(within(view).getByTestId('copy-estimate').textContent).toBe('111 L111.000 mL');
    expect(within(view).getByTestId('copy-current').textContent).toBe('Desconocida sin conexión');
    // Rediseño v2 (lámina 27): «Ir a Ingresar».
    expect(screen.getByRole('link', { name: 'Ir a Ingresar' })).toBeTruthy();
  });

  it('acceso directo sin contexto propietario: no muestra nada aunque queden copias en IndexedDB', async () => {
    await saveAs(OWNER, copy('c-1', 'Objetivo sintético invierno'));
    closeContext();
    expect(await memory.list()).toHaveLength(1);
    renderAt(<EstimationCopyPage />, { role: '', path: PATH });
    expect((await screen.findByTestId('copy-none')).textContent).toMatch(/No hay una copia accesible.*ninguna cifra/);
    expect(screen.queryByTestId('copy-c-1')).toBeNull();
    expect(screen.queryByText(/111 L/)).toBeNull();
  });

  it('con una sesión en memoria de otra identidad o sindicato no muestra la copia', async () => {
    await saveAs({ ...OWNER, userId: 'u-otra' }, copy('c-2', 'Objetivo de otra identidad'));
    renderAt(<EstimationCopyPage />, { role: 'DIRECTIVA', path: PATH });
    expect(await screen.findByTestId('copy-none')).toBeTruthy();
    expect(screen.queryByTestId('copy-c-2')).toBeNull();
  });

  it('un rol conocido sin permiso institucional no ve la copia mientras sigue en IndexedDB', async () => {
    await saveAs(OWNER, copy('c-1', 'Objetivo sintético invierno'));
    // El contexto sigue siendo del mismo usuario y sindicato, pero la sesión en memoria es de Agricultor.
    renderAt(<EstimationCopyPage />, { role: 'AGRICULTOR', path: PATH });
    expect(await screen.findByTestId('copy-none')).toBeTruthy();
    expect(screen.queryByText(/111 L/)).toBeNull();
  });

  it('sin copia en el contexto: lo dice y no muestra ninguna cifra', async () => {
    openContext(OWNER);
    renderAt(<EstimationCopyPage />, { role: '', path: PATH });
    expect((await screen.findByTestId('copy-none')).textContent).toMatch(/ninguna cifra/);
    expect(screen.queryByText(/ L/)).toBeNull();
  });
});
