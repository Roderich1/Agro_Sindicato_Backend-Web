import { act, render, waitFor } from '@testing-library/react';
import axios, { AxiosError, AxiosHeaders } from 'axios';
import { useContext, useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  currentContext,
  memoryBackend,
  openContext,
  purgePending,
  readableCopies,
  saveCopy,
  setCopyBackend,
  type CopyBackend,
} from '../lib/estimation-copy';
import { api } from '../lib/axios';
import { userWith } from '../test/render';
import type { InstitutionalDownload } from '../types/estimation';
import { AuthContext, AuthProvider, type AuthContextValue } from './auth.context';

/**
 * F12-EST-07-WEB (#180): el contexto local de la copia sigue a la sesión que
 * acepta el servidor. Datos sintéticos; el servidor se simula.
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
let memory: CopyBackend;

describe('el contexto local de la copia sigue a la sesión (F12-EST-07-WEB, #180)', () => {
  beforeEach(async () => {
    localStorage.clear();
    memory = memoryBackend();
    setCopyBackend(memory);
    await saveCopy(openContext(OWNER)!.id, OWNER, download);
  });
  afterEach(() => vi.restoreAllMocks());

  it('la misma identidad institucional conserva su contexto y su copia', async () => {
    const before = currentContext()!.id;
    vi.spyOn(axios, 'post').mockResolvedValue(refreshed('DIRECTIVA'));
    mount();
    await waitFor(() => expect(auth?.user?.id).toBe('u-1'));
    expect(currentContext()?.id).toBe(before);
    expect(await readableCopies(null)).toHaveLength(1);
  });

  it('otra identidad u otro sindicato: la copia anterior deja de ser legible al instante y se borra', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue(refreshed('DIRECTIVA', 'u-1', 't-2'));
    mount();
    await waitFor(() => expect(auth?.user?.tenantId).toBe('t-2'));
    expect(await readableCopies(null)).toEqual([]);
    await waitFor(async () => expect(await memory.list()).toEqual([]));
  });

  it('rol degradado mientras la copia aún existe: no es legible aunque el borrado siga pendiente', async () => {
    setCopyBackend({ ...memory, delete: () => new Promise<void>(() => undefined) });
    vi.spyOn(axios, 'post').mockResolvedValue(refreshed('AGRICULTOR'));
    mount();
    await waitFor(() => expect(auth?.user?.role).toBe('AGRICULTOR'));
    expect(currentContext()).toBeNull();
    expect(await readableCopies(null)).toEqual([]);
    expect(await memory.list()).toHaveLength(1);
  });

  it('una sesión rechazada (401) cierra el contexto; sin conexión se conserva para leer la copia', async () => {
    vi.spyOn(axios, 'post').mockRejectedValueOnce(rejected(null));
    const first = mount();
    await waitFor(() => expect(auth?.isLoading).toBe(false));
    expect(await readableCopies(null)).toHaveLength(1);
    first.unmount();
    vi.spyOn(axios, 'post').mockRejectedValueOnce(rejected(401));
    mount();
    await waitFor(() => expect(currentContext()).toBeNull());
    expect(await readableCopies(null)).toEqual([]);
  });

  it('sesión cerrada con borrado fallido: el acceso se retira, el borrado queda pendiente y no se da por hecho', async () => {
    setCopyBackend({ ...memory, delete: () => Promise.reject(new Error('IndexedDB no disponible')) });
    vi.spyOn(axios, 'post').mockResolvedValue(refreshed('DIRECTIVA'));
    vi.spyOn(api, 'post').mockRejectedValue(rejected(null));
    mount();
    await waitFor(() => expect(auth?.user?.id).toBe('u-1'));
    await act(async () => {
      await auth!.logout().catch(() => undefined);
    });
    expect(currentContext()).toBeNull();
    expect(await readableCopies(null)).toEqual([]);
    expect(purgePending()).toBe(true);
    expect(await memory.list()).toHaveLength(1);
    // La siguiente carga reintenta el borrado pendiente.
    setCopyBackend(memory);
    vi.spyOn(axios, 'post').mockRejectedValueOnce(rejected(null));
    mount();
    await waitFor(() => expect(purgePending()).toBe(false));
    expect(await memory.list()).toEqual([]);
  });
});
