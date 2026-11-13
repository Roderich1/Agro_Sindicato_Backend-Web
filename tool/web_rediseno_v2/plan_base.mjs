/**
 * Plan de capturas de la sesión BASE (rediseño Web v2, 2026-11-13).
 * Vite propio en 5180 → API aislada 3350 (datos sintéticos). Se ejecuta con
 * `node capture_base.mjs plan_base.mjs <carpeta>`; las variables salen de
 * `_wt/ET2-BE/tool/etapa3/e3env.sh` y `WEB_URL=http://127.0.0.1:5180`.
 * Nada se crea ni se modifica en la aplicación: los diálogos se abren y se cierran con Esc.
 */
const NAV_RAPIDA = 'nav[aria-label="Navegación rápida"]';

export default [
  {
    role: 'anon',
    steps: [
      { goto: '/login', after: 2500 },
      { shot: 'acceso/01-ingresar', desc: 'Ingresar (lámina 01), sin copia sin conexión', sizes: ['escritorio', 'portatil', 'movil'] },
      { key: 'Tab', times: 1 },
      { shot: 'foco/01-ingresar-foco-correo', desc: 'Foco visible en el campo de correo (teclado)', full: false },
    ],
  },
  {
    role: 'agricultor',
    steps: [
      { goto: '/sin-acceso-web', after: 2500 },
      { shot: 'acceso/02-aviso-agricultor', desc: 'Aviso para una cuenta de agricultor (lámina 02)', sizes: ['escritorio', 'portatil', 'movil'] },
    ],
  },
  {
    role: 'directiva',
    steps: [
      { goto: '/colectivo/resumen', after: 6000 },
      { shot: 'armazon/03-resumen-directiva', desc: 'Armazón con el Resumen actual (contenido de A sin rediseñar)', sizes: ['escritorio', 'portatil'] },
      { shot: 'armazon/03-resumen-directiva-pantalla', desc: 'Armazón con el Resumen, sólo la primera pantalla', sizes: ['escritorio'], full: false },
      { goto: '/colectivo/catalogo?vista=identificacion', after: 5000 },
      { shot: 'armazon/21-catalogo-grupo-abierto', desc: 'Grupo Catálogo abierto con «Por identificar» activo e insignia si hay pendientes', sizes: ['escritorio'], full: false },
      { click: '^Plegar la barra lateral$' },
      { shot: 'armazon/barra-plegada', desc: 'Barra lateral plegada (sólo iconos)', sizes: ['escritorio'], full: false },
      { click: '^Desplegar la barra lateral$' },
      { goto: '/colectivo/resumen', after: 5000 },
      { key: 'Tab', times: 4 },
      { shot: 'foco/03-foco-barra-lateral', desc: 'Foco visible (lima) en un ítem de la barra lateral oscura', sizes: ['escritorio'], full: false },
      { goto: '/campaigns', after: 5000 },
      { click: '^Nueva campaña$' },
      { shot: 'dialogos/30-nueva-campana-dialog', desc: 'Diálogo real (Modal → Dialog) «Nueva campaña»; no se envía', sizes: ['escritorio'], full: false },
      { escape: true },
      { viewport: 'movil' },
      { goto: '/colectivo/resumen', after: 5000 },
      { shot: 'telefono/35-resumen-telefono', desc: 'Resumen en teléfono (390): barra superior oscura y barra inferior', sizes: ['actual'] },
      { shot: 'telefono/35-resumen-telefono-pantalla', desc: 'Resumen en teléfono, primera pantalla', sizes: ['actual'], full: false },
      { click: '^Más$', in: NAV_RAPIDA },
      { shot: 'telefono/43-menu-mas-directiva', desc: 'Menú «Más» de la Directiva (lámina 43)', sizes: ['actual'], full: false },
      { escape: true },
      { goto: '/campaigns', after: 5000 },
      { click: '^Nueva campaña$' },
      { shot: 'telefono/46-dialogo-hoja-inferior', desc: 'Diálogo real «Nueva campaña» como hoja inferior en teléfono; no se envía', sizes: ['actual'], full: false },
      { escape: true },
      { viewport: 'escritorio' },
    ],
  },
  {
    role: 'admin',
    steps: [
      { goto: '/users', after: 6000 },
      { shot: 'armazon/31-usuarios-administrador', desc: 'Armazón del Administrador: Usuarios en «Sindicato»', sizes: ['escritorio'], full: false },
      { viewport: 'movil' },
      { goto: '/colectivo/resumen', after: 5000 },
      { click: '^Más$', in: NAV_RAPIDA },
      { shot: 'telefono/44-menu-mas-administrador', desc: 'Menú «Más» del Administrador, con Usuarios', sizes: ['actual'], full: false },
      { escape: true },
      { viewport: 'escritorio' },
    ],
  },
];
