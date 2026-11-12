// Lote 5c: identificación con error y vacía (respuestas simuladas, ruta correcta).
export default [
  {
    role: 'directiva',
    steps: [
      { simulate: { url: '/catalog/identification-requests\?status=PENDING', status: 500 } },
      { goto: '/colectivo/catalogo?vista=identificacion', reload: true },
      { shot: '99_simulados/08_por_identificar_error', desc: 'Por identificar cuando la API responde 500 (respuesta simulada)', state: 'error' },
      { simulate: { url: '/catalog/identification-requests\?status=PENDING', status: 200, body: [] } },
      { goto: '/colectivo/catalogo?vista=identificacion', reload: true },
      { shot: '99_simulados/09_por_identificar_vacio', desc: 'Por identificar sin solicitudes pendientes (respuesta simulada: lista vacía)', state: 'vacío' },
      { unsimulate: true },
    ],
  },
];
