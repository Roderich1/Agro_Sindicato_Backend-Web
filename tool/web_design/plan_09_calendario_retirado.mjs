// Lote 9 (WEB_URL de chore/web-solo-institucional): el Calendario retirado. Enlace antiguo /calendar
// por rol y llamadas a la API (no debe haber /calendar/events ni /users).
export default [
  {
    role: 'directiva',
    steps: [
      { apiLog: 'tras iniciar sesión' },
      { goto: '/calendar', reload: true, after: 6000 },
      { inspect: 'Directiva en /calendar (URL directa)' },
      { apiLog: 'Directiva /calendar' },
    ],
  },
  {
    role: 'admin',
    steps: [
      { apiLog: 'tras iniciar sesión' },
      { goto: '/calendar', reload: true, after: 6000 },
      { inspect: 'Administración en /calendar (URL directa)' },
      { apiLog: 'Administración /calendar' },
    ],
  },
  {
    role: 'agricultor',
    steps: [
      { apiLog: 'tras iniciar sesión' },
      { goto: '/calendar', reload: true, after: 6000 },
      { inspect: 'Agricultor en /calendar (URL directa)' },
      { apiLog: 'Agricultor /calendar' },
    ],
  },
];
