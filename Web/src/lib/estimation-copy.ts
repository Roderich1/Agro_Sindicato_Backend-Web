import type { InstitutionalDownload } from '../types/estimation';

/**
 * F12-EST-07-WEB (#180; RF-40, RN-30, DAT-20; contrato §9): la copia de la
 * estimación para consultar sin conexión, en IndexedDB de este navegador.
 *
 * **Regla de acceso.** Una copia solo se lee dentro del *contexto local* que la
 * guardó:
 * - El contexto lo abre una sesión que el servidor reconoce con rol
 *   institucional (Directiva o Administrador), al iniciarla o al recuperarla.
 * - En `localStorage` sólo guarda un `id` aleatorio, la huella de la identidad
 *   (FNV-1a de 64 bits de usuario y sindicato), el rol de la lista y la fecha:
 *   ningún dato tal como llega del servidor ni de la URL.
 * - Identifica a esa sesión (usuario, sindicato y rol), **no** a la persona
 *   física que está frente al navegador.
 * - Vive en `localStorage`, para invalidarlo de forma síncrona y para que
 *   sobreviva a una recarga sin conexión.
 * - Cada copia guarda el `id` del contexto. Sin contexto, con otro contexto,
 *   con otra identidad o sindicato, con un rol no institucional o con la
 *   campaña revocada, la copia **no se lee**, aunque siga en IndexedDB.
 * - Nunca se deduce autorización de que exista una copia: sin contexto no se
 *   enumera nada.
 *
 * **Invalidación inmediata, independiente del borrado.** Cerrar la sesión,
 * cambiar de identidad o sindicato, o recibir un rechazo de sesión o de
 * permiso cierran el contexto. Un rechazo de política lo renueva, con otro
 * `id`. Un 404 retira esa campaña **en el propio contexto** (`localStorage`),
 * así que la retirada sobrevive a una recarga; sólo una descarga pedida
 * después, y autorizada por el servidor, vuelve a dejar legible una copia de
 * esa campaña. Después se intenta borrar físicamente:
 * - si el borrado falla o sigue pendiente, la copia ya es inaccesible;
 * - el fallo queda marcado (`purgePending`) y se reintenta en la siguiente
 *   sesión o carga.
 * Una escritura que termine después de invalidar lleva el `id` (o la
 * generación) antiguo y nunca es legible.
 *
 * Las huellas (FNV-1a) sólo sirven para comparar sin guardar el texto: no son
 * cifrado, ni anonimización, ni una garantía criptográfica.
 *
 * **Lo que guarda:** la respuesta de `GET /download` tal como llegó, sin
 * credenciales (ningún token ni contraseña). No es el Excel de la consulta.
 *
 * **Lo que no se sabe sin conexión:** revocaciones ni cambios de fuentes.
 */

export const COPY_FORMAT_VERSION = 1;
const CONTEXT_KEY = 'agro_estimacion_contexto_v1';
const PURGE_KEY = 'agro_estimacion_purga_pendiente_v1';
const INSTITUTIONAL_ROLES = new Set(['DIRECTIVA', 'ADMINISTRADOR']);
/** Forma admitida de los identificadores de los que se guarda la huella. */
const STORED_ID = /^[A-Za-z0-9-]{1,64}$/;
const HASH = /^[0-9a-f]{16}$/;
/** Campañas retiradas que caben en un contexto; con más, se renueva el contexto entero. */
const MAX_REVOKED = 200;

export interface CopyIdentity {
  userId: string;
  tenantId: string;
}

/** La sesión en memoria (si la hay) que intenta leer. */
export interface SessionIdentity extends CopyIdentity {
  role: string;
}

/** Lo que se muestra de quién es la copia. Nunca credenciales. */
export interface CopyOwner extends CopyIdentity {
  name: string;
  tenantName: string;
  role: string;
}

/**
 * El contexto local autorizado: la sesión propietaria de las copias de este
 * navegador. La identidad se guarda como huella (`owner_hash`), no como texto.
 */
export interface LocalContext {
  version: 1;
  id: string;
  owner_hash: string;
  role: 'DIRECTIVA' | 'ADMINISTRADOR';
  opened_at: string;
  /** Sube con cada campaña retirada por un 404 (0 si falta). */
  generation?: number;
  /** Huella de cada campaña retirada → generación en que se retiró. */
  revoked?: Record<string, number>;
}

export interface StoredCopy {
  key: string;
  format_version: typeof COPY_FORMAT_VERSION;
  /** Contexto local que la guardó: fuera de él no se lee. */
  context_id: string;
  /** Generación del contexto cuando se pidió la descarga (0 si falta). */
  generation?: number;
  owner: CopyOwner;
  /** Hora local en que este navegador la guardó; la fecha de descarga es la del servidor (`download.downloaded_at`). */
  saved_at: string;
  download: InstitutionalDownload;
}

