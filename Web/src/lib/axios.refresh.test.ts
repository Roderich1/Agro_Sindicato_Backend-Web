import axios, { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, clearAccessToken, getAccessToken, setAccessToken } from './axios';

/** Respuesta de error simulada del servidor (sin red real). */
function httpError(status: number, config: InternalAxiosRequestConfig = { headers: new AxiosHeaders() }) {
  const error = new AxiosError(`HTTP ${status}`, String(status), config);
  error.response = { status, data: {}, statusText: '', headers: {}, config };
  return error;
}

describe('renovación de la sesión (H-17)', () => {
  const originalAdapter = api.defaults.adapter;
  beforeEach(() => {
    setAccessToken('token-de-prueba');
    // Toda petición de la API responde 401: obliga a intentar la renovación.
    api.defaults.adapter = (config) => Promise.reject(httpError(401, config));
  });
  afterEach(() => {
    api.defaults.adapter = originalAdapter;
    clearAccessToken();
    vi.restoreAllMocks();
  });

  it('un 429 al renovar no cierra la sesión: conserva el token, no va al login y propaga el 429', async () => {
    const before = window.location.href;
    vi.spyOn(axios, 'post').mockRejectedValue(httpError(429));
    const failure = await api.get('/collective/campaigns').catch((error: unknown) => error);
    expect(axios.isAxiosError(failure) && failure.response?.status).toBe(429);
    expect(getAccessToken()).toBe('token-de-prueba');
    expect(window.location.href).toBe(before);
  });

  it('un 401 al renovar sigue cerrando la sesión local (se borra el token)', async () => {
    vi.spyOn(axios, 'post').mockRejectedValue(httpError(401));
    // jsdom no navega: la asignación a location.href sólo se registra.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await api.get('/collective/campaigns').catch(() => undefined);
    expect(getAccessToken()).toBeNull();
  });
});
