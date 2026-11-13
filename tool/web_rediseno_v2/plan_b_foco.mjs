/**
 * Sesión B (2026-11-13): foco visible y retorno del foco. Se abre «Cerrar y consolidar…» con el
 * teclado (Intro sobre el botón enfocado), se cierra con Esc y se captura el foco lima de vuelta en el
 * botón de la cabecera oscura. Después, lo mismo con «Retirar» en la tarjeta blanca (anillo de tinta).
 * No se envía nada.
 */
const CAMPAIGN = 'ec4db92b-9067-4083-944c-eae96e7571bc';
const OPEN = 'c5e618a7-c7de-435d-ab0a-575dfe7c4891';

export default [
  {
    role: 'directiva',
    steps: [
      { goto: `/colectivo/compras-conjuntas/${OPEN}?campaign=${CAMPAIGN}`, after: 6000 },
      { click: '^Cerrar y consolidar…$' },
      { escape: true },
      { shot: 'foco/11-retorno-foco-cabecera', desc: 'Esc cierra el diálogo y el foco vuelve a «Cerrar y consolidar…» (anillo lima sobre la cabecera oscura)', sizes: ['escritorio'], full: false },
      { click: '^Retirar «' },
      { escape: true },
      { shot: 'foco/11-retorno-foco-retirar', desc: 'Esc cierra «Retirar el permiso» y el foco vuelve a «Retirar» (anillo de tinta sobre la tarjeta)', sizes: ['escritorio'], full: false },
    ],
  },
];
