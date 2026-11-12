// Lote 5b: estados simulados con recarga propia (una respuesta vacía con 200 rompe la página).
export default [
  {
    role: 'directiva',
    steps: [
      { simulate: { url: '/api/v1/joint-purchase-calls/c5e618a7', status: 503, delayMs: 20000 } },
      { goto: '/colectivo/compras-conjuntas/c5e618a7-c7de-435d-ab0a-575dfe7c4891', reload: true, after: 3000 },
      { shot: '99_simulados/07_convocatoria_cargando', desc: 'Detalle de convocatoria mientras carga (respuesta retrasada)', state: 'carga', full: false },
      { wait: 20000 },
      { shot: '99_simulados/07b_convocatoria_error_503', desc: 'Detalle de convocatoria cuando la API responde 503 tras la espera (respuesta simulada)', state: 'error', full: false },
      { simulate: { url: '/api/v1/product-identification', status: 500 } },
      { goto: '/colectivo/catalogo?vista=identificacion', reload: true },
      { shot: '99_simulados/08_por_identificar_error', desc: 'Por identificar cuando la API responde 500 (respuesta simulada)', state: 'error' },
      { unsimulate: true },
    ],
  },
];
