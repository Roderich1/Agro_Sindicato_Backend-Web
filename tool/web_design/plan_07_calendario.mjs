// Lote 7: Calendario, fuera del menú colectivo pero accesible por URL a la Directiva.
export default [
  { role: 'directiva', steps: [
    { goto: '/calendar' },
    { inspect: 'calendario' },
    { shot: '10_administracion/06_calendario_fuera_del_menu', desc: 'Calendario operativo (pantalla heredada, fuera del menú colectivo; se llega por URL)', state: 'heredada' },
  ] },
];
