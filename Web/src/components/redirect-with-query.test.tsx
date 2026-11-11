import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { RedirectWithQuery } from './redirect-with-query';

afterEach(cleanup);

function Where() {
  const location = useLocation();
  return <p data-testid="where">{`${location.pathname}${location.search}${location.hash}`}</p>;
}

function renderRedirect(initial: string, set?: Record<string, string>) {
  return render(
    <MemoryRouter initialEntries={['/inicio', initial]} initialIndex={1}>
      <Routes>
        <Route path="/colectivo/estimacion" element={<RedirectWithQuery to="/colectivo/historico" set={set} />} />
        <Route path="/colectivo/historico" element={<Where />} />
        <Route path="/inicio" element={<p>inicio</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const UUID = '11111111-1111-4111-8111-111111111111';

describe('RedirectWithQuery', () => {
  it('lleva al destino y fija ?vista= sin perder la campaña', () => {
    renderRedirect(`/colectivo/estimacion?campaign=${UUID}`, { vista: 'estimacion' });
    expect(screen.getByTestId('where').textContent).toBe(`/colectivo/historico?campaign=${UUID}&vista=estimacion`);
  });

  it('sobrescribe una clave existente en lugar de duplicarla', () => {
    renderRedirect('/colectivo/estimacion?vista=tendencias&campaign=x', { vista: 'estimacion' });
    expect(screen.getByTestId('where').textContent).toBe('/colectivo/historico?vista=estimacion&campaign=x');
  });

  it('sin consulta ni `set`, no añade un «?» vacío; conserva el fragmento', () => {
    renderRedirect('/colectivo/estimacion#metodo');
    expect(screen.getByTestId('where').textContent).toBe('/colectivo/historico#metodo');
  });

  it('reemplaza la entrada del historial: «Atrás» vuelve a la página anterior, no a la ruta antigua', () => {
    function Back() {
      const navigate = useNavigate();
      return (
        <button type="button" onClick={() => navigate(-1)}>
          Atrás
        </button>
      );
    }
    render(
      <MemoryRouter initialEntries={['/inicio', '/colectivo/estimacion']} initialIndex={1}>
        <Routes>
          <Route path="/colectivo/estimacion" element={<RedirectWithQuery to="/colectivo/historico" set={{ vista: 'estimacion' }} />} />
          <Route path="/colectivo/historico" element={<Back />} />
          <Route path="/inicio" element={<p>inicio</p>} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Atrás' }));
    expect(screen.getByText('inicio')).toBeTruthy();
  });
});
