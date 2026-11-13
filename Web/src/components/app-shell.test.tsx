import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IdentificationPendingContext } from '../contexts/identification-pending';
import { reportDisclosureMode } from '../lib/data-mode';
import { COLLECTIVE_PATHS } from '../lib/navigation';
import { renderAt } from '../test/render';
import { AppShell } from './app-shell';

vi.mock('../services/campaigns.service', () => ({ campaignsService: { active: vi.fn(), list: vi.fn() } }));

const shell = (title = 'Resumen', section = 'Colectivo') => (
  <AppShell title={title} section={section}>
    <p>contenido</p>
  </AppShell>
);

function mainNav() {
  return screen.getAllByRole('navigation', { name: 'Navegación principal' })[0]!;
}

/** Botón «Más» de la barra inferior (rediseño v2, lámina 43; antes «Abrir menú» en la cabecera). */
function moreButton() {
  return within(screen.getByRole('navigation', { name: 'Navegación rápida' })).getByRole('button', { name: 'Más' });
}

afterEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    /* sin almacenamiento */
  }
});

/**
 * Rediseño v2 (2026-11-13, láminas 03, 21 y 43; inventario §O.2): menú por
 * tareas con grupos plegables, sección «Sindicato», barra lateral oscura y
 * plegable, sin h1 en el armazón. Adaptaciones declaradas respecto de v1:
 * etiquetas («Borrador de compra», «Catálogo», «Histórico»), orden de la barra
 * lateral y «Usuarios» dentro de «Sindicato». Lo que se comprueba (permisos por
 * rol, ítem activo, sección derivada de la ruta) no cambia.
 */
