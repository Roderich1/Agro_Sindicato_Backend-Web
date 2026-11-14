/**
 * Ronda 2 de la sesión C (2026-11-13): adopción de `PageHeader attachToHeader`, chips del detalle y alto mínimo
 * del catálogo. Vuelve a capturar 21, 28, 29, 31, 41 y 44 a 1440 y 390. Sólo lectura.
 *   node capture_base.mjs plan_c_ronda2.mjs ../../docs/evidence/rediseno-web-v2/c/ronda2
 */
const SIZES = ['escritorio', 'movil'];

export default [
  {
    role: 'directiva',
    steps: [
      { goto: '/colectivo/catalogo', after: 6000 },
      { shot: '21-39-catalogo-productos', desc: 'Catálogo · Productos con PageHeader pegado (láminas 21 y 39)', sizes: SIZES },
      { goto: '/campaigns', after: 5000 },
      { shot: '28-41-campanas', desc: 'Campañas con PageHeader pegado (láminas 28 y 41)', sizes: SIZES },
      { click: '^Ver detalle de', in: '[data-testid="active-campaign"]' },
      { wait: 4000 },
      { shot: '29-detalle-campana', desc: 'Detalle de campaña: chips junto al título y «Datos sintéticos» solo arriba (lámina 29)', sizes: SIZES },
    ],
  },
  {
    role: 'admin',
    steps: [
      { goto: '/users', after: 6000 },
      { shot: '31-44-usuarios', desc: 'Usuarios con el panel de B en modo gestión (láminas 31 y 44)', sizes: SIZES },
    ],
  },
];
