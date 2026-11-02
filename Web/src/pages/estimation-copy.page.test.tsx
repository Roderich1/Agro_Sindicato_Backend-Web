import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { memoryBackend, saveCopy, setActiveIdentity, setCopyBackend } from '../lib/estimation-copy';
import { renderAt } from '../test/render';
import type { InstitutionalDownload } from '../types/estimation';
import { EstimationCopyPage } from './estimation-copy.page';

const PATH = '/estimacion/copia-sin-conexion';
const OWNER = { userId: 'u-1', tenantId: 't-1', name: 'Usuario sintético', tenantName: 'Sindicato sintético', role: 'DIRECTIVA' };

/** Una copia sintética de `GET /download` (perfil institucional). */
const copy = (target: string, name: string): InstitutionalDownload => ({
  contract_version: 1,
  kind: 'ESTIMATION_DOWNLOAD',
  profile: 'INSTITUTIONAL',
  scope: { tenant_ref: 't-1' },
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

describe('lectura sin conexión de la copia (F12-EST-07-WEB, #180)', () => {
  beforeEach(() => {
    setCopyBackend(memoryBackend());
    setActiveIdentity(OWNER);
  });

  it('tras recargar sin sesión comprobada muestra la copia guardada, sin pedir nada al servidor', async () => {
    await saveCopy(OWNER, copy('c-1', 'Objetivo sintético invierno'));
    renderAt(<EstimationCopyPage />, { role: '', path: PATH });
    const view = await screen.findByTestId('copy-c-1');
    expect(within(view).getByTestId('copy-estimate').textContent).toBe('111 L111.000 mL');
    expect(within(view).getByTestId('copy-current').textContent).toBe('Desconocida sin conexión');
    expect(screen.getByRole('link', { name: 'Iniciar sesión (requiere conexión)' })).toBeTruthy();
  });

  it('con una sesión en curso sólo muestra sus copias, nunca las de otra identidad', async () => {
    const other = { ...OWNER, userId: 'u-otra', name: 'Otra identidad sintética' };
    setActiveIdentity(other);
    await saveCopy(other, copy('c-2', 'Objetivo de otra identidad'));
    setActiveIdentity(OWNER);
    // La sesión simulada es u-1 en t-1.
    renderAt(<EstimationCopyPage />, { role: 'DIRECTIVA', path: PATH });
    expect(await screen.findByTestId('copy-none')).toBeTruthy();
    expect(screen.queryByTestId('copy-c-2')).toBeNull();
  });

  it('sin copia: lo dice y no muestra ninguna cifra', async () => {
    renderAt(<EstimationCopyPage />, { role: '', path: PATH });
    expect((await screen.findByTestId('copy-none')).textContent).toMatch(/No hay una estimación descargada.*ninguna cifra/);
    expect(screen.queryByText(/ L/)).toBeNull();
  });
});
