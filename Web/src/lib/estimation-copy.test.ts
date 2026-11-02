import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InstitutionalDownload } from '../types/estimation';
import {
  closeContext,
  currentContext,
  memoryBackend,
  openContext,
  purgeInaccessibleCopies,
  purgePending,
  readableCopies,
  readCopy,
  revokeTarget,
  rotateContext,
  saveCopy,
  setCopyBackend,
  type CopyBackend,
  type CopyOwner,
} from './estimation-copy';

/** Respuestas sintéticas de `GET /download` (INT-09, perfil institucional). */
const A: CopyOwner = { userId: 'u-a', tenantId: 't-1', name: 'Directiva sintética A', tenantName: 'Sindicato sintético', role: 'DIRECTIVA' };
const B: CopyOwner = { userId: 'u-b', tenantId: 't-1', name: 'Directiva sintética B', tenantName: 'Sindicato sintético', role: 'DIRECTIVA' };
const A_OTHER_TENANT: CopyOwner = { ...A, tenantId: 't-2', tenantName: 'Otro sindicato sintético' };
const session = (owner: CopyOwner, role = owner.role) => ({ userId: owner.userId, tenantId: owner.tenantId, role });

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

let memory: CopyBackend;
/** Guarda en el contexto vigente de `owner`. */
async function saveAs(owner: CopyOwner, body = download()) {
  const context = openContext(owner)!;
  return saveCopy(context.id, owner, body);
}

