import type { InstitutionalDownload } from '../types/estimation';

/**
 * F12-EST-07-WEB (#180; RF-40, RN-30, DAT-20; contrato §9): la copia de la
 * estimación para consultar sin conexión, en IndexedDB de este navegador.
 *
 * - Pertenece a una identidad (usuario y sindicato de la sesión) y a una campaña
 *   objetivo; otra identidad nunca la lee.
 * - Se descarta al cerrar la sesión, al cambiar de identidad o sindicato y
 *   cuando el servidor rechaza la sesión, el permiso o la política.
 * - Sólo se reemplaza por una descarga más reciente de la misma identidad y
 *   campaña (`NEWER_SAME_SUBJECT_AND_SCOPE`).
 * - Guarda la respuesta de `GET /download` tal como llegó, sin credenciales:
 *   ningún token ni contraseña.
 * - No es una autorización vigente: sin conexión no se conocen revocaciones
 *   ni cambios de fuentes.
 *
 * No es el CSV de la consulta, que se exporta con conexión y no se guarda aquí.
 */

export const COPY_FORMAT_VERSION = 1;

/** La identidad de la sesión que descarga: usuario y sindicato. Nunca credenciales. */
export interface CopyIdentity {
  userId: string;
  tenantId: string;
}

/** Lo que se muestra sin conexión de quién es la copia. */
export interface CopyOwner extends CopyIdentity {
  name: string;
  tenantName: string;
  role: string;
}

export interface StoredCopy {
  key: string;
  format_version: typeof COPY_FORMAT_VERSION;
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
    req.onerror = () => reject(req.error);
  });
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, COPY_FORMAT_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    const tx = db.transaction(STORE, mode);
    const done = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
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
    get: async (key) => (rows.has(key) ? structuredClone(rows.get(key)!) : undefined),
    put: async (copy) => void rows.set(copy.key, structuredClone(copy)),
    list: async () => [...rows.values()].map((copy) => structuredClone(copy)),
    delete: async (key) => void rows.delete(key),
  };
}

let backend: CopyBackend = indexedDbBackend;
let active: CopyIdentity | null = null;

/** Sólo para pruebas: otro almacén. */
export function setCopyBackend(next: CopyBackend) {
  backend = next;
}

/**
 * La identidad de la sesión en curso, que fija la autenticación. Una descarga
 * que responde cuando la sesión ya es otra (o ninguna) no se guarda.
 */
export function setActiveIdentity(identity: CopyIdentity | null) {
  active = identity ? { userId: identity.userId, tenantId: identity.tenantId } : null;
}

export const sameIdentity = (a: CopyIdentity | null, b: CopyIdentity | null) =>
  a !== null && b !== null && a.userId === b.userId && a.tenantId === b.tenantId;

const keyOf = (identity: CopyIdentity, targetRef: string) => `${identity.userId}|${identity.tenantId}|${targetRef}`;

export type SaveOutcome = 'SAVED' | 'KEPT_NEWER' | 'IDENTITY_CHANGED' | 'NOT_INSTITUTIONAL' | 'OTHER_SCOPE' | 'UNSUPPORTED';

/**
 * Guarda la descarga para `owner`, que es la identidad que la pidió. Se niega si
 * la sesión ya no es esa identidad, si el perfil no es el institucional, si el
 * sindicato no es el de la sesión o si el formato no es el de INT-09 v1.
 */
export async function saveCopy(owner: CopyOwner, download: InstitutionalDownload): Promise<SaveOutcome> {
  if (!sameIdentity(active, owner)) return 'IDENTITY_CHANGED';
  if (download.contract_version !== 1 || download.kind !== 'ESTIMATION_DOWNLOAD' || download.may_be_outdated !== true) return 'UNSUPPORTED';
  if (download.profile !== 'INSTITUTIONAL') return 'NOT_INSTITUTIONAL';
  if (download.scope.tenant_ref !== owner.tenantId) return 'OTHER_SCOPE';
  const key = keyOf(owner, download.target.campaign_ref);
  const existing = await backend.get(key);
  if (existing && Date.parse(existing.download.downloaded_at) >= Date.parse(download.downloaded_at)) return 'KEPT_NEWER';
  // Otra vez justo antes de escribir: la sesión pudo cambiar mientras se leía.
  if (!sameIdentity(active, owner)) return 'IDENTITY_CHANGED';
  await backend.put({
    key,
    format_version: COPY_FORMAT_VERSION,
    owner: { userId: owner.userId, tenantId: owner.tenantId, name: owner.name, tenantName: owner.tenantName, role: owner.role },
    saved_at: new Date().toISOString(),
    download,
  });
  return 'SAVED';
}

/** La copia de esta identidad para esta campaña, o `null`. Nunca la de otra identidad. */
export async function readCopy(identity: CopyIdentity, targetRef: string): Promise<StoredCopy | null> {
  const copy = await backend.get(keyOf(identity, targetRef));
  return copy && sameIdentity(copy.owner, identity) && copy.format_version === COPY_FORMAT_VERSION ? copy : null;
}

/**
 * Las copias guardadas, para leerlas sin conexión tras recargar la PWA, cuando
 * la sesión no puede comprobarse. Con una sesión en curso, sólo las suyas.
 * Sólo puede haber copias de la última identidad que no cerró sesión: iniciar
 * sesión con otra borra las demás.
 */
export async function listCopies(identity: CopyIdentity | null): Promise<StoredCopy[]> {
  const copies = (await backend.list()).filter((copy) => copy.format_version === COPY_FORMAT_VERSION);
  const visible = identity ? copies.filter((copy) => sameIdentity(copy.owner, identity)) : copies;
  return visible.sort((a, b) => Date.parse(b.download.downloaded_at) - Date.parse(a.download.downloaded_at));
}

/** Al iniciar o recuperar una sesión: se borran las copias de cualquier otra identidad o sindicato. */
export async function retainOnly(identity: CopyIdentity) {
  for (const copy of await backend.list()) if (!sameIdentity(copy.owner, identity)) await backend.delete(copy.key);
}

/** Tras un rechazo del servidor: las copias de esta identidad (de una campaña, si se indica). */
export async function discardCopies(identity: CopyIdentity, targetRef?: string) {
  for (const copy of await backend.list()) {
    if (sameIdentity(copy.owner, identity) && (targetRef === undefined || copy.download.target.campaign_ref === targetRef)) await backend.delete(copy.key);
  }
}

/** Al cerrar la sesión o al perderla: todas las copias de este navegador. */
export async function discardAllCopies() {
  for (const copy of await backend.list()) await backend.delete(copy.key);
}
