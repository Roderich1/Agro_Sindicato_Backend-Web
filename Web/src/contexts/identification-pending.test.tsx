import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from './auth.context';
import { notifyIdentificationChanged, useIdentificationPending } from './identification-pending';
import { IdentificationPendingProvider } from './identification-pending-provider';
import { identificationService } from '../services/identification.service';
import { userWith } from '../test/render';

vi.mock('../services/identification.service', () => ({ identificationService: { list: vi.fn() } }));

afterEach(cleanup);

function Probe() {
  const pending = useIdentificationPending();
  return <output data-testid="pending">{pending === null ? 'sin dato' : String(pending)}</output>;
}

function app(role: string) {
  return render(
    <AuthContext.Provider value={{ user: userWith(role), isLoading: false, login: async () => undefined, logout: async () => undefined }}>
      <IdentificationPendingProvider>
        <Probe />
      </IdentificationPendingProvider>
    </AuthContext.Provider>,
  );
}

describe('IdentificationPendingProvider (insignia H-02)', () => {
  // `restoreMocks` (vitest.config) limpia las llamadas entre pruebas.
  it('Directiva: una llamada PENDING al montar y otra por cada aviso; sin sondeo', async () => {
    vi.mocked(identificationService.list).mockResolvedValue(Array.from({ length: 6 }, (_, i) => ({ id: `r${i}` })) as never);
    app('DIRECTIVA');
    await waitFor(() => expect(screen.getByTestId('pending').textContent).toBe('6'));
    expect(identificationService.list).toHaveBeenCalledTimes(1);
    expect(identificationService.list).toHaveBeenCalledWith('PENDING');
    vi.mocked(identificationService.list).mockResolvedValue([{ id: 'r0' }] as never);
    act(() => notifyIdentificationChanged());
    await waitFor(() => expect(screen.getByTestId('pending').textContent).toBe('1'));
    expect(identificationService.list).toHaveBeenCalledTimes(2);
  });

  it('un error deja «sin dato», nunca 0', async () => {
    vi.mocked(identificationService.list).mockImplementation(async () => {
      throw new Error('sin red');
    });
    app('ADMINISTRADOR');
    await act(async () => {
      await new Promise((done) => setTimeout(done, 20));
    });
    expect(screen.getByTestId('pending').textContent).toBe('sin dato');
  });

  it('AGRICULTOR: no hay llamada ni dato', async () => {
    app('AGRICULTOR');
    await new Promise((done) => setTimeout(done, 10));
    expect(identificationService.list).not.toHaveBeenCalled();
    expect(screen.getByTestId('pending').textContent).toBe('sin dato');
  });
});
