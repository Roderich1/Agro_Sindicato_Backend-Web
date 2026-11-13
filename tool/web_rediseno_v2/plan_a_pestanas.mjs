/**
 * Ronda de adopción de la sesión A (rediseño Web v2): pestañas en píldora del Borrador (láminas 06, 07, 36 y 51)
 * y comprobación de desplazamiento horizontal del Borrador, el Histórico y la Estimación a 1440 y 390.
 * Vite propio en 5181 → API aislada 3350. Sólo lectura.
 *   node tool/web_rediseno_v2/capture_base.mjs tool/web_rediseno_v2/plan_a_pestanas.mjs docs/evidence/rediseno-web-v2/a
 */
export default [
  {
    role: 'directiva',
    steps: [
      { goto: '/colectivo/propuestas', after: 7000 },
      { shot: 'pestanas/06-borrador-actual-pildora', desc: 'Borrador actual con pestañas en píldora (lámina 06)', sizes: ['escritorio'], full: false },
      { measure: 'borrador 1440' },
      { click: 'anteriores', in: '[role="tablist"]' },
      { shot: 'pestanas/07-anteriores-pildora', desc: 'Borradores anteriores (4) en píldora (lámina 07)', sizes: ['escritorio'], full: false },
      { click: 'Cómo se calculó', in: '[role="tablist"]' },
      { shot: 'pestanas/08-como-se-calculo-pildora', desc: 'Cómo se calculó en píldora (lámina 08)', sizes: ['escritorio'], full: false },
      { goto: '/colectivo/historico?vista=tendencias', after: 6000 },
      { measure: 'histórico 1440' },
      { goto: '/colectivo/historico?vista=estimacion', after: 6000 },
      { measure: 'estimación 1440' },
      { viewport: 'movil' },
      { goto: '/colectivo/propuestas', after: 6000 },
      { click: 'Borrador actual', in: '[role="tablist"]' },
      { shot: 'pestanas/36-borrador-pildora-telefono', desc: 'Borrador en teléfono con pestañas en píldora (lámina 36)', sizes: ['actual'], full: false },
      { measure: 'borrador 390' },
      { click: 'Cómo se calculó', in: '[role="tablist"]' },
      { shot: 'pestanas/51-como-se-calculo-pildora-telefono', desc: 'Cómo se calculó en teléfono (lámina 51)', sizes: ['actual'], full: false },
      { goto: '/colectivo/historico?vista=tendencias', after: 6000 },
      { measure: 'histórico 390' },
      { goto: '/colectivo/historico?vista=estimacion', after: 6000 },
      { measure: 'estimación 390' },
      { viewport: 'escritorio' },
    ],
  },
];
