// Lote 1c: resto del lote 1b tras corregir la captura móvil (sin recarga).
export default [
  {
    role: 'directiva',
    steps: [
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
    ],
  },
];