/** Almacén de las copias: IndexedDB en el navegador; en memoria en las pruebas de componentes. */
export interface CopyBackend {
  get(key: string): Promise<StoredCopy | undefined>;
  put(copy: StoredCopy): Promise<void>;
  list(): Promise<StoredCopy[]>;
  delete(key: string): Promise<void>;
}

const DB_NAME = 'agrocuentas-estimacion';
const STORE = 'copias';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(asError(req.error));
  });
}

const asError = (cause: DOMException | null) => new Error(`IndexedDB: ${cause?.message ?? 'error desconocido'}`);

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, COPY_FORMAT_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(asError(req.error));
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    const tx = db.transaction(STORE, mode);
    const done = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(asError(tx.error));
      tx.onabort = () => reject(asError(tx.error));
    });
    const result = await request(run(tx.objectStore(STORE)));
    await done;
    return result;
  } finally {
    db.close();
  }
}

export const indexedDbBackend: CopyBackend = {
  get: (key) => withStore('readonly', (store) => store.get(key) as IDBRequest<StoredCopy | undefined>),
  put: async (copy) => {
    await withStore('readwrite', (store) => store.put(copy));
  },
  list: () => withStore('readonly', (store) => store.getAll() as IDBRequest<StoredCopy[]>),
  delete: async (key) => {
    await withStore('readwrite', (store) => store.delete(key));
  },
};

export function memoryBackend(): CopyBackend {
  const rows = new Map<string, StoredCopy>();
  return {
    get: (key) => Promise.resolve(rows.has(key) ? structuredClone(rows.get(key)!) : undefined),
    put: (copy) => {
      rows.set(copy.key, structuredClone(copy));
      return Promise.resolve();
    },
    list: () => Promise.resolve([...rows.values()].map((copy) => structuredClone(copy))),
    delete: (key) => {
      rows.delete(key);
      return Promise.resolve();
    },
  };
}

let backend: CopyBackend = indexedDbBackend;
/** Contextos cerrados en esta página: no vuelven a valer aunque `localStorage` no se pudiera escribir. */
const closedIds = new Set<string>();

/** Sólo para pruebas: otro almacén. */
export function setCopyBackend(next: CopyBackend) {
  backend = next;
}

export const sameIdentity = (a: CopyIdentity | null, b: CopyIdentity | null) =>
  a !== null && b !== null && a.userId === b.userId && a.tenantId === b.tenantId;

export const isInstitutional = (role: string | null | undefined) => INSTITUTIONAL_ROLES.has(role ?? '');

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function writeContext(context: LocalContext): boolean {
  try {
    localStorage.setItem(CONTEXT_KEY, JSON.stringify(context));
    return true;
  } catch {
    return false;
  }
}

/** El contexto local vigente, o `null` si no lo hay, no es válido o no es institucional. */
export function currentContext(): LocalContext | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(CONTEXT_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<LocalContext>;
    const valid =
      value.version === 1 &&
      typeof value.id === 'string' &&
      typeof value.owner_hash === 'string' &&
      HASH.test(value.owner_hash) &&
      typeof value.role === 'string' &&
      isInstitutional(value.role) &&
      validRevocations(value) &&
      !closedIds.has(value.id);
    return valid ? (value as LocalContext) : null;
  } catch {
    return null;
  }
}

const isGeneration = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;

/** Generación y retiradas con forma válida; si no, el contexto no vale (no se lee nada). */
function validRevocations(value: Partial<LocalContext>): boolean {
  if (value.generation === undefined && value.revoked === undefined) return true;
  const generation = value.generation ?? 0;
  if (!isGeneration(generation)) return false;
  if (value.revoked === undefined) return true;
  if (typeof value.revoked !== 'object' || value.revoked === null || Array.isArray(value.revoked)) return false;
  const entries = Object.entries(value.revoked);
  return entries.length <= MAX_REVOKED && entries.every(([hash, at]) => HASH.test(hash) && isGeneration(at) && at < generation);
}

/**
 * Lo llama la autenticación cuando el servidor acepta una sesión. Con rol
 * institucional abre (o mantiene, si es la misma identidad y sindicato) el
 * contexto. Con otro rol lo cierra: un rol conocido sin permiso institucional
 * no lee la copia institucional, aunque su borrado siga pendiente.
 */
