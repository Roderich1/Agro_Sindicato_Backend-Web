// VERIFICACIÓN 9, repetición para el Borrador: en plan_v_telefono la medida de /colectivo/propuestas se tomó antes de que
// cargara el borrador (el último elemento era el subtítulo «Borrador basado…»). Aquí se espera a la tabla y se mide al
// final de la página si la barra pegada «Preparar convocatoria» o la barra inferior tapan la última fila.
import planH from './plan_v_hallazgos.mjs';
const src = planH[0].steps.find((s) => s.assert?.startsWith('movil identificación')).js;
export default [
  { role: 'directiva', steps: [
    { viewport: 'movil' },
    { goto: '/colectivo/propuestas', after: 6000 }, { waitFor: 'main table, main [data-testid^="line-"], main li' }, { wait: 2000 },
    { assert: 'movil /colectivo/propuestas: última fila (cargado)', js: src },
    { shot: 'telefono/36-borrador-final', desc: 'Borrador a 390 al final de la página', full: false, sizes: ['actual'] },
    { viewport: 'zoom200' },
    { goto: '/colectivo/resumen', after: 3000 }, { goto: '/colectivo/propuestas', after: 6000 }, { wait: 2000 },
    { assert: 'zoom200 /colectivo/propuestas: última fila (cargado)', js: src },
    { shot: 'zoom200/06-borrador-final', desc: 'Borrador al 200 % al final de la página', full: false, sizes: ['actual'] },
  ] },
];
