/**
 * Plan de capturas de la sesión B (compras conjuntas) del rediseño Web v2, 2026-11-13.
 * Vite propio en 5182 → API aislada 3350 (datos sintéticos). Se ejecuta con
 * `node capture_base.mjs plan_b_compras.mjs docs/evidence/rediseno-web-v2/b`; las variables salen de
 * `_wt/ET2-BE/tool/etapa3/e3env.sh` y `WEB_URL=http://127.0.0.1:5182`.
 * Nada se crea ni se modifica desde aquí: los diálogos se abren y se cierran con Esc. El único dato
 * creado para estas capturas (lámina 17) lo hace `datos_b.cjs revoked`, por la API real.
 */
const CAMPAIGN = 'ec4db92b-9067-4083-944c-eae96e7571bc';
const LIST = `/colectivo/compras-conjuntas?campaign=${CAMPAIGN}`;
const call = (id) => `/colectivo/compras-conjuntas/${id}?campaign=${CAMPAIGN}`;
const ID = {
  draft: '2a461584-350c-4a15-9036-aa8b5e14404f', // Convocatoria E3-P2 con origen (Directiva DEMO)
  open: 'c5e618a7-c7de-435d-ab0a-575dfe7c4891', // Convocatoria P-C y N7 (Directiva DEMO)
  closed: '514f346e-b245-4be0-89dd-f1c90bbf3684', // Compra conjunta desde propuesta E3 (cierre manual)
  closedAuto: '97d993e8-5621-4d63-8773-09c7f612b9aa', // Herbicidas invierno 2026
  closedConv: 'e6a66b78-7d5b-4bc3-a2cf-90c8b7235179', // CONV-1 a CONV-2
  cancelled: '56b761a0-40e1-48a6-8fe8-5c3295012623', // P-A concurrencia 16:36:26
  successor: '69bfef4a-be8e-4464-9e70-7aafc6a7cf15', // P-A app anterior (Sucesora PA)
  ineligible: '2894efd3-8294-4ace-a4b5-87c89e719be1', // demostración (Responsable PA no habilitada)
  noAccess: 'a351af7a-9f84-4d7e-a41d-0a7857ec55bc', // P-A concurrencia (abierta)
};
const T = ['escritorio', 'portatil', 'tableta'];

