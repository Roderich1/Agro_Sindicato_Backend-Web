/**
 * Plan de capturas de la sesión A (rediseño Web v2): Histórico sellado, Estimación del consumo y copia sin
 * conexión (láminas 25, 26, 27 y 40). Vite propio en 5181 → API aislada 3350.
 *   node tool/web_rediseno_v2/capture_base.mjs tool/web_rediseno_v2/plan_a_historico.mjs docs/evidence/rediseno-web-v2/a
 * Sólo lectura: no se pulsa «Generar estimación» ni «Guardar copia». La copia sin conexión se captura en sus
 * estados sin copia guardada (no se escribe nada en el navegador de captura).
 */
export default [
  {
    role: 'directiva',
    steps: [
      { goto: '/colectivo/historico?vista=tendencias', after: 7000 },
      { apiLog: 'al entrar en el histórico' },
      { shot: 'historico/25-historico-sellado', desc: 'Histórico sellado (lámina 25), H-10 provisional y cobertura por campaña', sizes: ['escritorio', 'portatil', 'tableta'] },
      { measure: 'histórico 1440' },
      { click: '^Necesidad declarada$' },
      { wait: 2500 },
      { shot: 'historico/25-historico-necesidad', desc: 'Histórico sellado, «Necesidad declarada»', sizes: ['escritorio'], full: false },
      { goto: '/colectivo/historico?vista=estimacion', after: 7000 },
      { apiLog: 'al entrar en la estimación' },
      { shot: 'estimacion/26-estimacion', desc: 'Estimación del consumo (lámina 26)', sizes: ['escritorio', 'portatil', 'tableta'] },
      { measure: 'estimación 1440' },
      { goto: '/estimacion/copia-sin-conexion', after: 4000 },
      { shot: 'copia/27-copia-estado', desc: 'Copia sin conexión con la sesión abierta y sin copia guardada en este navegador (lámina 27, estado 2)', sizes: ['escritorio'] },
      { viewport: 'movil' },
      { goto: '/colectivo/historico?vista=tendencias', after: 6000 },
      { shot: 'telefono/40-historico-telefono', desc: 'Histórico sellado en teléfono (lámina 40, 390 px por ancho de navegador)', sizes: ['actual'] },
      { measure: 'histórico 390' },
      { goto: '/colectivo/historico?vista=estimacion', after: 6000 },
      { shot: 'telefono/26-estimacion-telefono', desc: 'Estimación en teléfono', sizes: ['actual'] },
      { measure: 'estimación 390' },
      { viewport: 'zoom200' },
      { goto: '/colectivo/historico?vista=tendencias', after: 5000 },
      { shot: 'zoom200/25-historico-zoom200', desc: 'Histórico al 200 %', sizes: ['actual'] },
      { measure: 'histórico zoom 200' },
      { viewport: 'escritorio' },
    ],
  },
  {
    role: 'anon',
    steps: [
      { goto: '/estimacion/copia-sin-conexion', after: 3000 },
      { shot: 'copia/27-copia-sin-sesion', desc: 'Copia sin conexión sin sesión ni acceso local (lámina 27, estado 3)', sizes: ['escritorio', 'movil'] },
    ],
  },
];
