/**
 * Plan de capturas de la sesión A (rediseño Web v2): Borrador de compra (láminas 06, 07, 08, 36 y 51).
 * Vite propio en 5181 → API aislada 3350.
 *   node tool/web_rediseno_v2/capture_base.mjs tool/web_rediseno_v2/plan_a_borrador.mjs docs/evidence/rediseno-web-v2/a
 * Sólo lectura: no se genera borrador, no se obtiene ni se quita la referencia y no se guarda la selección.
 * Se marca una casilla para ver la barra (cambio local sin guardar) y se recarga la vista para descartarlo.
 */
export default [
  {
    role: 'directiva',
    steps: [
      { goto: '/colectivo/propuestas', after: 7000 },
      { apiLog: 'al entrar en el borrador' },
      { shot: 'borrador/06-borrador-actual', desc: 'Borrador actual (lámina 06)', sizes: ['escritorio', 'portatil', 'tableta'] },
      { shot: 'borrador/06-borrador-actual-pantalla', desc: 'Borrador actual, primera pantalla', sizes: ['escritorio'], full: false },
      { measure: 'borrador 1440' },
      { check: 'input[data-testid="select-product"]' },
      { scroll: '[data-testid="selection-bar"]' },
      { shot: 'borrador/06-barra-con-cambios', desc: 'Barra con un producto marcado sin guardar (no se guarda)', sizes: ['escritorio'], full: false },
      { click: 'anteriores', in: '[role="tablist"]' },
      { shot: 'borrador/07-anteriores', desc: 'Borradores anteriores (lámina 07)', sizes: ['escritorio'] },
      { click: 'Cómo se calculó', in: '[role="tablist"]' },
      { shot: 'borrador/08-como-se-calculo', desc: 'Cómo se calculó (lámina 08)', sizes: ['escritorio', 'portatil'] },
      { open: '[data-testid="calculation"]' },
      { wait: 2500 },
      { shot: 'borrador/08-detalle-tecnico-abierto', desc: 'Detalle técnico con parámetros, fuentes e historial', sizes: ['escritorio'] },
      { apiLog: 'tras abrir el detalle técnico' },
      { clickSel: '[data-testid="calculation"] summary' },
      { click: 'Borrador actual', in: '[role="tablist"]' },
      { viewport: 'movil' },
      { goto: '/colectivo/propuestas', after: 6000 },
      { shot: 'telefono/36-borrador-telefono', desc: 'Borrador en teléfono (lámina 36, 390 px por ancho de navegador)', sizes: ['actual'] },
      { measure: 'borrador 390' },
      { click: 'Cómo se calculó', in: '[role="tablist"]' },
      { shot: 'telefono/51-como-se-calculo-telefono', desc: 'Cómo se calculó en teléfono (lámina 51)', sizes: ['actual'] },
      { viewport: 'zoom200' },
      { goto: '/colectivo/propuestas', after: 5000 },
      { shot: 'zoom200/06-borrador-zoom200', desc: 'Borrador al 200 %', sizes: ['actual'] },
      { measure: 'borrador zoom 200' },
      { viewport: 'escritorio' },
    ],
  },
];
