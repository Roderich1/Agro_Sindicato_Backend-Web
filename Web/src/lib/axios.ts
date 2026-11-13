import axios from 'axios';
import type { AuthUser } from '../contexts/auth.context';
import { closeContext, purgeInaccessibleCopies } from './estimation-copy';

let _accessToken: string | null = null;

export const getAccessToken = (): string | null => _accessToken;
export const setAccessToken = (token: string): void => { _accessToken = token; };
export const clearAccessToken = (): void => { _accessToken = null; };

export const api = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/**
 * Cierre O5 (decisión D del autor): si a la cuenta se le cambia el rol con la
 * Web abierta, el servidor corta el acceso en la consulta siguiente (403, o 401
 * si la deshabilita), pero la sesión local conservaba el rol anterior y con él
 * la barra lateral y las guardas de ruta. Dos momentos que ya existen actualizan
 * el rol, sin sondeos ni temporizadores:
 *  - un 403 de cualquier consulta pide revalidar el usuario (`GET /auth/me`,
 *    rol vigente del Member); mientras una revalidación está en vuelo, los demás
 *    403 no lanzan otra, y la respuesta de `/auth/me` nunca la vuelve a pedir;
 *  - la renovación del token ya devuelve el usuario vigente y se aprovecha.
 * El contexto de sesión (`AuthProvider`) decide qué hacer con el usuario; la
 * autorización sigue siendo del servidor en cada consulta.
 */
export interface SessionSync {
  /** Revalida el usuario con el servidor y actualiza la sesión si cambió. */
  revalidate: () => Promise<void>;
  /** La renovación del token devolvió el usuario vigente. */
  refreshed: (user: AuthUser) => void;
}

const ME_PATH = '/auth/me';
let sessionSync: SessionSync | null = null;
let revalidation: Promise<void> | null = null;

/** Registra el contexto de sesión; devuelve la función que lo retira. */
export function setSessionSync(sync: SessionSync): () => void {
  sessionSync = sync;
  return () => {
    if (sessionSync === sync) sessionSync = null;
  };
}

function isMeRequest(url: string | undefined): boolean {
  return (url ?? '').split('?')[0].endsWith(ME_PATH);
}

/** Una sola revalidación en vuelo; un fallo (red, 401 ya tratado) no rompe la consulta original. */
function requestRevalidation(): void {
  if (!sessionSync || revalidation) return;
  revalidation = sessionSync
    .revalidate()
    .catch(() => undefined)
    .finally(() => {
      revalidation = null;
    });
}

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

api.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!axios.isAxiosError(error)) return Promise.reject(error);

    const originalRequest = error.config as (typeof error.config) & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest?._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          if (originalRequest) {
            originalRequest.headers = originalRequest.headers ?? {};
            originalRequest.headers['Authorization'] = `Bearer ${token}`;
          }
          return api(originalRequest!);
        });
      }

      if (originalRequest) originalRequest._retry = true;
      isRefreshing = true;

      try {
        const { data } = await axios.post<{ accessToken: string; user?: AuthUser }>(
          '/api/v1/auth/refresh',
          {},
          { withCredentials: true },
        );
        setAccessToken(data.accessToken);
        if (data.user) sessionSync?.refreshed(data.user);
        failedQueue.forEach((p) => p.resolve(data.accessToken));
        failedQueue = [];
        if (originalRequest) {
          originalRequest.headers = originalRequest.headers ?? {};
          originalRequest.headers['Authorization'] = `Bearer ${data.accessToken}`;
          return api(originalRequest);
        }
      } catch (refreshError) {
        failedQueue.forEach((p) => p.reject(refreshError));
        failedQueue = [];
        // H-17 (inventario v2): con 429 el servidor está ocupado, no rechazó la sesión. Se conserva
        // el token y la página; la petición original falla con ese 429 y cada vista muestra
        // «servidor ocupado» con «Reintentar». El siguiente 401 vuelve a intentar renovarla.
        if (axios.isAxiosError(refreshError) && refreshError.response?.status === 429) {
          return Promise.reject(refreshError);
        }
        clearAccessToken();
        // F12-EST-07-WEB (#180): si el servidor rechaza la sesión, el contexto local se cierra
        // (ninguna copia es legible ni se guarda una descarga en curso) y se intenta el borrado.
        if (axios.isAxiosError(refreshError) && refreshError.response?.status === 401) {
          closeContext();
          await purgeInaccessibleCopies();
        }
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // Cierre O5: un 403 puede significar que el rol cambió; se revalida (sin esperar) y la
    // consulta falla igual con su 403. El servidor sigue decidiendo cada acceso.
    if (error.response?.status === 403 && !isMeRequest(originalRequest?.url)) requestRevalidation();

    return Promise.reject(error);
  },
);
