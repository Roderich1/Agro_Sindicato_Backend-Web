/**
 * Sesión B, segunda pasada (2026-11-13): lámina 49 en teléfono. En 390 px el botón «Sustituir
 * responsable…» del aviso puede quedar bajo la barra inferior fija; el clic de Puppeteer caía en
 * «Compras» de esa barra. Aquí se pulsa con `clickSel` (clic del propio elemento, tras desplazarlo
 * al centro). Además, tras dejar activos los selectores de persona mientras cargan (para que reciban el
 * foco inicial), se repiten 15.5 y 15.6 en escritorio. No se envía nada: los diálogos se cierran con Esc.
 */
const CAMPAIGN = 'ec4db92b-9067-4083-944c-eae96e7571bc';
const INELIGIBLE = '2894efd3-8294-4ace-a4b5-87c89e719be1';
const OPEN = 'c5e618a7-c7de-435d-ab0a-575dfe7c4891';

export default [
  {
    role: 'directiva',
    steps: [
      { goto: `/colectivo/compras-conjuntas/${OPEN}?campaign=${CAMPAIGN}`, after: 6000 },
      { click: '^Conceder permiso$' },
      { shot: 'dialogos/15-5-conceder', desc: 'Conceder permiso (15.5): foco inicial en «Persona»; no se envía', sizes: ['escritorio'], full: false },
      { escape: true },
      { goto: `/colectivo/compras-conjuntas/${INELIGIBLE}?campaign=${CAMPAIGN}`, after: 6000 },
      { clickSel: '[data-testid="substitute-open"]' },
      { shot: 'dialogos/15-6-sustituir', desc: 'Sustituir a la responsable (15.6): foco inicial en la persona; no se envía', sizes: ['escritorio'], full: false },
      { escape: true },
      { viewport: 'movil' },
      { goto: `/colectivo/compras-conjuntas/${INELIGIBLE}?campaign=${CAMPAIGN}`, after: 6000 },
      { shot: 'telefono/20-responsable-no-habilitada', desc: 'Responsable no habilitada en teléfono', sizes: ['actual'] },
      { clickSel: '[data-testid="substitute-open"]' },
      { shot: 'telefono/49-sustituir', desc: 'Sustituir a la responsable en teléfono (lámina 49), hoja inferior; no se envía', sizes: ['actual'], full: false },
      { escape: true },
      { viewport: 'escritorio' },
    ],
  },
];