export function openContext(owner: CopyOwner): LocalContext | null {
  if (!isInstitutional(owner.role)) {
    closeContext();
    return null;
  }
  // Sólo identificadores con forma válida y un rol de la lista: nada más llega a `localStorage`.
  const role = owner.role === 'ADMINISTRADOR' ? 'ADMINISTRADOR' : 'DIRECTIVA';
  if (!STORED_ID.test(owner.userId) || !STORED_ID.test(owner.tenantId)) {
    closeContext();
    return null;
  }
  const existing = currentContext();
  const base = { owner_hash: identityHash(owner), role } as const;
  const context: LocalContext =
    existing && contextBelongsTo(existing, owner)
      ? { ...existing, ...base }
      : { version: 1, id: newId(), opened_at: new Date().toISOString(), ...base };
  if (existing && existing.id !== context.id) closedIds.add(existing.id);
  return writeContext(context) ? context : null;
}

/** Cierre de sesión, cambio de identidad o rechazo de sesión o permiso: ninguna copia vuelve a ser legible. */
export function closeContext() {
  const existing = currentContext();
  if (existing) closedIds.add(existing.id);
  try {
    localStorage.removeItem(CONTEXT_KEY);
  } catch {
    // Sin `localStorage` tampoco hay contexto que leer; `closedIds` cubre esta página.
  }
}

/** Rechazo de política: misma sesión, contexto nuevo; las copias anteriores dejan de ser legibles. */
export function rotateContext() {
  const existing = currentContext();
  if (!existing) return;
  closedIds.add(existing.id);
  const renewed: LocalContext = { version: 1, id: newId(), owner_hash: existing.owner_hash, role: existing.role, opened_at: new Date().toISOString() };
  if (!writeContext(renewed)) closeContext();
}

/**
 * 404 de una campaña: sus copias pedidas hasta ahora dejan de ser legibles en
 * este contexto, también tras recargar, y después se borran. Se guarda en el
 * contexto la huella de la campaña (la referencia viene de la URL) y la
 * generación, que sube: sólo una descarga pedida después vuelve a ser legible.
 * Si no se puede escribir, se cierra el contexto entero.
 */
export function revokeTarget(targetRef: string) {
  const existing = currentContext();
  if (!existing) return;
  const generation = existing.generation ?? 0;
  const revoked = { ...existing.revoked, [targetHash(targetRef)]: generation };
  if (Object.keys(revoked).length > MAX_REVOKED) {
    rotateContext();
    return;
  }
  if (!writeContext({ ...existing, generation: generation + 1, revoked })) closeContext();
}

function admissible(context: LocalContext | null, session: SessionIdentity | null): context is LocalContext {
  if (!context || !isInstitutional(context.role)) return false;
  return session === null || (contextBelongsTo(context, session) && isInstitutional(session.role));
}

/** `true` si la campaña se retiró por un 404 después de pedirse esa descarga. */
function revokedFor(context: LocalContext, targetRef: string, generation: number): boolean {
  const at = context.revoked?.[targetHash(targetRef)];
  return at !== undefined && generation <= at;
}

function readable(copy: StoredCopy, context: LocalContext): boolean {
  const generation = copy.generation ?? 0;
  return (
    copy.format_version === COPY_FORMAT_VERSION &&
    copy.context_id === context.id &&
    contextBelongsTo(context, copy.owner) &&
    copy.download?.scope?.tenant_ref === copy.owner.tenantId &&
    isGeneration(generation) &&
    generation <= (context.generation ?? 0) &&
    !revokedFor(context, copy.download.target.campaign_ref, generation)
  );
}

const keyOf = (identity: CopyIdentity, targetRef: string) => `${identity.userId}|${identity.tenantId}|${targetRef}`;

/** FNV-1a de 64 bits en hexadecimal. Sirve para comparar, no para ocultar: no es cifrado. */
function fnv1a64(text: string): string {
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < text.length; i++) {
    hash ^= BigInt(text.charCodeAt(i));
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, '0');
}

/**
 * Huella de la identidad (FNV-1a de 64 bits sobre «usuario|sindicato»). Los
 * identificadores los asigna el servidor; la huella sólo sirve para comprobar
 * que el contexto es de esa identidad sin guardarla como texto.
 */
export const identityHash = (identity: CopyIdentity) => fnv1a64(`${identity.userId}|${identity.tenantId}`);

/** Huella de una campaña retirada. Una colisión retiraría también otra campaña: falla hacia no mostrar. */
const targetHash = (targetRef: string) => fnv1a64(`campaña|${targetRef}`);

/** `true` si el contexto es de esa identidad y sindicato. */
export const contextBelongsTo = (context: LocalContext | null, identity: CopyIdentity | null) =>
  context !== null && identity !== null && context.owner_hash === identityHash(identity);

export type SaveOutcome = 'SAVED' | 'KEPT_NEWER' | 'CONTEXT_CHANGED' | 'TARGET_REVOKED' | 'NOT_INSTITUTIONAL' | 'OTHER_SCOPE' | 'UNSUPPORTED';

