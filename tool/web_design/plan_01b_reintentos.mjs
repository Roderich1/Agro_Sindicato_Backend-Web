// Lote 1b: el lote 1 recargaba la página en cada paso y el límite de autenticación cerró la sesión
// (capturas de la pantalla de inicio de sesión). Se repite con navegación dentro de la aplicación.
export default [
  {
    role: 'directiva',
    steps: [
      { goto: '/colectivo/compras-conjuntas' },
      { shot: '05_convocatorias/01_lista', desc: 'Lista de convocatorias (varias, con nombres largos y todos los estados)', mobile: true },
      { goto: '/colectivo/cobertura' },
      { shot: '02_resumen/02_cobertura', desc: 'Cobertura (agricultores vinculados y con aporte)', mobile: true },
      { goto: '/colectivo/historico' },
      { shot: '08_historico/01_historico_tendencias', desc: 'Histórico y estimaciones: tendencias selladas', mobile: true },
      { goto: '/colectivo/historico?vista=estimacion' },
      { shot: '08_historico/02_estimacion', desc: 'Histórico y estimaciones: estimación del consumo', mobile: true },
      { goto: '/colectivo/catalogo' },
      { shot: '07_catalogo/01_catalogo', desc: 'Catálogo y equivalencias (vista inicial)', mobile: true },
      { goto: '/colectivo/catalogo?vista=equivalencias' },
      { shot: '07_catalogo/02_equivalencias', desc: 'Equivalencias', mobile: true },
      { goto: '/colectivo/catalogo?vista=productos' },
      { shot: '07_catalogo/03_productos', desc: 'Productos del sindicato', mobile: true },
      { goto: '/campaigns' },
      { shot: '09_campanas/01_campanas', desc: 'Campañas', mobile: true },
      { goto: '/audit-logs' },
      { shot: '10_administracion/01_bitacora_directiva', desc: 'Bitácora (Directiva)', mobile: true },
      { goto: '/users' },
      { shot: '10_administracion/02_usuarios_directiva_redirige', desc: 'La Directiva no entra a Usuarios: vuelve a su inicio', state: 'sin permiso' },
      { simulate: { url: '/catalog/identification-requests\?', status: 500 } },
      { goto: '/colectivo/catalogo?vista=identificacion', reload: true },
      { shot: '99_simulados/08_por_identificar_error', desc: 'Por identificar cuando la API responde 500 (respuesta simulada)', state: 'error' },
      { simulate: { url: '/catalog/identification-requests\?', status: 200, body: [] } },
      { goto: '/colectivo/catalogo?vista=identificacion', reload: true },
      { shot: '99_simulados/09_por_identificar_vacio', desc: 'Por identificar sin solicitudes (respuesta simulada: lista vacía)', state: 'vacío' },
      { unsimulate: true },
    ],
  },
  {
    role: 'suc',
    steps: [
      { goto: '/colectivo/compras-conjuntas/69bfef4a-be8e-4464-9e70-7aafc6a7cf15' },
      { open: 'details' },
      { shot: '06_permisos_psa/03_sucesora_restringida', desc: 'Nueva responsable: datos restringidos hasta que cada agricultor la autorice; permisos suspendidos por revisar', state: 'restringido', mobile: true },
    ],
  },
];
