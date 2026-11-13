// VERIFICACIÓN: capturas sobre la integración (06283da) para las comparativas que no tenían una vigente.
// 01 con copia sin conexión guardada · 06/08 página entera con píldoras · 49 diálogo de sustituir desplazado a 390 ·
// 48 y 50 a 390 tras la adopción de B · 51 a 390. Sólo lectura: «Guardar copia» guarda en el navegador de captura,
// que se descarta; el diálogo de sustituir se cierra sin enviar.
const DEMO = '/colectivo/compras-conjuntas/2894efd3-8294-4ace-a4b5-87c89e719be1';
const PCN7 = '/colectivo/compras-conjuntas/c5e618a7-c7de-435d-ab0a-575dfe7c4891';
const APP_ANT = '/colectivo/compras-conjuntas/69bfef4a-be8e-4464-9e70-7aafc6a7cf15';
export default [
  { role: 'directiva', steps: [
    { goto: '/colectivo/propuestas', after: 5000 },
    { shot: 'capturas/06-borrador-pagina', desc: 'Borrador actual, página entera (píldoras)' },
    { click: '^Cómo se calculó', in: 'main' }, { wait: 1500 },
    { shot: 'capturas/08-como-se-calculo-pagina', desc: 'Cómo se calculó, página entera' },
    { viewport: 'movil' }, { wait: 1500 },
    { shot: 'capturas/51-como-se-calculo', desc: 'Cómo se calculó a 390', sizes: ['actual'] },
    { goto: DEMO, after: 4000 },
    { clickSel: '[data-testid="substitute-open"]' }, { wait: 2000 },
    { probe: '49: desplazar el diálogo hasta el final', js: "(() => { const d = document.querySelector('[data-testid=\"substitute-dialog\"]'); const s = [d, ...d.querySelectorAll('*')].find((e) => e.scrollHeight > e.clientHeight + 4 && getComputedStyle(e).overflowY !== 'visible'); if (s) s.scrollTop = s.scrollHeight; return s ? [s.scrollHeight, s.clientHeight] : null; })()" },
    { wait: 800 },
    { shot: 'capturas/49-sustituir-final', desc: 'Sustituir a la responsable a 390, desplazado hasta el motivo y la casilla (no se envía)', full: false, sizes: ['actual'] },
    { probe: '49: volver arriba', js: "(() => { const d = document.querySelector('[data-testid=\"substitute-dialog\"]'); [d, ...d.querySelectorAll('*')].forEach((e) => { e.scrollTop = 0; }); return true; })()" },
    { escape: true },
    { viewport: 'escritorio' },
    // 01: guardar la copia de la estimación y cerrar la sesión
    { goto: '/colectivo/historico?vista=estimacion', after: 5000 },
    { click: '^Guardar copia' }, { wait: 4000 },
    { assert: '01: copia guardada', js: "() => (document.querySelector('main')?.innerText.match(/[^\\n]*(sin conexión|copia)[^\\n]*/gi) ?? []).slice(0, 3)" },
    { click: '^Cerrar sesión$' }, { waitPath: '^/login' }, { wait: 2000 },
    { assert: '01: aviso de copia en Ingresar', js: "() => document.querySelector('[data-testid=\"offline-copy-link\"]')?.innerText ?? null" },
    { shot: 'capturas/01-ingresar-con-copia', desc: 'Ingresar con una copia de la estimación en este navegador', full: false, allowLogin: true, mobile: true },
    { apiLog: 'directiva: llamadas (sólo GET y el cierre de sesión)' },
  ] },
  { role: 'admin2', steps: [
    { viewport: 'movil' }, { goto: PCN7, after: 4000 },
    { shot: 'capturas/48-permiso-retirado', desc: 'Convocatoria con permiso retirado a 390 (Administración PA 2)', sizes: ['actual'] },
  ] },
  { role: 'suc', steps: [
    { viewport: 'movil' }, { goto: APP_ANT, after: 4000 },
    { shot: 'capturas/50-nueva-responsable', desc: 'Nueva responsable a 390 (Sucesora PA)', sizes: ['actual'] },
  ] },
];
