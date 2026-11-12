// Lote 8b: resto del lote 8 tras el límite de autenticación (20/min; en desarrollo cada recarga
// renueva dos veces por el doble efecto de React StrictMode). Más espaciado.
const DIRECT = ['/colectivo/catalogo?vista=identificacion', '/campaigns', '/calendar', '/audit-logs', '/users'];
export default [
  {
    role: 'agricultor',
    steps: [
      ...DIRECT.map((path) => [{ goto: path, reload: true, after: 9000 }, { inspect: `URL directa ${path}` }, { apiLog: `URL directa ${path}` }]).flat(),
      { click: '^Cambiar de cuenta$' },
      { wait: 3000 },
      { inspect: 'tras «Cambiar de cuenta»' },
      { apiLog: 'al cambiar de cuenta' },
    ],
  },
  {
    role: 'admin',
    steps: [
      { inspect: 'Administración tras iniciar sesión' },
      { goto: '/users' },
      { inspect: 'Administración en /users' },
      { goto: '/sync', reload: true, after: 8000 },
      { inspect: 'Administración en /sync (ruta antigua)' },
      { click: '^Cerrar sesión$' },
      { wait: 3000 },
      { inspect: 'Administración tras cerrar sesión' },
    ],
  },
];
