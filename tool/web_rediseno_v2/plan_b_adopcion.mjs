/**
 * Sesión B, ronda de adopción de la base (2026-11-13): 09, 37, 45 y 49 a 1440 y 390, y 11 y 38 por el
 * cambio de la tabla de participantes a `DataTable`. Sólo lectura: los diálogos se cierran con Esc o
 * «Cancelar». El botón «Sustituir responsable…» se pulsa con `clickSel` (en 390 px puede quedar bajo la
 * barra inferior fija).
 */
const CAMPAIGN = 'ec4db92b-9067-4083-944c-eae96e7571bc';
const LIST = `/colectivo/compras-conjuntas?campaign=${CAMPAIGN}`;
const OPEN = `/colectivo/compras-conjuntas/c5e618a7-c7de-435d-ab0a-575dfe7c4891?campaign=${CAMPAIGN}`;
const INELIGIBLE = `/colectivo/compras-conjuntas/2894efd3-8294-4ace-a4b5-87c89e719be1?campaign=${CAMPAIGN}`;

export default [
  {
    role: 'directiva',
    steps: [
      { goto: LIST, after: 6000 },
      { shot: 'adopcion/09-compras-conjuntas', desc: 'Lista con PageHeader pegado (lámina 09)', sizes: ['escritorio'] },
      { measure: 'escritorio lista' },
      { click: '^Nueva convocatoria$' },
      { shot: 'adopcion/15-1-nueva-convocatoria', desc: 'Formulario en escritorio; no se envía', sizes: ['escritorio'], full: false },
      { click: '^Cancelar$' },
      { goto: OPEN, after: 6000 },
      { shot: 'adopcion/11-abierta-responsable', desc: 'Participantes con DataTable (lámina 11)', sizes: ['escritorio'] },
      { goto: INELIGIBLE, after: 6000 },
      { clickSel: '[data-testid="substitute-open"]' },
      { shot: 'adopcion/15-6-sustituir', desc: 'Sustituir en escritorio; no se envía', sizes: ['escritorio'], full: false },
      { escape: true },
      { viewport: 'movil' },
      { goto: LIST, after: 6000 },
      // Primero la pantalla: la captura de página completa deja la página desplazada y la barra fija tapa la cabecera.
      { shot: 'adopcion/37-compras-conjuntas-pantalla', desc: 'Primera pantalla de la lista en teléfono', sizes: ['actual'], full: false },
      { shot: 'adopcion/37-compras-conjuntas', desc: 'Lista en teléfono (lámina 37): un solo h1, cabecera oscura', sizes: ['actual'] },
      { measure: 'movil lista' },
      { click: '^Nueva convocatoria$' },
      { shot: 'adopcion/45-nueva-convocatoria', desc: 'Formulario a pantalla completa en teléfono (lámina 45); no se envía', sizes: ['actual'], full: false },
      { click: '^Cancelar$' },
      { goto: OPEN, after: 6000 },
      { shot: 'adopcion/38-abierta-responsable', desc: 'Abierta en teléfono con participantes apilados (lámina 38)', sizes: ['actual'] },
      { measure: 'movil abierta' },
      { goto: INELIGIBLE, after: 6000 },
      { clickSel: '[data-testid="substitute-open"]' },
      { shot: 'adopcion/49-sustituir', desc: 'Sustituir a pantalla completa en teléfono (lámina 49); no se envía', sizes: ['actual'], full: false },
      { escape: true },
      { viewport: 'escritorio' },
    ],
  },
];
