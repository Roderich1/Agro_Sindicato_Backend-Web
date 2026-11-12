// Lote 5: estados que NO se reproducen con el entorno real. Van en 99_simulados/ y su nombre lo dice:
//  - __FIXTURE: páginas de desarrollo del propio código (src/dev, sólo con Vite) que montan la página
//    real con datos sintéticos fijos, sin API.
//  - __SIMULADO: página real con la sesión real, pero con UNA respuesta de la API sustituida por el guion.
const R = '/src/dev/resumen-prototipos.html?v=1&datos=';
const B = '/src/dev/break-ui.html?';
export default [
  {
    role: 'anon',
    steps: [
      ...['cargando', 'error', 'sinpermiso', 'sincampanas', 'politica', 'vacia', 'cerrada', 'sellada'].map((k) => [
        { goto: `${R}${k}` },
        { shot: `99_simulados/01_resumen_${k}__FIXTURE`, desc: `Resumen real montado con el fixture «${k}» (src/dev/resumen-prototipos.html, sin API)`, state: k },
      ]).flat(),
      { goto: `${B}datos=worst&pantalla=propuestas` },
      { shot: '99_simulados/02_propuestas_peor_caso__FIXTURE', desc: 'Necesidades y propuestas con el fixture «worst» (nombres largos, estados extremos; src/dev/break-ui.html)', state: 'peor caso', mobile: true },
      { goto: `${B}datos=empty&pantalla=propuestas` },
      { shot: '99_simulados/03_propuestas_vacia__FIXTURE', desc: 'Necesidades y propuestas sin datos (fixture «empty»)', state: 'vacío' },
      { goto: `${B}datos=worst&pantalla=historico` },
      { shot: '99_simulados/04_historico_peor_caso__FIXTURE', desc: 'Histórico con el fixture «worst»', state: 'peor caso' },
      { goto: `${B}datos=worst&pantalla=catalogo` },
      { shot: '99_simulados/05_catalogo_peor_caso__FIXTURE', desc: 'Catálogo con el fixture «worst» (muchos productos, nombres largos)', state: 'peor caso' },
    ],
  },
  {
    role: 'directiva',
    steps: [
      { simulate: { url: '/api/v1/joint-purchase-calls(\\?|$)', status: 500 } },
      { goto: '/colectivo/compras-conjuntas', reload: true },
      { shot: '99_simulados/06_convocatorias_error', desc: 'Lista de convocatorias cuando la API responde 500 (respuesta simulada)', state: 'error' },
      { simulate: { url: '/api/v1/joint-purchase-calls/c5e618a7', status: 200, delayMs: 25000, body: {} } },
      { goto: '/colectivo/compras-conjuntas/c5e618a7-c7de-435d-ab0a-575dfe7c4891', after: 2500 },
      { shot: '99_simulados/07_convocatoria_cargando', desc: 'Detalle de convocatoria mientras carga (respuesta retrasada)', state: 'carga', full: false },
      { unsimulate: true },
      { wait: 25000 },
      { simulate: { url: '/api/v1/product-identification', status: 500 } },
      { goto: '/colectivo/catalogo?vista=identificacion' },
      { shot: '99_simulados/08_por_identificar_error', desc: 'Por identificar cuando la API responde 500 (respuesta simulada)', state: 'error' },
      { simulate: { url: '/api/v1/product-identification', status: 200, body: { requests: [], next_cursor: null } } },
      { goto: '/colectivo/catalogo?vista=productos' },
      { goto: '/colectivo/catalogo?vista=identificacion' },
      { shot: '99_simulados/09_por_identificar_vacio', desc: 'Por identificar sin solicitudes (respuesta simulada vacía; la forma exacta del cuerpo no se verificó)', state: 'vacío' },
      { unsimulate: true },
    ],
  },
];
