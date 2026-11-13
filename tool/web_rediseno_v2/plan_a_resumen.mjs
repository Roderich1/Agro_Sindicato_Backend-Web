/**
 * Plan de capturas de la sesión A (rediseño Web v2): Resumen, estados y Cobertura
 * (láminas 03, 04, 05 §1–11 y 35). Vite propio en 5181 → API aislada 3350.
 *   node tool/web_rediseno_v2/capture_base.mjs tool/web_rediseno_v2/plan_a_resumen.mjs docs/evidence/rediseno-web-v2/a
 * Sólo lectura: no se pulsa ninguna acción que escriba. Los estados que la API
 * real no da (error, sin conexión, 429, sin permiso, política pendiente, cargando)
 * se simulan y su nombre lleva «SIMULADO».
 */
const SUMMARY = 'collective/campaigns/[^/]+/summary';

export default [
  {
    role: 'directiva',
    steps: [
      { goto: '/colectivo/resumen', after: 6000 },
      { shot: 'resumen/03-resumen', desc: 'Resumen (lámina 03), campaña activa', sizes: ['escritorio', 'portatil', 'tableta'] },
      { shot: 'resumen/03-resumen-pantalla', desc: 'Resumen, primera pantalla', sizes: ['escritorio'], full: false },
      { measure: 'resumen 1440' },
      { type: ['input[type="search"]', 'Fungi'] },
      { shot: 'resumen/03-resumen-busqueda', desc: 'Buscador en el navegador («Fungi»)', sizes: ['escritorio'], full: false },
      { type: ['input[type="search"]', 'zzz'] },
      { scroll: '[data-testid="needs-section"]' },
      { shot: 'resumen/05-sin-coincidencias', desc: 'Sin coincidencias con «Quitar filtros»', sizes: ['escritorio'], full: false },
      { click: '^Quitar filtros$' },
      { click: '^Ocultas$' },
      { scroll: '[data-testid="needs-section"]' },
      { shot: 'resumen/03-resumen-filtro-ocultas', desc: 'Filtro «Ocultas»', sizes: ['escritorio'], full: false },
      { click: '^Todos$' },
      { goto: '/colectivo/cobertura', after: 5000 },
      { shot: 'cobertura/04-cobertura', desc: 'Cobertura (lámina 04)', sizes: ['escritorio', 'portatil'] },
      { goto: '/colectivo/resumen', after: 5000 },
      { simulate: { url: SUMMARY, status: 500 } },
      { click: '^Actualizar$' },
      { wait: 1500 },
      { shot: 'estados/05-07-error-servidor', desc: 'Error del servidor (05 §7)', sizes: ['escritorio'], full: false },
      { simulate: { url: SUMMARY, status: 429, body: { statusCode: 429 } } },
      { click: '^Reintentar$' },
      { wait: 1500 },
      { shot: 'estados/05-09-servidor-ocupado', desc: 'Servidor ocupado, 429 (05 §9)', sizes: ['escritorio'], full: false },
      { simulate: { url: SUMMARY, status: 403, body: { statusCode: 403 } } },
      { click: '^Reintentar$' },
      { wait: 1500 },
      { shot: 'estados/05-08-sin-permiso', desc: 'Sin permiso, 403 (05 §8)', sizes: ['escritorio'], full: false },
      { simulate: { url: SUMMARY, status: 200, delayMs: 20000, body: {} } },
      { click: '^Actualizar$' },
      { wait: 1200 },
      { shot: 'estados/05-01-cargando', desc: 'Cargando (05 §1)', sizes: ['escritorio'], full: false },
      { wait: 20000 },
      { unsimulate: true },
      { click: '^Actualizar$' },
      { wait: 3000 },
      { viewport: 'movil' },
      { goto: '/colectivo/resumen', after: 5000 },
      { shot: 'telefono/35-resumen-telefono', desc: 'Resumen en teléfono (lámina 35, 390 px por ancho de navegador)', sizes: ['actual'] },
      { measure: 'resumen 390' },
      { goto: '/colectivo/cobertura', after: 4000 },
      { shot: 'telefono/04-cobertura-telefono', desc: 'Cobertura en teléfono', sizes: ['actual'] },
      { viewport: 'zoom200' },
      { goto: '/colectivo/resumen', after: 4000 },
      { shot: 'zoom200/03-resumen-zoom200', desc: 'Resumen al 200 %', sizes: ['actual'] },
      { measure: 'resumen zoom 200' },
      { viewport: 'escritorio' },
    ],
  },
];
