import { act, render, waitFor } from '@testing-library/react';
import axios, { AxiosError, AxiosHeaders } from 'axios';
import { useContext, useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listCopies, memoryBackend, saveCopy, setActiveIdentity, setCopyBackend } from '../lib/estimation-copy';
import { api } from '../lib/axios';
import { userWith } from '../test/render';
import type { InstitutionalDownload } from '../types/estimation';
import { AuthContext, AuthProvider, type AuthContextValue } from './auth.context';

/**
 * F12-EST-07-WEB (#180): la copia de la estimación sigue a la sesión. Datos
 * sintéticos; el servidor se simula.
 */
const OWNER = { userId: 'u-1', tenantId: 't-1', name: 'Usuario sintético', tenantName: 'Sindicato sintético', role: 'DIRECTIVA' };
const download: InstitutionalDownload = {
  contract_version: 1, kind: 'ESTIMATION_DOWNLOAD', profile: 'INSTITUTIONAL', scope: { tenant_ref: 't-1' }, subject: { member_ref: 'm-1', role: 'DIRECTIVA' },
  downloaded_at: '2026-11-02T16:00:00.000Z',
  target: { campaign_ref: 'c-1', name: 'Objetivo sintético', status: 'PLANIFICADA', start_date: '2019-09-01T00:00:00.000Z', end_date: null },
  season: null, results: [], may_be_outdated: true, notice: 'Aviso fijo del servicio.',
  storage: { backup: 'EXCLUDED_FROM_PRIVATE_BACKUP', discard_on: ['IDENTITY_CHANGE', 'SIGN_OUT'], replace_only_with: 'NEWER_SAME_SUBJECT_AND_SCOPE' },
};
const refreshed = (role: string, id = 'u-1', tenantId = 't-1') => ({ data: { accessToken: 'token-sintetico', user: { ...userWith(role), id, tenantId } } });
const rejected = (status: number | null) =>
  new AxiosError('x', 'ERR', undefined, undefined, status === null ? undefined : { status, statusText: '', headers: {}, config: { headers: new AxiosHeaders() }, data: {} });

let auth: AuthContextValue | null = null;
function Probe() {
  const value = useContext(AuthContext);
  useEffect(() => {
    auth = value;
  });
  return null;
}
const mount = () => render(<AuthProvider><Probe /></AuthProvider>);

describe('la copia sigue a la sesión (F12-EST-07-WEB, #180)', () => {
  beforeEach(async () => {
    setCopyBackend(memoryBackend());
    setActiveIdentity(OWNER);
    await saveCopy(OWNER, download);
  });
  afterEach(() => vi.restoreAllMocks());

  it('la misma identidad institucional conserva su copia', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue(refreshed('DIRECTIVA'));
    mount();
    await waitFor(() => expect(auth?.user?.id).toBe('u-1'));
    expect(await listCopies(null)).toHaveLength(1);
  });

  it('otra identidad u otro sindicato: la copia anterior se borra', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue(refreshed('DIRECTIVA', 'u-1', 't-2'));
    mount();
    await waitFor(async () => expect(await listCopies(null)).toEqual([]));
  });

  it('si el servidor ya no le da un rol institucional, su copia se borra', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue(refreshed('AGRICULTOR'));
    mount();
    await waitFor(async () => expect(await listCopies(null)).toEqual([]));
  });

  it('una sesión rechazada (401) borra la copia; sin conexión se conserva para leerla', async () => {
    vi.spyOn(axios, 'post').mockRejectedValueOnce(rejected(null));
    const first = mount();
    await waitFor(() => expect(auth?.isLoading).toBe(false));
    expect(await listCopies(null)).toHaveLength(1);
    first.unmount();
    vi.spyOn(axios, 'post').mockRejectedValueOnce(rejected(401));
    mount();
    await waitFor(async () => expect(await listCopies(null)).toEqual([]));
  });

  it('al cerrar la sesión se borra antes de avisar al servidor, aunque falle la red', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue(refreshed('DIRECTIVA'));
    vi.spyOn(api, 'post').mockRejectedValue(rejected(null));
    mount();
    await waitFor(() => expect(auth?.user?.id).toBe('u-1'));
    await act(async () => {
      await auth!.logout().catch(() => undefined);
    });
    expect(await listCopies(null)).toEqual([]);
    // Ya sin sesión, una descarga que llegue tarde no se guarda.
    expect(await saveCopy(OWNER, download)).toBe('IDENTITY_CHANGED');
  });
});
