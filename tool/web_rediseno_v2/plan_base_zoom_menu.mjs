/**
 * Repetición del menú «Más» con zoom al 200 % (2026-11-13): la captura de página completa no
 * representa un panel fijo con desplazamiento propio, así que se captura la ventana visible, arriba
 * y con el panel desplazado hasta «Cerrar sesión». Sólo lectura.
 */
export default [
  {
    role: 'directiva',
    steps: [
      { viewport: 'zoom200' },
      { goto: '/colectivo/resumen', after: 6000 },
      { click: '^Menú$' },
      { shot: 'zoom200/43-menu-mas', desc: '«Más» con zoom al 200 %, abierto desde «Menú»: ventana visible, arriba', sizes: ['actual'], full: false },
      { scroll: '[data-testid="mobile-menu"] .ui-more-primary' },
      { shot: 'zoom200/43-menu-mas-tareas', desc: '«Más» con zoom al 200 %: tareas de la barra inferior repetidas en horizontal', sizes: ['actual'], full: false },
      { scroll: '[data-testid="mobile-menu"] .ui-gutter > button' },
      { shot: 'zoom200/43-menu-mas-final', desc: '«Más» con zoom al 200 %: panel desplazado hasta «Cerrar sesión»', sizes: ['actual'], full: false },
      { escape: true },
      { viewport: 'escritorio' },
    ],
  },
];
