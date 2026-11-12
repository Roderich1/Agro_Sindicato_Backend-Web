// Lote 6: diálogos en ancho móvil (las capturas móviles anteriores recargaban la página y lo cerraban).
const C = '/colectivo/compras-conjuntas';
export default [
  {
    role: 'directiva',
    steps: [
      { goto: `${C}/2894efd3-8294-4ace-a4b5-87c89e719be1` },
      { click: '^Sustituir responsable$' },
      { select: ['#substitute-user', 'Sucesora PA'] },
      { type: ['#substitute-reason', 'La responsable dejó de estar habilitada (motivo sintético)'] },
      { shot: '06_permisos_psa/02_sustituir_dialogo', desc: 'Diálogo de sustitución: implicaciones, quien sustituye no figura (nota), motivo y confirmación (no se envía)', state: 'diálogo', full: false, mobile: true },
      { escape: true },
      { goto: C },
      { click: '^Nueva convocatoria$' },
      { wait: 1500 },
      { shot: '05_convocatorias/06_nueva_desde_catalogo', desc: 'Formulario de convocatoria nueva (desde el catálogo; no se crea)', state: 'formulario', full: false, mobile: true },
      { escape: true },
      { goto: '/colectivo/propuestas?campaign=ec4db92b-9067-4083-944c-eae96e7571bc' },
      { click: '^Preparar convocatoria' },
      { wait: 3000 },
      { shot: '05_convocatorias/10_nueva_desde_propuesta', desc: 'Formulario de convocatoria precargado desde el borrador (no se crea)', state: 'formulario', full: false, mobile: true },
      { escape: true },
      { goto: '/colectivo/catalogo?vista=identificacion' },
      { wait: 2000 },
      { click: '^Vincular' },
      { wait: 3000 },
      { shot: '07_catalogo/06_vincular_dialogo', desc: 'Identificar: vincular a un producto existente (candidatos, motivo, confirmación; no se envía)', state: 'diálogo', full: false, mobile: true },
    ],
  },
];
