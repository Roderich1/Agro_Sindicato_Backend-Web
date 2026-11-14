// VERIFICACIÓN 9: teléfono (390 px por ancho de navegador; NO es un teléfono físico) y zoom al 200 % (720×450 a 2x).
// Navegación inferior y menú «Más», un diálogo de cada área (se cierra sin enviar), sin desplazamiento horizontal y sin
// que una barra fija tape la última fila. Área A no tiene diálogos alcanzables con estos datos (sólo «Sellar las
// cifras», que exige una campaña cerrada sin sellar y no la hay): se comprueba su barra fija del borrador.
const PCN7 = '/colectivo/compras-conjuntas/c5e618a7-c7de-435d-ab0a-575dfe7c4891';
const ROUTES = ['/colectivo/resumen', '/colectivo/propuestas', '/colectivo/compras-conjuntas', PCN7, '/colectivo/catalogo?vista=productos', '/colectivo/catalogo?vista=identificacion', '/colectivo/historico?vista=tendencias', '/colectivo/historico?vista=estimacion', '/campaigns', '/audit-logs'];
// Al final de la página: ¿alguna barra fija (navegación inferior o barra pegada al pie) tapa el último contenido?
const TAPA = () => {
  window.scrollTo(0, document.documentElement.scrollHeight);
  const vh = window.innerHeight;
  const fixed = [...document.querySelectorAll('body *')].filter((e) => { const p = getComputedStyle(e).position; if (p !== 'fixed' && p !== 'sticky') return false; const r = e.getBoundingClientRect(); return r.height > 0 && r.bottom >= vh - 2 && r.top > vh / 2; });
  const barTop = Math.min(vh, ...fixed.map((e) => e.getBoundingClientRect().top));
  const main = document.querySelector('main');
  const items = [...(main?.querySelectorAll('li, tr, p, button, a, h2, h3, dd, label') ?? [])].filter((e) => e.offsetParent !== null && !fixed.some((f) => f.contains(e)) && e.getBoundingClientRect().height > 0);
  const last = items.reduce((a, e) => (e.getBoundingClientRect().bottom > (a?.getBoundingClientRect().bottom ?? -1) ? e : a), null);
  const lastBottom = last ? Math.round(last.getBoundingClientRect().bottom) : null;
  return { path: location.pathname + location.search.replace(/[0-9a-f-]{36}/g, '<id>'), ancho: [document.documentElement.scrollWidth, document.documentElement.clientWidth], barras: fixed.map((e) => (e.getAttribute('aria-label') || e.className.toString().slice(0, 40))), barraArriba: Math.round(barTop), ultimo: last ? `${last.tagName.toLowerCase()}:${(last.textContent || '').trim().slice(0, 40)}` : null, ultimoAbajo: lastBottom, tapada: lastBottom !== null && lastBottom > barTop + 1 };
};
const DLG = () => {
  const d = document.querySelector('[role="dialog"], [role="alertdialog"]');
  if (!d) return { dialogo: null };
  const r = d.getBoundingClientRect();
  return { titulo: d.querySelector('h2')?.textContent?.trim(), caja: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], ventana: [innerWidth, innerHeight], desbordaDentro: d.scrollWidth > d.clientWidth + 1, ancho: [document.documentElement.scrollWidth, document.documentElement.clientWidth] };
};
const MAS = () => {
  const m = document.querySelector('[data-testid="mobile-menu"]');
  return { abierto: !!m, entradas: m ? [...m.querySelectorAll('a, button')].map((a) => (a.getAttribute('aria-label') || a.textContent).replace(/\s+/g, ' ').trim()).filter(Boolean) : [] };
};
const NAV = () => [...document.querySelectorAll('nav[aria-label="Navegación rápida"] a, nav[aria-label="Navegación rápida"] button')].map((a) => `${(a.getAttribute('aria-label') || a.textContent).replace(/\s+/g, ' ').trim()}${a.getAttribute('aria-current') ? ' [actual]' : ''}${a.getAttribute('aria-expanded') === 'true' ? ' [abierto]' : ''}`);
const tour = (vp) => ROUTES.flatMap((r) => [{ goto: r, after: 3000 }, { measure: `${vp} ${r}` }, { assert: `${vp} ${r}: última fila`, js: TAPA.toString() }]);
const dialog = (vp, label, opener, shot, extra = {}) => [
  { mark: opener, ...extra }, { wait: 1200 },
  { assert: `${vp} diálogo ${label}`, js: DLG.toString() },
  { shot: `telefono/${shot}`, desc: `${label} a ${vp}`, full: false, sizes: ['actual'] },
  { escape: true }, { focusInfo: `${vp} ${label}: foco tras Esc` },
];
export default [
  { role: 'directiva', steps: [
    { viewport: 'movil' },
    { goto: '/colectivo/resumen', after: 3000 },
    { assert: 'movil: barra inferior', js: NAV.toString() },
    ...tour('movil'),
    { goto: '/campaigns', after: 3000 }, { assert: 'movil: barra inferior en Campañas', js: NAV.toString() },
    { mark: '^Más$', in: 'nav[aria-label="Navegación rápida"]' }, { wait: 1000 },
    { assert: 'movil: menú «Más»', js: MAS.toString() }, { assert: 'movil: barra con «Más» abierto', js: NAV.toString() },
    { shot: 'telefono/43-menu-mas', desc: 'Menú «Más» a 390', full: false, sizes: ['actual'] },
    { escape: true }, { focusInfo: 'movil: foco tras cerrar «Más»' },
    // B: formulario a pantalla completa y confirmación con motivo (hoja inferior)
    { goto: '/colectivo/compras-conjuntas', after: 3000 },
    ...dialog('movil', 'Nueva convocatoria (B)', '^Nueva convocatoria', '45-nueva-convocatoria'),
    { goto: PCN7, after: 3000 },
    ...dialog('movil', 'Cancelar la convocatoria (B, no se envía)', '^Cancelar convocatoria…', '46-cancelar-hoja'),
    // C
    { goto: '/campaigns', after: 3000 },
    ...dialog('movil', 'Nueva campaña (C)', '^Nueva campaña', '30-1-nueva-campana'),
    { goto: '/colectivo/catalogo?vista=productos', after: 3000 },
    ...dialog('movil', 'Nuevo producto (C)', '^Nuevo producto', '30-4-nuevo-producto'),
    { apiLog: 'movil: llamadas (sólo GET esperados)' },
    // Zoom al 200 %
    { viewport: 'zoom200' },
    { goto: '/colectivo/resumen', after: 3000 },
    { assert: 'zoom200: barras', js: NAV.toString() },
    ...tour('zoom200'),
    { goto: '/colectivo/resumen', after: 3000 },
    { mark: '^(Menú|Más)$' }, { wait: 1000 },
    { assert: 'zoom200: menú', js: MAS.toString() },
    { shot: 'zoom200/43-menu', desc: 'Menú al 200 %', full: false, sizes: ['actual'] },
    { escape: true }, { focusInfo: 'zoom200: foco tras cerrar el menú' },
    { goto: '/colectivo/compras-conjuntas', after: 3000 },
    ...dialog('zoom200', 'Nueva convocatoria (B)', '^Nueva convocatoria', '45-nueva-convocatoria-zoom200'),
    { goto: '/campaigns', after: 3000 },
    ...dialog('zoom200', 'Nueva campaña (C)', '^Nueva campaña', '30-1-nueva-campana-zoom200'),
    { apiLog: 'zoom200: llamadas' },
  ] },
  { role: 'admin', steps: [
    { viewport: 'movil' },
    { goto: '/users', after: 3000 },
    { measure: 'movil /users' }, { assert: 'movil /users: última fila', js: TAPA.toString() },
    { mark: '^Más$', in: 'nav[aria-label="Navegación rápida"]' }, { wait: 1000 },
    { assert: 'movil: menú «Más» de Administración', js: MAS.toString() },
    { escape: true },
    ...dialog('movil', 'Nuevo usuario (C)', '^Nuevo usuario', '33-1-nuevo-usuario'),
    { viewport: 'zoom200' }, { goto: '/users', after: 3000 }, { measure: 'zoom200 /users' }, { assert: 'zoom200 /users: última fila', js: TAPA.toString() },
    { apiLog: 'admin: llamadas' },
  ] },
];