/**
 * Guarda la descarga en `requested`, el contexto vigente cuando se pidió. Se
 * niega si el contexto ya no es ese (sesión cerrada, cambiada o rechazada), si
 * la campaña se retiró después de pedirla, si el perfil no es el institucional,
 * si el sindicato no es el del contexto o si el formato no es el de INT-09 v1.
 */
export async function saveCopy(requested: LocalContext, owner: CopyOwner, download: InstitutionalDownload): Promise<SaveOutcome> {
  const generation = requested.generation ?? 0;
  const check = (): SaveOutcome | null => {
    const context = currentContext();
    if (context === null || context.id !== requested.id || !contextBelongsTo(context, owner)) return 'CONTEXT_CHANGED';
    return revokedFor(context, download.target.campaign_ref, generation) ? 'TARGET_REVOKED' : null;
  };
  if (download.contract_version !== 1 || download.kind !== 'ESTIMATION_DOWNLOAD' || download.may_be_outdated !== true) return 'UNSUPPORTED';
  if (download.profile !== 'INSTITUTIONAL') return 'NOT_INSTITUTIONAL';
  if (download.scope.tenant_ref !== owner.tenantId) return 'OTHER_SCOPE';
  const refused = check();
  if (refused) return refused;
  const key = keyOf(owner, download.target.campaign_ref);
  const existing = await backend.get(key);
  const context = currentContext();
  if (existing && context && readable(existing, context) && Date.parse(existing.download.downloaded_at) >= Date.parse(download.downloaded_at)) return 'KEPT_NEWER';
  // Otra vez justo antes de escribir. Aunque la escritura termine más tarde, lleva este `id` y esta
  // generación: no se leerá en otro contexto ni después de retirarse la campaña.
  const late = check();
  if (late) return late;
  await backend.put({
    key,
    format_version: COPY_FORMAT_VERSION,
    context_id: requested.id,
    generation,
    owner: { userId: owner.userId, tenantId: owner.tenantId, name: owner.name, tenantName: owner.tenantName, role: owner.role },
    saved_at: new Date().toISOString(),
    download,
  });
  return 'SAVED';
}

/** La copia legible de esta campaña en el contexto vigente, o `null`. */
export async function readCopy(session: SessionIdentity | null, targetRef: string): Promise<StoredCopy | null> {
  const context = currentContext();
  if (!admissible(context, session)) return null;
  // Con sesión, su clave; sin ella (recarga sin conexión), la copia de esa campaña dentro del contexto.
  const copy = session
    ? await backend.get(keyOf(session, targetRef))
    : (await backend.list()).find((c) => c.download?.target?.campaign_ref === targetRef && readable(c, context));
  // El contexto pudo cerrarse mientras se leía.
  if (currentContext()?.id !== context.id) return null;
  return copy && readable(copy, context) ? copy : null;
}

/**
 * Las copias legibles en el contexto vigente: también sin sesión en memoria
 * (recarga sin conexión), pero nunca sin contexto ni con otra identidad.
 */
export async function readableCopies(session: SessionIdentity | null): Promise<StoredCopy[]> {
  const context = currentContext();
  if (!admissible(context, session)) return [];
  const copies = (await backend.list()).filter((copy) => readable(copy, context));
  if (currentContext()?.id !== context.id) return [];
  return copies.sort((a, b) => Date.parse(b.download.downloaded_at) - Date.parse(a.download.downloaded_at));
}

export interface PurgeResult {
  deleted: number;
  failed: number;
}

/**
 * Borra físicamente lo que ya no es legible en el contexto vigente (todo, si
 * no hay contexto). Si algo falla, queda marcado como pendiente y se reintenta
 * en la siguiente sesión o carga: el acceso ya estaba retirado.
 */
export async function purgeInaccessibleCopies(): Promise<PurgeResult> {
  const context = currentContext();
  let deleted = 0;
  let failed = 0;
  let copies: StoredCopy[];
  try {
    copies = await backend.list();
  } catch {
    markPurge(true);
    return { deleted, failed: 1 };
  }
  for (const copy of copies) {
    if (context && readable(copy, context)) continue;
    try {
      await backend.delete(copy.key);
      deleted += 1;
    } catch {
      failed += 1;
    }
  }
  markPurge(failed > 0);
  return { deleted, failed };
}

function markPurge(pending: boolean) {
  try {
    if (pending) localStorage.setItem(PURGE_KEY, new Date().toISOString());
    else localStorage.removeItem(PURGE_KEY);
  } catch {
    // Sin `localStorage` no hay contexto: nada es legible igualmente.
  }
}

/** `true` si un borrado físico falló y está pendiente de reintento. El acceso ya está retirado. */
export function purgePending(): boolean {
  try {
    return localStorage.getItem(PURGE_KEY) !== null;
  } catch {
    return true;
  }
}