describe('AppShell: menú por tareas', () => {
  it('DIRECTIVA: cinco tareas y, bajo «Sindicato», Campañas y Bitácora (sin Usuarios)', () => {
    renderAt(shell(), { role: 'DIRECTIVA', path: COLLECTIVE_PATHS.summary });
    const nav = mainNav();
    const labels = within(nav).getAllByRole('link').map((link) => link.textContent?.trim());
    expect(labels).toEqual(['Resumen', 'Borrador de compra', 'Compras conjuntas', 'Catálogo', 'Histórico', 'Campañas', 'Bitácora']);
    expect(within(nav).getByRole('link', { name: 'Borrador de compra' }).getAttribute('href')).toBe(COLLECTIVE_PATHS.proposals);
    expect(within(nav).getByRole('link', { name: 'Compras conjuntas' }).getAttribute('href')).toBe(COLLECTIVE_PATHS.jointPurchaseCalls);
    expect(within(nav).getByText('Sindicato')).toBeTruthy();
    expect(within(nav).getByRole('link', { name: 'Histórico' }).getAttribute('href')).toBe(COLLECTIVE_PATHS.history);
    expect(within(nav).getByRole('link', { name: 'Catálogo' }).getAttribute('href')).toBe(COLLECTIVE_PATHS.catalog);
    expect(within(nav).getByRole('link', { name: 'Bitácora' }).getAttribute('href')).toBe('/audit-logs');
    expect(within(nav).getByRole('link', { name: 'Resumen' }).getAttribute('aria-current')).toBe('page');
    expect(within(nav).queryByRole('link', { name: 'Usuarios' })).toBeNull();
    // La cobertura sale del menú (se abre desde el Resumen); su ruta se conserva.
    expect(within(nav).queryByRole('link', { name: /Cobertura/ })).toBeNull();
  });

  it('ADMINISTRADOR: «Sindicato» con Campañas, Usuarios y Bitácora', () => {
    renderAt(shell('Usuarios', 'Administración'), { role: 'ADMINISTRADOR', path: '/users' });
    const nav = mainNav();
    const labels = within(nav).getAllByRole('link').map((link) => link.textContent?.trim());
    expect(labels.slice(-3)).toEqual(['Campañas', 'Usuarios', 'Bitácora']);
    expect(within(nav).getByRole('link', { name: 'Usuarios' }).getAttribute('aria-current')).toBe('page');
  });

  it('teléfono: si la sección actual vive en «Más» (Campañas), se marca «Más»; en una tarea de la barra, no (V-5)', () => {
    const view = renderAt(shell('Campañas'), { role: 'DIRECTIVA', path: '/campaigns' });
    expect(moreButton().getAttribute('data-section-in-more')).toBe('true');
    view.unmount();
    renderAt(shell('Resumen'), { role: 'DIRECTIVA', path: COLLECTIVE_PATHS.summary });
    expect(moreButton().getAttribute('data-section-in-more')).toBeNull();
  });

  it('las rutas antiguas y las subrutas marcan su sección como activa; el grupo se abre con la subvista vigente', () => {
    renderAt(shell('Estimación del consumo'), { role: 'DIRECTIVA', path: COLLECTIVE_PATHS.estimation });
    const nav = mainNav();
    // El grupo es la sección actual («true»); la subvista es la página actual.
    expect(within(nav).getByRole('link', { name: 'Histórico' }).getAttribute('aria-current')).toBe('true');
    const sub = within(nav).getByRole('link', { name: 'Estimación del consumo' });
    expect(sub.getAttribute('aria-current')).toBe('page');
    expect(sub.getAttribute('href')).toBe(`${COLLECTIVE_PATHS.history}?vista=estimacion`);
  });

  it('Catálogo: subvistas por `?vista=`; sin `vista`, la primera (Productos)', () => {
    renderAt(shell('Catálogo'), { role: 'DIRECTIVA', path: `${COLLECTIVE_PATHS.catalog}?vista=identificacion` });
    let nav = mainNav();
    const items = within(nav).getByRole('list', { name: 'Catálogo' });
    expect(within(items).getAllByRole('link').map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Productos', `${COLLECTIVE_PATHS.catalog}?vista=productos`],
      ['Nombres equivalentes', `${COLLECTIVE_PATHS.catalog}?vista=equivalencias`],
      ['Por identificar', `${COLLECTIVE_PATHS.catalog}?vista=identificacion`],
    ]);
    expect(within(items).getByRole('link', { name: 'Por identificar' }).getAttribute('aria-current')).toBe('page');
    renderAt(shell('Catálogo'), { role: 'DIRECTIVA', path: COLLECTIVE_PATHS.catalog });
    nav = screen.getAllByRole('navigation', { name: 'Navegación principal' })[1]!;
    expect(within(nav).getByRole('link', { name: 'Productos' }).getAttribute('aria-current')).toBe('page');
  });

  it('un grupo se pliega y despliega con su botón (aria-expanded), sin navegar', () => {
    renderAt(shell(), { role: 'DIRECTIVA', path: COLLECTIVE_PATHS.summary });
    const nav = mainNav();
    const toggle = within(nav).getByRole('button', { name: 'Mostrar las vistas de Histórico' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(within(nav).queryByRole('link', { name: 'Histórico sellado' })).toBeNull();
    fireEvent.click(toggle);
    const hide = within(nav).getByRole('button', { name: 'Ocultar las vistas de Histórico' });
    expect(hide.getAttribute('aria-expanded')).toBe('true');
    expect(within(nav).getByRole('link', { name: 'Histórico sellado' }).getAttribute('href')).toBe(`${COLLECTIVE_PATHS.history}?vista=tendencias`);
    // Fuera de su sección, ninguna subvista se marca como la actual.
    expect(within(nav).getByRole('link', { name: 'Histórico sellado' }).getAttribute('aria-current')).toBeNull();
  });

  it('el ítem activo se distingue también por texto y peso, no sólo por color; los iconos son decorativos', () => {
    renderAt(shell(), { role: 'DIRECTIVA', path: COLLECTIVE_PATHS.proposals });
    const active = within(mainNav()).getByRole('link', { name: 'Borrador de compra' });
    expect(active.className).toMatch(/font-semibold/);
    expect(active.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
    expect(active.className).not.toMatch(/transition|backdrop|gradient/);
  });

  it('plegar la barra lateral la deja en iconos con los nombres accesibles intactos, y se recuerda', () => {
    renderAt(shell(), { role: 'DIRECTIVA', path: COLLECTIVE_PATHS.summary });
    const fold = screen.getByRole('button', { name: 'Plegar la barra lateral' });
    expect(fold.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(fold);
    const unfold = screen.getByRole('button', { name: 'Desplegar la barra lateral' });
    expect(unfold.getAttribute('aria-expanded')).toBe('false');
    const labels = within(mainNav()).getAllByRole('link').map((link) => link.textContent?.trim());
    expect(labels).toEqual(['Resumen', 'Borrador de compra', 'Compras conjuntas', 'Catálogo', 'Histórico', 'Campañas', 'Bitácora']);
    expect(window.localStorage.getItem('agro.web.barraPlegada')).toBe('1');
  });
});

describe('AppShell: posición al navegar', () => {
  const page = () => document.documentElement;
  afterEach(() => {
    page().scrollTop = 0;
  });

  it('al cambiar de ruta con un enlace, la vista nueva empieza arriba', () => {
    renderAt(shell(), { role: 'DIRECTIVA', path: COLLECTIVE_PATHS.summary, routes: [{ path: '/campaigns', element: shell('Campañas') }] });
    page().scrollTop = 480;
    fireEvent.click(within(mainNav()).getByRole('link', { name: 'Campañas' }));
    expect(page().scrollTop).toBe(0);
  });

  it('cambiar sólo `?vista=` (misma ruta) conserva la posición', () => {
    renderAt(shell('Catálogo'), { role: 'DIRECTIVA', path: `${COLLECTIVE_PATHS.catalog}?vista=productos` });
    page().scrollTop = 480;
    fireEvent.click(within(mainNav()).getByRole('link', { name: 'Nombres equivalentes' }));
    expect(within(mainNav()).getByRole('link', { name: 'Nombres equivalentes' }).getAttribute('aria-current')).toBe('page');
    expect(page().scrollTop).toBe(480);
  });
});

describe('AppShell: insignia «Por identificar» (H-02)', () => {
  function withPending(pending: number | null, path: string) {
    return renderAt(
      <IdentificationPendingContext.Provider value={{ pending }}>{shell('Catálogo')}</IdentificationPendingContext.Provider>,
      { role: 'DIRECTIVA', path },
    );
  }

  it('con el grupo plegado va en «Catálogo»; desplegado, en «Por identificar»', () => {
    withPending(6, COLLECTIVE_PATHS.summary);
    // La cifra se ve y el lector de pantalla oye «(6 pendientes)».
    expect(within(mainNav()).getByRole('link', { name: /^Catálogo\s*\(6 pendientes\)$/ })).toBeTruthy();
    fireEvent.click(within(mainNav()).getByRole('button', { name: 'Mostrar las vistas de Catálogo' }));
    expect(within(mainNav()).getByRole('link', { name: 'Catálogo' })).toBeTruthy();
    expect(within(mainNav()).getByRole('link', { name: /^Por identificar\s*\(6 pendientes\)$/ })).toBeTruthy();
  });

  it('sin dato (null) o con cero no hay insignia: nunca se escribe un «0»', () => {
    for (const pending of [null, 0]) {
      const view = withPending(pending, `${COLLECTIVE_PATHS.catalog}?vista=identificacion`);
      expect(within(mainNav()).getByRole('link', { name: 'Por identificar' })).toBeTruthy();
      expect(within(mainNav()).getByRole('link', { name: 'Catálogo' }).textContent).toBe('Catálogo');
      view.unmount();
    }
  });
});

describe('AppShell: cabecera', () => {
  afterEach(() => reportDisclosureMode(null));

  it('no pone el h1 ni repite el nombre de la vista: sólo la sección del menú, derivada de la ruta', () => {
    renderAt(shell('Resumen colectivo', 'Colectivo'), { role: 'DIRECTIVA', path: COLLECTIVE_PATHS.summary });
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(screen.getByTestId('shell-section').textContent).toBe('Resumen');
    expect(screen.queryByText('Resumen colectivo')).toBeNull();
    expect(screen.queryByText('Colectivo')).toBeNull();
    expect(document.title).toBe('Resumen colectivo · Agrocuentas');
  });

  it.each([
    ['/campaigns/11111111-1111-4111-8111-111111111111', 'Gestión', 'Campañas'],
    [COLLECTIVE_PATHS.estimation, 'Colectivo', 'Histórico y estimaciones'],
    [COLLECTIVE_PATHS.catalog, 'Gestión', 'Catálogo y equivalencias'],
    ['/colectivo/compras-conjuntas/c-1', 'Colectivo', 'Compras conjuntas'],
    [COLLECTIVE_PATHS.coverage, 'Colectivo', 'Resumen'],
    [COLLECTIVE_PATHS.proposals, 'Colectivo', 'Necesidades y borrador de compra'],
    ['/audit-logs', 'Trazabilidad', 'Bitácora'],
    ['/users', 'Administración', 'Usuarios'],
  ])('en %s la sección es la del menú («%s» → «%s»), aunque la vista pase otra', (path, given, expected) => {
    renderAt(shell('Vista', given), { role: 'ADMINISTRADOR', path });
    expect(screen.getByTestId('shell-section').textContent).toBe(expected);
  });

  it('fuera del menú por tareas se usa la sección que pasa la vista', () => {
    renderAt(shell('Copia', 'Estimación sin conexión'), { role: 'DIRECTIVA', path: '/estimacion/copia-sin-conexion' });
    expect(screen.getByTestId('shell-section').textContent).toBe('Estimación sin conexión');
  });

  it('el nombre del sindicato (de la sesión) se muestra completo bajo la marca, sin truncar', () => {
    renderAt(shell(), { role: 'DIRECTIVA', path: COLLECTIVE_PATHS.summary });
    const tenant = screen.getAllByText('Sindicato sintético')[0]!;
    expect(tenant.className).toMatch(/whitespace-normal/);
    expect(tenant.className).not.toMatch(/truncate|nowrap/);
  });

  it('sin franja superior en escritorio: el armazón no repite la campaña activa ni «Datos sintéticos» (los muestra la cabecera de cada vista)', () => {
    renderAt(shell(), { role: 'DIRECTIVA', path: COLLECTIVE_PATHS.summary });
    act(() => reportDisclosureMode('PROVISIONAL_SYNTHETIC'));
    expect(screen.queryByTitle('Campaña activa del sindicato')).toBeNull();
    expect(screen.queryByText('Campaña sintética')).toBeNull();
    expect(screen.queryByTestId('synthetic-badge')).toBeNull();
    // La barra superior sólo existe por debajo de 1024 px.
    expect(screen.getByTestId('shell-section').closest('header')!.className).toContain('lg:hidden');
  });

  it('la conexión se dice con texto en la tarjeta de usuario; en teléfono, sólo cuando falta', () => {
    renderAt(shell(), { role: 'DIRECTIVA', path: COLLECTIVE_PATHS.summary });
    const connection = screen.getByTestId('connection');
    expect(connection.textContent).toMatch(/En línea|Sin conexión/);
    expect(connection.closest('aside')).not.toBeNull();
    expect(Boolean(screen.queryByTestId('connection-mobile'))).toBe(!navigator.onLine);
  });

  it('sin conexión: «Sin conexión» en la tarjeta de usuario y en la barra del teléfono', () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    renderAt(shell(), { role: 'DIRECTIVA', path: COLLECTIVE_PATHS.summary });
    expect(screen.getByTestId('connection').textContent).toBe('Sin conexión');
    expect(screen.getByTestId('connection-mobile').textContent).toBe('Sin conexión');
    online.mockRestore();
  });

  it('la tarjeta de usuario muestra nombre y rol, y «Cerrar sesión» tiene nombre', () => {
    renderAt(shell(), { role: 'DIRECTIVA', path: COLLECTIVE_PATHS.summary });
    expect(screen.getAllByText('Usuario sintético').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Directiva').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Cerrar sesión' }).length).toBeGreaterThan(0);
  });

  it('ofrece «Saltar al contenido» hacia el <main>', () => {
    renderAt(shell(), { role: 'DIRECTIVA', path: COLLECTIVE_PATHS.summary });
    expect(screen.getByRole('link', { name: 'Saltar al contenido' }).getAttribute('href')).toBe('#contenido');
    expect(screen.getByRole('main').id).toBe('contenido');
  });
});

