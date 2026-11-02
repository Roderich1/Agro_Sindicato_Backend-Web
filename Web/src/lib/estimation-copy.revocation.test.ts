import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InstitutionalDownload } from '../types/estimation';
import type { CopyBackend, CopyOwner } from './estimation-copy';

/**
 * F12-EST-07-WEB (#180): la retirada por 404 de una campaña sobrevive a una
 * recarga aunque el borrado de su copia falle. La recarga se emula con un
 * módulo nuevo (`vi.resetModules`): se pierde todo lo que vivía en memoria y
 * quedan `localStorage` y el almacén de copias.
 */
const A: CopyOwner = { userId: 'u-a', tenantId: 't-1', name: 'Directiva sintética A', tenantName: 'Sindicato sintético', role: 'DIRECTIVA' };
const B: CopyOwner = { userId: 'u-b', tenantId: 't-1', name: 'Directiva sintética B', tenantName: 'Sindicato sintético', role: 'DIRECTIVA' };
const A_OTHER_TENANT: CopyOwner = { ...A, tenantId: 't-2', tenantName: 'Otro sindicato sintético' };
const session = (owner: CopyOwner) => ({ userId: owner.userId, tenantId: owner.tenantId, role: owner.role });

function download(target: string, tenant = 't-1', downloadedAt = '2026-11-02T18:00:00.000Z'): InstitutionalDownload {
  return {
    contract_version: 1,
    kind: 'ESTIMATION_DOWNLOAD',
    profile: 'INSTITUTIONAL',
    scope: { tenant_ref: tenant },
    subject: { member_ref: 'm-a', role: 'DIRECTIVA' },
    downloaded_at: downloadedAt,
    target: { campaign_ref: target, name: 'Objetivo sintético', status: 'PLANIFICADA', start_date: '2019-09-01T00:00:00.000Z', end_date: null },
    season: { season_ref: 's-1', key: 'INVIERNO', definition: 'Temporada sintética', duration_days: 180 },
    results: [],
    may_be_outdated: true,
    notice: 'Aviso fijo del servicio.',
    storage: { backup: 'EXCLUDED_FROM_PRIVATE_BACKUP', discard_on: ['IDENTITY_CHANGE', 'SIGN_OUT'], replace_only_with: 'NEWER_SAME_SUBJECT_AND_SCOPE' },
  };
}

type CopyModule = typeof import('./estimation-copy');
let copies: CopyModule;
let memory: CopyBackend;
/** El almacén con el borrado roto: lo que inyecta el fallo de IndexedDB en estas pruebas. */
const brokenDelete = () => ({ ...memory, delete: () => Promise.reject(new Error('IndexedDB no disponible')) });

/** Recarga de la página: módulo nuevo, mismo `localStorage` y mismo almacén. */
async function reload(backend: CopyBackend) {
  vi.resetModules();
  copies = await import('./estimation-copy');
  copies.setCopyBackend(backend);
}

/** Pide la copia con el contexto vigente y la guarda (descarga autorizada por el servidor). */
async function authorizedDownload(owner: CopyOwner, target: string, downloadedAt?: string) {
  const context = copies.currentContext()!;
  return copies.saveCopy(context, owner, download(target, owner.tenantId, downloadedAt));
}

const campaigns = async () => (await copies.readableCopies(null)).map((c) => c.download.target.campaign_ref).sort();

