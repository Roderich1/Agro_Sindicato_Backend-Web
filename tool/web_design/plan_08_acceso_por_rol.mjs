// Lote 8 (WEB_URL de la rama chore/web-solo-institucional): acceso por rol tras retirar las vistas
// del agricultor. Verifica en el navegador real: aviso para AGRICULTOR al iniciar sesión y entrando
// por URL directa (rutas antiguas e institucionales), sin consultas institucionales; cambio y cierre
// de sesión; acceso normal de Directiva y Administración.
const DIRECT = [
  '/dashboard', '/inventory', '/purchases', '/sync', '/plots', '/applications', '/reports',
  '/colectivo/resumen', '/colectivo/compras-conjuntas', '/colectivo/catalogo?vista=identificacion',
  '/campaigns', '/calendar', '/audit-logs', '/users',
];
export default [
  {
    role: 'agricultor',
    steps: [
      { inspect: 'tras iniciar sesión' },
      { apiLog: 'al iniciar sesión' },
      { shot: '01_acceso/03_agricultor_sin_acceso_web', desc: 'Una cuenta AGRICULTOR al iniciar sesión: aviso breve, sin menú ni datos, con «Cambiar de cuenta» y «Cerrar sesión»', state: 'sin permiso', mobile: true },
      ...DIRECT.map((path) => [{ goto: path, reload: true, after: 4500 }, { inspect: `URL directa ${path}` }, { apiLog: `URL directa ${path}` }]).flat(),
      { click: '^Cambiar de cuenta$' },
      { wait: 2500 },
      { inspect: 'tras «Cambiar de cuenta»' },
      { apiLog: 'al cambiar de cuenta' },
    ],
  },
  {
    role: 'agricultor',
    steps: [
      { click: '^Cerrar sesión$' },
      { wait: 2500 },
      { inspect: 'tras «Cerrar sesión»' },
      { apiLog: 'al cerrar sesión' },
    ],
  },
  {
    role: 'directiva',
    steps: [
      { inspect: 'Directiva tras iniciar sesión' },
      { goto: '/inventory', reload: true },
      { inspect: 'Directiva en /inventory (ruta antigua)' },
      { goto: '/users' },
      { inspect: 'Directiva en /users' },
      { click: '^Cerrar sesión$' },
      { wait: 2500 },
      { inspect: 'Directiva tras cerrar sesión' },
    ],
  },
  {
    role: 'admin',
    steps: [
      { inspect: 'Administración tras iniciar sesión' },
      { goto: '/users' },
      { inspect: 'Administración en /users' },
      { goto: '/sync', reload: true },
      { inspect: 'Administración en /sync (ruta antigua)' },
    ],
  },
];
