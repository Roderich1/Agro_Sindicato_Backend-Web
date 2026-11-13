import axios from 'axios';
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
        const { data } = await axios.post<{ accessToken: string }>(
          '/api/v1/auth/refresh',
          {},
          { withCredentials: true },
        );
        setAccessToken(data.accessToken);
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

    return Promise.reject(error);
  },
);