describe('retirada persistente por 404 (F12-EST-07-WEB, #180)', () => {
  beforeEach(async () => {
    localStorage.clear();
    vi.resetModules();
    copies = await import('./estimation-copy');
    memory = copies.memoryBackend();
    copies.setCopyBackend(memory);
    copies.openContext(A);
    await authorizedDownload(A, 'c-1');
    await authorizedDownload(A, 'c-2');
  });

  it('copia legible → 404 → borrado fallido → recarga sin conexión: la campaña retirada sigue inaccesible', async () => {
    expect(await copies.readCopy(session(A), 'c-2')).not.toBeNull();
    copies.setCopyBackend(brokenDelete());
    copies.revokeTarget('c-2');
    expect(await copies.purgeInaccessibleCopies()).toEqual({ deleted: 0, failed: 1 });
    await reload(brokenDelete());
    // Sin sesión en memoria: recarga sin conexión, sólo con el contexto local.
    expect(await copies.readCopy(null, 'c-2')).toBeNull();
    expect(await campaigns()).toEqual(['c-1']);
    // Sigue físicamente almacenada: sólo se impidió el acceso.
    expect((await memory.list()).map((c) => c.download.target.campaign_ref).sort()).toEqual(['c-1', 'c-2']);
    expect(copies.purgePending()).toBe(true);
  });

  it('una escritura tardía, pedida antes del 404, no anula la retirada ni tras recargar', async () => {
    let release: () => void = () => undefined;
    copies.setCopyBackend({ ...memory, put: (copy) => new Promise<void>((done) => (release = () => void memory.put(copy).then(done))) });
    const late = authorizedDownload(A, 'c-2', '2026-11-02T19:00:00.000Z');
    await new Promise((r) => setTimeout(r, 5));
    copies.revokeTarget('c-2');
    release();
    await late;
    expect((await memory.get('u-a|t-1|c-2'))?.download.downloaded_at).toBe('2026-11-02T19:00:00.000Z');
    expect(await campaigns()).toEqual(['c-1']);
    await reload(brokenDelete());
    expect(await copies.readCopy(null, 'c-2')).toBeNull();
    expect(await campaigns()).toEqual(['c-1']);
  });

  it('una descarga pedida antes del 404 y respondida después no se guarda (TARGET_REVOKED)', async () => {
    const requested = copies.currentContext()!;
    copies.revokeTarget('c-2');
    expect(await copies.saveCopy(requested, A, download('c-2', 't-1', '2026-11-02T19:00:00.000Z'))).toBe('TARGET_REVOKED');
    // Otra campaña del mismo contexto se sigue guardando.
    expect(await copies.saveCopy(requested, A, download('c-3'))).toBe('SAVED');
    // Si el 404 llega mientras se consulta la copia existente, tampoco se escribe.
    let release: () => void = () => undefined;
    const fresh = copies.currentContext()!;
    copies.setCopyBackend({ ...memory, get: (key) => new Promise((done) => (release = () => void memory.get(key).then(done))) });
    const pending = copies.saveCopy(fresh, A, download('c-1', 't-1', '2026-11-02T20:00:00.000Z'));
    await new Promise((r) => setTimeout(r, 5));
    copies.revokeTarget('c-1');
    release();
    expect(await pending).toBe('TARGET_REVOKED');
    expect((await memory.get('u-a|t-1|c-1'))?.download.downloaded_at).toBe('2026-11-02T18:00:00.000Z');
    expect((await memory.get('u-a|t-1|c-2'))?.download.downloaded_at).toBe('2026-11-02T18:00:00.000Z');
  });

  it('el reintento de limpieza borra la copia retirada cuando el almacenamiento vuelve a funcionar', async () => {
    copies.setCopyBackend(brokenDelete());
    copies.revokeTarget('c-2');
    await copies.purgeInaccessibleCopies();
    await reload(memory);
    expect(await copies.purgeInaccessibleCopies()).toEqual({ deleted: 1, failed: 0 });
    expect(copies.purgePending()).toBe(false);
    expect((await memory.list()).map((c) => c.download.target.campaign_ref)).toEqual(['c-1']);
    expect(await campaigns()).toEqual(['c-1']);
  });

  it('una descarga posterior autorizada por el servidor vuelve a habilitar una copia de esa campaña', async () => {
    copies.setCopyBackend(brokenDelete());
    copies.revokeTarget('c-2');
    await reload(brokenDelete());
    expect(await authorizedDownload(A, 'c-2', '2026-11-02T17:00:00.000Z')).toBe('SAVED');
    expect((await copies.readCopy(null, 'c-2'))?.download.downloaded_at).toBe('2026-11-02T17:00:00.000Z');
    await reload(memory);
    expect(await campaigns()).toEqual(['c-1', 'c-2']);
  });

  it('un registro manipulado con una generación posterior a la del contexto no elude la retirada', async () => {
    copies.revokeTarget('c-2');
    const stored = (await memory.get('u-a|t-1|c-2'))!;
    await memory.put({ ...stored, generation: 99 });
    expect(await copies.readCopy(null, 'c-2')).toBeNull();
    expect(await campaigns()).toEqual(['c-1']);
  });

  it('otras identidades y sindicatos siguen aislados; la retirada no pasa de un contexto a otro', async () => {
    copies.setCopyBackend(brokenDelete());
    copies.revokeTarget('c-2');
    await reload(brokenDelete());
    for (const other of [B, A_OTHER_TENANT]) {
      copies.openContext(other);
      expect(await campaigns()).toEqual([]);
      expect(await authorizedDownload(other, 'c-2')).toBe('SAVED');
      expect(await campaigns()).toEqual(['c-2']);
      expect((await copies.readCopy(session(other), 'c-2'))?.owner.userId).toBe(other.userId);
    }
    copies.openContext(A);
    expect(await campaigns()).toEqual([]);
  });
});