describe('AppShell: teléfono', () => {
  it('barra inferior: Resumen, Borrador, Compras, Catálogo y el botón «Más», con etiquetas visibles', () => {
    renderAt(shell(), { role: 'ADMINISTRADOR', path: COLLECTIVE_PATHS.catalog });
    const bottom = screen.getByRole('navigation', { name: 'Navegación rápida' });
    const labels = within(bottom).getAllByRole('link').map((link) => link.textContent?.trim());
    expect(labels).toEqual(['Resumen', 'Borrador', 'Compras', 'Catálogo']);
    expect(within(bottom).getByRole('link', { name: 'Catálogo' }).getAttribute('aria-current')).toBe('page');
    expect(moreButton().getAttribute('aria-expanded')).toBe('false');
    expect(bottom.className).toContain('ui-bottom-nav');
  });

  it('«Más» (DIRECTIVA): Histórico y estimaciones, Campañas y Bitácora con su descripción; sin Usuarios', () => {
    renderAt(shell(), { role: 'DIRECTIVA', path: COLLECTIVE_PATHS.summary });
    fireEvent.click(moreButton());
    const dialog = screen.getByRole('dialog', { name: 'Más' });
    const list = within(dialog).getByRole('list', { name: 'Otras secciones' });
    expect(within(list).getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([COLLECTIVE_PATHS.history, '/campaigns', '/audit-logs']);
    const history = within(list).getByRole('link', { name: 'Histórico y estimaciones' });
    expect(history.getAttribute('aria-describedby')).toBeTruthy();
    expect(document.getElementById(history.getAttribute('aria-describedby')!)!.textContent).toBe('Campañas selladas y consumo estimado');
    expect(within(dialog).queryByRole('link', { name: 'Usuarios' })).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Cerrar sesión' })).toBeTruthy();
  });

  it('«Más» (ADMINISTRADOR) incluye Usuarios', () => {
    renderAt(shell(), { role: 'ADMINISTRADOR', path: COLLECTIVE_PATHS.summary });
    fireEvent.click(moreButton());
    const list = within(screen.getByRole('dialog', { name: 'Más' })).getByRole('list', { name: 'Otras secciones' });
    expect(within(list).getByRole('link', { name: 'Usuarios' }).getAttribute('href')).toBe('/users');
  });

  it('menú «Más»: botón con nombre, foco en el primer enlace, Escape cierra y devuelve el foco', async () => {
    renderAt(shell(), { role: 'DIRECTIVA', path: COLLECTIVE_PATHS.summary });
    const toggle = moreButton();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.focus();
    fireEvent.click(toggle);
    const dialog = screen.getByRole('dialog', { name: 'Más' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(within(dialog).getByRole('link', { name: 'Histórico y estimaciones' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    // Escape deshace la entrada del historial del menú; el popstate lo cierra.
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Más' })).toBeNull());
    expect(document.activeElement).toBe(toggle);
  });

  it('el foco no sale del menú abierto con Tab', () => {
    renderAt(shell(), { role: 'DIRECTIVA', path: COLLECTIVE_PATHS.summary });
    fireEvent.click(moreButton());
    const dialog = screen.getByRole('dialog', { name: 'Más' });
    const logout = within(dialog).getByRole('button', { name: 'Cerrar sesión' });
    logout.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cerrar menú' }));
  });

  it('«Cerrar menú», volver a pulsar «Más» y elegir una sección cierran el menú', async () => {
    renderAt(shell(), { role: 'DIRECTIVA', path: COLLECTIVE_PATHS.summary });
    fireEvent.click(moreButton());
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar menú' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(moreButton());
    fireEvent.click(moreButton());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(moreButton());
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('link', { name: 'Campañas' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('en horizontal (sin barra inferior) la cabecera ofrece «Menú», que abre el mismo diálogo', () => {
    renderAt(shell(), { role: 'DIRECTIVA', path: COLLECTIVE_PATHS.summary });
    const menu = screen.getByRole('button', { name: 'Menú' });
    expect(menu.className).toContain('ui-header-menu');
    fireEvent.click(menu);
    expect(screen.getByRole('dialog', { name: 'Más' })).toBeTruthy();
  });

  /** H1 del emulador: el botón Atrás de Android con el menú abierto salía de la página. */
  describe('menú y botón Atrás (historial)', () => {
    const menuEntry = () => Boolean((window.history.state as Record<string, unknown> | null)?.agroMenu);
    beforeEach(() => window.history.replaceState(null, ''));

    it('abrir el menú añade una entrada del historial y Atrás (popstate) sólo cierra el menú', async () => {
      renderAt(shell(), { role: 'DIRECTIVA', path: COLLECTIVE_PATHS.summary });
      const url = window.location.href;
      fireEvent.click(moreButton());
      expect(menuEntry()).toBe(true);
      act(() => window.history.back());
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Más' })).toBeNull());
      expect(menuEntry()).toBe(false);
      expect(window.location.href).toBe(url);
    });

    it('cerrar con «Cerrar menú» deshace la entrada del menú (no queda un Atrás de más)', async () => {
      renderAt(shell(), { role: 'DIRECTIVA', path: COLLECTIVE_PATHS.summary });
      const back = vi.spyOn(window.history, 'back');
      fireEvent.click(moreButton());
      fireEvent.click(screen.getByRole('button', { name: 'Cerrar menú' }));
      expect(back).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(menuEntry()).toBe(false);
    });

    it('sin entrada del menú (p. ej. restaurada de otra forma), cerrar no retrocede en el historial', () => {
      renderAt(shell(), { role: 'DIRECTIVA', path: COLLECTIVE_PATHS.summary });
      fireEvent.click(moreButton());
      window.history.replaceState({}, '');
      const back = vi.spyOn(window.history, 'back');
      fireEvent.click(screen.getByRole('button', { name: 'Cerrar menú' }));
      expect(back).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('una entrada de menú anterior no impide cerrar el menú actual con Atrás', async () => {
      window.history.replaceState({ agroMenu: 'antigua' }, '');
      renderAt(shell(), { role: 'DIRECTIVA', path: COLLECTIVE_PATHS.summary });
      fireEvent.click(moreButton());
      fireEvent.click(screen.getByRole('button', { name: 'Cerrar menú' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('una página restaurada desde la caché del navegador (pageshow persisted) no vuelve con el menú abierto', () => {
      renderAt(shell(), { role: 'DIRECTIVA', path: COLLECTIVE_PATHS.summary });
      fireEvent.click(moreButton());
      const event = new Event('pageshow') as PageTransitionEvent;
      Object.defineProperty(event, 'persisted', { value: true });
      act(() => {
        window.dispatchEvent(event);
      });
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });
});
