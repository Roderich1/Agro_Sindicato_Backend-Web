/**
 * Correcciones del orquestador (2026-11-13): sin franja superior en escritorio, «Datos sintéticos»
 * en la cabecera de la vista, conexión en la tarjeta de usuario; zoom al 200 % (720×450 a 2x) y
 * tableta (820) en Ingresar, el armazón con el Resumen y el menú «Más». Sólo lectura.
 */
const NAV_RAPIDA = 'nav[aria-label="Navegación rápida"]';

export default [
  {
    role: 'anon',
    steps: [
      { viewport: 'zoom200' },
      { goto: '/login', after: 3000 },
      { measure: 'zoom200 /login' },
      { shot: 'zoom200/01-ingresar', desc: 'Ingresar con zoom al 200 % (720×450 a 2x)', sizes: ['actual'] },
      { viewport: 'tableta' },
      { goto: '/login', after: 2500 },
      { measure: 'tableta /login' },
      { shot: 'tableta/01-ingresar', desc: 'Ingresar en tableta (820)', sizes: ['actual'] },
      { viewport: 'escritorio' },
    ],
  },
  {
    role: 'directiva',
    steps: [
      { goto: '/colectivo/resumen', after: 6000 },
      { shot: 'correcciones/03-resumen-sin-franja', desc: 'Escritorio sin franja superior: «Datos sintéticos» en la cabecera de la vista y conexión en la tarjeta de usuario', sizes: ['escritorio', 'portatil'], full: false },
      { goto: '/colectivo/historico', after: 6000 },
      { shot: 'correcciones/25-historico-chip-unico', desc: 'Cabecera con vista anidada: un solo «Datos sintéticos»', sizes: ['escritorio'], full: false },
      { click: '^Plegar la barra lateral$' },
      { shot: 'correcciones/barra-plegada-conexion', desc: 'Barra plegada: conexión sólo para lectores de pantalla si hay red', sizes: ['escritorio'], full: false },
      { click: '^Desplegar la barra lateral$' },
      { viewport: 'zoom200' },
      { goto: '/colectivo/resumen', after: 5000 },
      { measure: 'zoom200 /colectivo/resumen' },
      { shot: 'zoom200/03-resumen', desc: 'Armazón con el Resumen con zoom al 200 %: horizontal de poco alto, sin barra inferior y con «Menú»', sizes: ['actual'] },
      { shot: 'zoom200/03-resumen-pantalla', desc: 'Primera pantalla con zoom al 200 %', sizes: ['actual'], full: false },
      { click: '^Menú$' },
      { shot: 'zoom200/43-menu-mas', desc: '«Más» con zoom al 200 %, abierto desde «Menú» (incluye las tareas de la barra inferior)', sizes: ['actual'] },
      { escape: true },
      { viewport: 'tableta' },
      { goto: '/colectivo/resumen', after: 5000 },
      { measure: 'tableta /colectivo/resumen' },
      { shot: 'tableta/03-resumen-pantalla', desc: 'Armazón con el Resumen en tableta (820)', sizes: ['actual'], full: false },
      { click: '^Más$', in: NAV_RAPIDA },
      { shot: 'tableta/43-menu-mas', desc: '«Más» en tableta (820)', sizes: ['actual'], full: false },
      { escape: true },
      { viewport: 'escritorio' },
    ],
  },
];