describe('copia de la estimación sin conexión: acceso por contexto local (F12-EST-07-WEB, #180)', () => {
  beforeEach(() => {
    localStorage.clear();
    memory = memoryBackend();
    setCopyBackend(memory);
  });
  afterEach(() => vi.restoreAllMocks());

  it('sin contexto local no se lee ni se enumera nada, aunque haya copias en IndexedDB', async () => {
    await saveAs(A);
    closeContext();
    expect(await memory.list()).toHaveLength(1);
    expect(await readableCopies(null)).toEqual([]);
    expect(await readCopy(null, 'c-1')).toBeNull();
  });

  it('con el contexto de la sesión propietaria se lee también sin sesión en memoria (recarga sin conexión)', async () => {
    await saveAs(A);
    expect((await readableCopies(null)).map((c) => c.owner.userId)).toEqual(['u-a']);
    expect((await readCopy(session(A), 'c-1'))?.download.downloaded_at).toBe('2026-11-02T18:00:00.000Z');
  });

  it('otra identidad, otro sindicato o un rol no institucional no leen la copia', async () => {
    await saveAs(A);
    expect(await readableCopies(session(B))).toEqual([]);
    expect(await readableCopies(session(A_OTHER_TENANT))).toEqual([]);
    expect(await readableCopies(session(A, 'AGRICULTOR'))).toEqual([]);
    // Abrir el contexto de otra identidad o sindicato invalida el anterior al instante.
    openContext(A_OTHER_TENANT);
    expect(await readableCopies(null)).toEqual([]);
    openContext(A);
    expect(await readableCopies(null)).toEqual([]);
  });

  it('un rol conocido sin permiso institucional cierra el contexto: no lee mientras el borrado sigue pendiente', async () => {
    await saveAs(A);
    setCopyBackend({ ...memory, delete: () => new Promise<void>(() => undefined) });
    expect(openContext({ ...A, role: 'AGRICULTOR' })).toBeNull();
    void purgeInaccessibleCopies();
    expect(currentContext()).toBeNull();
    expect(await readableCopies(null)).toEqual([]);
    expect(await memory.list()).toHaveLength(1);
  });

  it('cerrar la sesión invalida el acceso aunque el borrado físico falle; el fallo queda pendiente y se reintenta', async () => {
    await saveAs(A);
    setCopyBackend({ ...memory, delete: () => Promise.reject(new Error('IndexedDB no disponible')) });
    closeContext();
    expect(await purgeInaccessibleCopies()).toEqual({ deleted: 0, failed: 1 });
    expect(purgePending()).toBe(true);
    expect(await memory.list()).toHaveLength(1);
    expect(await readableCopies(null)).toEqual([]);
    setCopyBackend(memory);
    expect(await purgeInaccessibleCopies()).toEqual({ deleted: 1, failed: 0 });
    expect(purgePending()).toBe(false);
    expect(await memory.list()).toEqual([]);
  });

  it('si ni siquiera se pueden listar las copias, el borrado queda pendiente y el acceso ya está retirado', async () => {
    await saveAs(A);
    closeContext();
    setCopyBackend({ ...memory, list: () => Promise.reject(new Error('IndexedDB no disponible')) });
    expect(await purgeInaccessibleCopies()).toEqual({ deleted: 0, failed: 1 });
    expect(purgePending()).toBe(true);
    setCopyBackend(memory);
    expect(await readableCopies(null)).toEqual([]);
  });

  it('una escritura tardía no reactiva una copia invalidada, ni aunque la misma identidad vuelva a entrar', async () => {
    let release: () => void = () => undefined;
    setCopyBackend({ ...memory, put: (copy) => new Promise<void>((done) => (release = () => void memory.put(copy).then(done))) });
    const context = openContext(A)!;
    const pending = saveCopy(context.id, A, download());
    await new Promise((r) => setTimeout(r, 5));
    closeContext();
    release();
    expect(await pending).toBe('SAVED');
    expect(await memory.list()).toHaveLength(1);
    expect(await readableCopies(null)).toEqual([]);
    openContext(A);
    expect(await readableCopies(null)).toEqual([]);
  });

  it('una descarga pedida en un contexto que ya cambió no se guarda', async () => {
    const before = openContext(A)!;
    openContext(B);
    expect(await saveCopy(before.id, A, download())).toBe('CONTEXT_CHANGED');
    closeContext();
    expect(await saveCopy(before.id, A, download())).toBe('CONTEXT_CHANGED');
    expect(await memory.list()).toEqual([]);
  });

  it('política pendiente: contexto nuevo; lo anterior deja de leerse y se puede volver a descargar', async () => {
    await saveAs(A);
    rotateContext();
    expect(await readableCopies(null)).toEqual([]);
    const renewed = currentContext()!;
    expect(await saveCopy(renewed.id, A, download())).toBe('SAVED');
    expect(await readableCopies(null)).toHaveLength(1);
  });

  it('un 404 revoca la copia de esa campaña mientras la página sigue abierta, aunque su borrado falle', async () => {
    await saveAs(A);
    await saveAs(A, download({}, 'c-2'));
    setCopyBackend({ ...memory, delete: () => Promise.reject(new Error('IndexedDB no disponible')) });
    revokeTarget('c-2');
    void purgeInaccessibleCopies();
    expect((await readableCopies(null)).map((c) => c.download.target.campaign_ref)).toEqual(['c-1']);
  });

  it('no guarda otro perfil, otro sindicato ni otro formato', async () => {
    const context = openContext(A)!;
    const farmer = { ...download(), profile: 'FARMER' } as unknown as InstitutionalDownload;
    expect(await saveCopy(context.id, A, farmer)).toBe('NOT_INSTITUTIONAL');
    expect(await saveCopy(context.id, A, download({ scope: { tenant_ref: 't-2' } }))).toBe('OTHER_SCOPE');
    expect(await saveCopy(context.id, A, { ...download(), contract_version: 2 } as unknown as InstitutionalDownload)).toBe('UNSUPPORTED');
    expect(await memory.list()).toEqual([]);
  });

  it('sólo se reemplaza por una más reciente del mismo contexto; una copia de un contexto anterior no lo impide', async () => {
    const context = openContext(A)!;
    await saveCopy(context.id, A, download());
    expect(await saveCopy(context.id, A, download({ downloaded_at: '2026-11-02T17:00:00.000Z' }))).toBe('KEPT_NEWER');
    expect(await saveCopy(context.id, A, download({ downloaded_at: '2026-11-02T19:00:00.000Z' }))).toBe('SAVED');
    closeContext();
    const next = openContext(A)!;
    expect(await saveCopy(next.id, A, download({ downloaded_at: '2026-11-02T10:00:00.000Z' }))).toBe('SAVED');
    expect((await readCopy(session(A), 'c-1'))?.download.downloaded_at).toBe('2026-11-02T10:00:00.000Z');
  });

  it('sin localStorage no hay contexto: no se guarda ni se lee nada', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('almacenamiento no disponible');
    });
    expect(openContext(A)).toBeNull();
    expect(await readableCopies(null)).toEqual([]);
  });

  it('en localStorage sólo van identificadores validados y el rol; un identificador con otra forma no abre contexto', async () => {
    openContext(A);
    expect(Object.keys(JSON.parse(localStorage.getItem('agro_estimacion_contexto_v1')!)).sort()).toEqual(['id', 'opened_at', 'role', 'tenantId', 'userId', 'version']);
    expect(openContext({ ...A, userId: '<script>' })).toBeNull();
    expect(currentContext()).toBeNull();
  });

  it('ni la copia ni el contexto contienen credenciales', async () => {
    await saveAs(A);
    const stored = JSON.stringify([await memory.list(), localStorage.getItem('agro_estimacion_contexto_v1')]);
    expect(stored).not.toMatch(/token|password|contraseña|authorization|bearer|pin/i);
  });
});
