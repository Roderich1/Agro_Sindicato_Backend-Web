/**
 * Segunda pasada de la sesión BASE (2026-11-13): Ingresar con el texto de los campos a 16 px y la
 * medida del desplazamiento horizontal a 390 px en las vistas del armazón (sólo lectura).
 */
const RUTAS = [
  '/colectivo/resumen',
  '/colectivo/propuestas',
  '/colectivo/compras-conjuntas',
  '/colectivo/catalogo',
  '/colectivo/historico',
  '/campaigns',
  '/audit-logs',
];

export default [
  {
    role: 'anon',
    steps: [
      { goto: '/login', after: 2500 },
      { shot: 'acceso/01-ingresar', desc: 'Ingresar (lámina 01), sin copia sin conexión', sizes: ['escritorio', 'portatil', 'movil'] },
      { viewport: 'movil' },
      { goto: '/login', after: 2000 },
      { measure: 'movil /login' },
      { viewport: 'escritorio' },
    ],
  },
  {
    role: 'directiva',
    steps: [
      { goto: '/colectivo/resumen', after: 6000 },
      { viewport: 'movil' },
      ...RUTAS.flatMap((ruta) => [{ goto: ruta, after: 5000 }, { measure: `movil ${ruta}` }]),
      { viewport: 'escritorio' },
    ],
  },
];