export default [
  {
    role: 'directiva',
    steps: [
      { goto: LIST, after: 6000 },
      { shot: 'lista/09-compras-conjuntas', desc: 'Lista (lámina 09): filtros con contador, abiertas, borradores y terminadas', sizes: T },
      { measure: 'escritorio lista' },
      { click: '^Ver quién lo tiene' },
      { shot: 'lista/09-permiso-sustituir-lectura', desc: 'Franja «Sustituir responsable» desplegada en modo lectura (U.4)', sizes: ['escritorio'] },
      { click: '^Ocultar$' },
      { click: '^Abiertas' },
      { shot: 'lista/09-filtro-abiertas', desc: 'Filtro «Abiertas» con su contador', sizes: ['escritorio'], full: false },
      { click: '^Canceladas' },
      { shot: 'lista/09-filtro-canceladas', desc: 'Filtro «Canceladas»', sizes: ['escritorio'], full: false },
      { click: '^Todas' },
      { click: '^Nueva convocatoria$' },
      { shot: 'dialogos/15-1-nueva-convocatoria', desc: 'Nueva convocatoria (15.1): ayudas H-14 y H-15; no se envía', sizes: ['escritorio'], full: false },
      { click: '^De un borrador de compra$' },
      { shot: 'dialogos/15-1-nueva-desde-borrador', desc: 'Nueva convocatoria con productos de un borrador de compra; no se envía', sizes: ['escritorio'], full: false },
      { click: '^Cancelar$' },

      { goto: call(ID.draft), after: 6000 },
      { shot: 'detalle/10-borrador', desc: 'Borrador (lámina 10), responsable', sizes: T },
      { click: '^Abrir convocatoria…$' },
      { shot: 'dialogos/15-2-abrir', desc: 'Abrir (15.2): botón desactivado hasta marcar la casilla', sizes: ['escritorio'], full: false },
      { escape: true },
      { click: '^Cancelar convocatoria…$' },
      { shot: 'dialogos/15-4-cancelar', desc: 'Cancelar (15.4): motivo obligatorio y casilla', sizes: ['escritorio'], full: false },
      { escape: true },
      { click: '^Editar$' },
      { shot: 'dialogos/34-1-editar', desc: 'Editar la convocatoria (34.1), sólo en borrador; no se envía', sizes: ['escritorio'], full: false },
      { click: '^Cancelar$' },

      { goto: call(ID.open), after: 6000 },
      { shot: 'detalle/11-abierta-responsable', desc: 'Abierta, vista por la responsable (lámina 11)', sizes: T },
      { open: 'details[data-testid="access-rules"]' },
      { shot: 'detalle/11-como-funciona-el-acceso', desc: '«Cómo funciona el acceso» desplegado', sizes: ['escritorio'] },
      { click: '^Cerrar y consolidar…$' },
      { shot: 'dialogos/15-3-cerrar', desc: 'Cerrar y consolidar (15.3)', sizes: ['escritorio'], full: false },
      { escape: true },
      { click: '^Conceder permiso$' },
      { shot: 'dialogos/15-5-conceder', desc: 'Conceder permiso (15.5)', sizes: ['escritorio'], full: false },
      { escape: true },
      { click: '^Retirar «' },
      { shot: 'dialogos/34-2-retirar', desc: 'Retirar el permiso (34.2)', sizes: ['escritorio'], full: false },
      { escape: true },

      { goto: call(ID.closed), after: 6000 },
      { shot: 'detalle/12-cerrada-consolidado', desc: 'Cerrada con consolidado, cierre manual (lámina 12)', sizes: T },
      { goto: call(ID.cancelled), after: 6000 },
      { shot: 'detalle/13-cancelada', desc: 'Cancelada por Administración, vista por la Directiva (lámina 13)', sizes: T },
      { goto: call(ID.ineligible), after: 6000 },
      { shot: 'detalle/20-responsable-no-habilitada', desc: 'Responsable no habilitada, con «Sustituir responsable…» y «Renunciar» (lámina 20)', sizes: T },
      { click: '^Sustituir responsable…$' },
      { shot: 'dialogos/15-6-sustituir', desc: 'Sustituir a la responsable (15.6); no se envía', sizes: ['escritorio'], full: false },
      { escape: true },
      { click: '^Renunciar a este permiso$' },
      { shot: 'dialogos/20-renunciar-suspendido', desc: 'Renunciar a un permiso suspendido (confirmación; no se envía)', sizes: ['escritorio'], full: false },
      { escape: true },
      { key: 'Tab', times: 3 },
      { shot: 'foco/20-foco-cabecera', desc: 'Foco visible (lima) en la cabecera oscura', sizes: ['escritorio'], full: false },

      { viewport: 'movil' },
      { goto: LIST, after: 6000 },
      { shot: 'telefono/37-compras-conjuntas', desc: 'Lista en teléfono (lámina 37)', sizes: ['actual'] },
      { measure: 'movil lista' },
      { click: '^Nueva convocatoria$' },
      { shot: 'telefono/45-nueva-convocatoria', desc: 'Formulario en teléfono (lámina 45), hoja inferior; no se envía', sizes: ['actual'], full: false },
      { click: '^Cancelar$' },
      { goto: call(ID.open), after: 6000 },
      { shot: 'telefono/38-abierta-responsable', desc: 'Abierta en teléfono (lámina 38)', sizes: ['actual'] },
      { measure: 'movil abierta' },
      { click: '^Cancelar convocatoria…$' },
      { shot: 'telefono/46-cancelar-hoja-inferior', desc: 'Confirmación con motivo en hoja inferior (lámina 46); no se envía', sizes: ['actual'], full: false },
      { escape: true },
      { goto: call(ID.ineligible), after: 6000 },
      { measure: 'movil no habilitada' },
      { click: '^Sustituir responsable…$' },
      { shot: 'telefono/49-sustituir', desc: 'Sustituir a la responsable en teléfono (lámina 49); no se envía', sizes: ['actual'], full: false },
      { escape: true },
      { viewport: 'zoom200' },
      { goto: call(ID.open), after: 6000 },
      { shot: 'zoom200/11-abierta', desc: 'Abierta al 200 %', sizes: ['actual'] },
      { measure: 'zoom200 abierta' },
      { goto: LIST, after: 5000 },
      { shot: 'zoom200/09-lista', desc: 'Lista al 200 %', sizes: ['actual'] },
      { measure: 'zoom200 lista' },
      { viewport: 'escritorio' },
    ],
  },
  {
    role: 'admin',
    steps: [
      { goto: call(ID.closed), after: 6000 },
      { shot: 'detalle/18-cerrada-sin-permiso', desc: 'Cerrada vista por Administración sin «Consultar participantes» (lámina 18)', sizes: T },
      { goto: call(ID.closedAuto), after: 6000 },
      { shot: 'detalle/19-cerrada-menos-de-3', desc: 'Cerrada con menos de 3 por producto, sin permiso (lámina 19)', sizes: T },
      { goto: call(ID.open), after: 6000 },
      { shot: 'detalle/11b-abierta-colaboradora', desc: 'Abierta vista por una colaboradora con «Consultar participantes» (CONV-2)', sizes: ['escritorio'] },
    ],
  },
  {
    role: 'admin2',
    steps: [
      { goto: call(ID.noAccess), after: 6000 },
      { shot: 'detalle/16-sin-permiso-participantes', desc: 'Abierta sin «Consultar participantes» (lámina 16)', sizes: T },
      { goto: call(ID.open), after: 6000 },
      { shot: 'detalle/17-permiso-retirado', desc: 'Permiso retirado (lámina 17; dato creado con datos_b.cjs revoked)', sizes: T },
      { viewport: 'movil' },
      { goto: call(ID.open), after: 6000 },
      { shot: 'telefono/48-permiso-retirado', desc: 'Permiso retirado en teléfono (lámina 48)', sizes: ['actual'] },
      { measure: 'movil permiso retirado' },
      { viewport: 'escritorio' },
    ],
  },
  {
    role: 'suc',
    steps: [
      { goto: call(ID.successor), after: 6000 },
      { shot: 'detalle/14-nueva-responsable', desc: 'Nueva responsable con permisos por revisar (lámina 14)', sizes: T },
      { click: '^Confirmar «' },
      { shot: 'dialogos/14-confirmar-permiso', desc: 'Confirmar un permiso suspendido; no se envía', sizes: ['escritorio'], full: false },
      { escape: true },
      { viewport: 'movil' },
      { goto: call(ID.successor), after: 6000 },
      { shot: 'telefono/50-nueva-responsable', desc: 'Nueva responsable en teléfono (lámina 50)', sizes: ['actual'] },
      { measure: 'movil nueva responsable' },
      { viewport: 'escritorio' },
    ],
  },
];
