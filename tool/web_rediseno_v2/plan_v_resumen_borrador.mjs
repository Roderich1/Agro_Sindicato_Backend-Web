// VERIFICACIÓN 2: Resumen → Borrador («Revisar borrador» y «Para atender») y Excel desde cada vista que lo ofrece.
// Comprueba que no hay ninguna opción CSV. Directiva, API real, sin escrituras.
const SIN_CSV = () => {
  const all = [...document.querySelectorAll('a, button, [role="menuitem"], option')];
  const csv = all.filter((e) => /csv/i.test(`${e.textContent} ${e.getAttribute('aria-label') ?? ''} ${e.getAttribute('href') ?? ''} ${e.getAttribute('download') ?? ''}`)).map((e) => e.outerHTML.slice(0, 120));
  const excel = all.filter((e) => /excel/i.test(`${e.textContent} ${e.getAttribute('aria-label') ?? ''}`)).map((e) => (e.getAttribute('aria-label') || e.textContent).trim());
  return { path: location.pathname + location.search, csv, csvEnTexto: /\bCSV\b/i.test(document.body.innerText), excel };
};
const ENLACES = () => {
  const a = [...document.querySelectorAll('a')];
  const review = a.find((x) => /Revisar borrador/.test(x.textContent));
  const attention = [...document.querySelectorAll('[data-testid^="action-"]')].map((s) => ({ testid: s.dataset.testid, text: s.textContent.trim(), href: s.closest('a')?.getAttribute('href') ?? null }));
  return { revisarBorrador: review?.getAttribute('href') ?? null, paraAtender: attention };
};
const DESTINO = () => ({ path: location.pathname + location.search, h1: [...document.querySelectorAll('h1')].map((h) => h.textContent.replace(/\s+/g, ' ').trim()) });
export default [
  { role: 'directiva', steps: [
    { wait: 2500 }, { apiLog: 'inicio de sesión' },
    { assert: 'Resumen: enlaces «Revisar borrador» y «Para atender»', js: ENLACES.toString() },
    { assert: 'Resumen: opciones de exportación', js: SIN_CSV.toString() },
    { download: 'Excel del Resumen' }, { apiLog: 'Excel del Resumen (llamadas)' },
    { mark: '^Revisar borrador' }, { waitPath: '^/colectivo/propuestas' },
    { assert: 'destino de «Revisar borrador»', js: DESTINO.toString() }, { apiLog: 'abrir el borrador (sólo GET)' },
    { assert: 'Borrador: opciones de exportación', js: SIN_CSV.toString() },
    { download: 'Excel del Borrador' }, { apiLog: 'Excel del Borrador (llamadas)' },
    { shot: 'resumen-borrador/06-borrador-desde-resumen', desc: 'Borrador abierto desde «Revisar borrador»', full: false },
    { goto: '/colectivo/resumen' }, { apiLog: 'volver al Resumen' },
    { clickSel: '[data-testid="action-review"]' }, { waitPath: '^/colectivo/propuestas' },
    { assert: 'destino de «Para atender» → «Revisar el borrador de compra»', js: DESTINO.toString() },
    { goto: '/colectivo/resumen' },
    { clickSel: '[data-testid="action-identification"]' }, { waitPath: '^/colectivo/catalogo' },
    { assert: 'destino de «Para atender» → «N productos por identificar»', js: DESTINO.toString() },
    { apiLog: 'navegación de «Para atender»' },
    { goto: '/colectivo/historico?vista=tendencias' },
    { assert: 'Histórico: opciones de exportación', js: SIN_CSV.toString() },
    { download: 'Excel del Histórico sellado' },
    { goto: '/colectivo/historico?vista=estimacion' },
    { assert: 'Estimación: opciones de exportación', js: SIN_CSV.toString() },
    { download: 'Excel de la Estimación' },
    { apiLog: 'Histórico y Estimación (llamadas)' },
    { goto: '/colectivo/cobertura' }, { assert: 'Cobertura: opciones de exportación', js: SIN_CSV.toString() },
    { goto: '/colectivo/compras-conjuntas' }, { assert: 'Compras conjuntas: opciones de exportación', js: SIN_CSV.toString() },
    { goto: '/colectivo/catalogo?vista=productos' }, { assert: 'Catálogo: opciones de exportación', js: SIN_CSV.toString() },
    { goto: '/campaigns' }, { assert: 'Campañas: opciones de exportación', js: SIN_CSV.toString() },
    { goto: '/audit-logs' }, { assert: 'Bitácora: opciones de exportación', js: SIN_CSV.toString() },
    { apiLog: 'resto de vistas (llamadas)' },
  ] },
];
