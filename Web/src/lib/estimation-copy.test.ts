import { beforeEach, describe, expect, it } from 'vitest';
import type { InstitutionalDownload } from '../types/estimation';
import {
  discardAllCopies,
  discardCopies,
  listCopies,
  memoryBackend,
  readCopy,
  retainOnly,
  saveCopy,
  setActiveIdentity,
  setCopyBackend,
  type CopyOwner,
} from './estimation-copy';

/** Respuestas sintéticas de `GET /download` (INT-09, perfil institucional). */
const A: CopyOwner = { userId: 'u-a', tenantId: 't-1', name: 'Directiva sintética A', tenantName: 'Sindicato sintético', role: 'DIRECTIVA' };
const B: CopyOwner = { userId: 'u-b', tenantId: 't-1', name: 'Directiva sintética B', tenantName: 'Sindicato sintético', role: 'DIRECTIVA' };
const OTHER_TENANT: CopyOwner = { ...A, tenantId: 't-2', tenantName: 'Otro sindicato sintético' };

function download(overrides: Partial<InstitutionalDownload> = {}, target = 'c-1'): InstitutionalDownload {
  return {
    contract_version: 1,
    kind: 'ESTIMATION_DOWNLOAD',
    profile: 'INSTITUTIONAL',
    scope: { tenant_ref: 't-1' },
    subject: { member_ref: 'm-a', role: 'DIRECTIVA' },
    downloaded_at: '2026-11-02T18:00:00.000Z',
    target: { campaign_ref: target, name: 'Objetivo sintético', status: 'PLANIFICADA', start_date: '2019-09-01T00:00:00.000Z', end_date: null },
    season: { season_ref: 's-1', key: 'INVIERNO', definition: 'Temporada sintética', duration_days: 180 },
    results: [],
    may_be_outdated: true,
    notice: 'Aviso fijo del servicio.',
    storage: { backup: 'EXCLUDED_FROM_PRIVATE_BACKUP', discard_on: ['IDENTITY_CHANGE', 'SIGN_OUT'], replace_only_with: 'NEWER_SAME_SUBJECT_AND_SCOPE' },
    ...overrides,
  };
}

describe('copia de la estimación sin conexión (F12-EST-07-WEB, #180)', () => {
  beforeEach(() => {
    setCopyBackend(memoryBackend());
    setActiveIdentity(A);
  });

  it('guarda para la identidad de la sesión y sólo esa identidad la lee', async () => {
    expect(await saveCopy(A, download())).toBe('SAVED');
    expect((await readCopy(A, 'c-1'))?.download.downloaded_at).toBe('2026-11-02T18:00:00.000Z');
    expect(await readCopy(B, 'c-1')).toBeNull();
    expect(await readCopy(OTHER_TENANT, 'c-1')).toBeNull();
    expect(await listCopies(B)).toEqual([]);
    expect((await listCopies(A)).map((c) => c.owner.userId)).toEqual(['u-a']);
  });

  it('una descarga que responde cuando la sesión ya es otra no se guarda para nadie', async () => {
    setActiveIdentity(B);
    expect(await saveCopy(A, download())).toBe('IDENTITY_CHANGED');
    setActiveIdentity(null);
    expect(await saveCopy(A, download())).toBe('IDENTITY_CHANGED');
    expect(await listCopies(null)).toEqual([]);
  });

  it('no guarda otro perfil, otro sindicato ni otro formato', async () => {
    const farmer = { ...download(), profile: 'FARMER' } as unknown as InstitutionalDownload;
    expect(await saveCopy(A, farmer)).toBe('NOT_INSTITUTIONAL');
    expect(await saveCopy(A, download({ scope: { tenant_ref: 't-2' } }))).toBe('OTHER_SCOPE');
    expect(await saveCopy(A, { ...download(), contract_version: 2 } as unknown as InstitutionalDownload)).toBe('UNSUPPORTED');
    expect(await listCopies(null)).toEqual([]);
  });

  it('sólo se reemplaza por una descarga más reciente de la misma identidad y campaña', async () => {
    await saveCopy(A, download());
    expect(await saveCopy(A, download({ downloaded_at: '2026-11-02T17:00:00.000Z' }))).toBe('KEPT_NEWER');
    expect(await saveCopy(A, download({ downloaded_at: '2026-11-02T18:00:00.000Z' }))).toBe('KEPT_NEWER');
    expect(await saveCopy(A, download({ downloaded_at: '2026-11-02T19:00:00.000Z' }))).toBe('SAVED');
    expect((await readCopy(A, 'c-1'))?.download.downloaded_at).toBe('2026-11-02T19:00:00.000Z');
  });

  it('se borra al cambiar de identidad, ante un rechazo y al cerrar la sesión', async () => {
    await saveCopy(A, download());
    await saveCopy(A, download({}, 'c-2'));
    await discardCopies(A, 'c-2');
    expect((await listCopies(A)).map((c) => c.download.target.campaign_ref)).toEqual(['c-1']);
    await retainOnly(B);
    expect(await listCopies(null)).toEqual([]);
    setActiveIdentity(B);
    await saveCopy(B, download());
    await discardAllCopies();
    expect(await listCopies(null)).toEqual([]);
  });

  it('guarda la respuesta del servidor y la identidad, nunca credenciales', async () => {
    await saveCopy(A, download());
    const stored = JSON.stringify(await listCopies(null));
    expect(stored).not.toMatch(/token|password|contraseña|authorization|bearer/i);
    expect(JSON.parse(stored)[0]).toMatchObject({ format_version: 1, owner: { userId: 'u-a', tenantId: 't-1' } });
  });
});
