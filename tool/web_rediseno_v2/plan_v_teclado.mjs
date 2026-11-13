// VERIFICACIÓN 10: teclado y foco, una página de cada área. Se recorre con Tab desde el inicio de la página registrando
// el elemento enfocado, si cumple :focus-visible y su anillo (outline / box-shadow). Un diálogo por área se abre con
// Enter sobre su botón: el foco debe quedar dentro y, al cerrar con Esc, volver al botón que lo abrió.
// Área A no tiene diálogo alcanzable con estos datos (ver plan_v_telefono): se usa el submenú del armazón y una pestaña.
const TOP = "() => { window.scrollTo(0, 0); document.activeElement?.blur?.(); document.body.focus(); return location.pathname + location.search; }";
const seq = (label, n = 12) => [{ assert: `${label}: inicio`, js: TOP }, { tab: n, record: `${label}: Tab ×${n}` }];
const dialog = (label, opener, extra = {}) => [
  { mark: opener, ...extra }, { wait: 1200 },
  { focusInfo: `${label}: foco al abrir` },
  { tab: 3, record: `${label}: Tab dentro del diálogo` },
  { tab: 12, record: `${label}: Tab ×12 (¿queda atrapado?)` },
  { escape: true }, { wait: 600 },
  { focusInfo: `${label}: foco tras Esc` },
];
export default [
  { role: 'anon', steps: [
    { goto: '/login', after: 2500 },
    ...seq('O · Ingresar', 5),
    { shot: 'foco/01-ingresar-tab', desc: 'Ingresar: foco tras Tab', full: false },
  ] },
  { role: 'directiva', steps: [
    { goto: '/colectivo/resumen', after: 3000 },
    ...seq('A · Resumen', 14),
    { shot: 'foco/03-resumen-tab', desc: 'Resumen: foco visible tras Tab', full: false },
    { goto: '/colectivo/propuestas', after: 3000 },
    { mark: '^Cómo se calculó', in: 'main' }, { focusInfo: 'A · Borrador: pestaña con teclado' },
    { key: 'ArrowLeft' }, { focusInfo: 'A · Borrador: flecha izquierda en las pestañas' },
    { goto: '/colectivo/compras-conjuntas', after: 3000 },
    ...seq('B · Compras conjuntas', 12),
    ...dialog('B · Nueva convocatoria', '^Nueva convocatoria'),
    { goto: '/colectivo/compras-conjuntas/c5e618a7-c7de-435d-ab0a-575dfe7c4891', after: 3000 },
    ...dialog('B · Conceder permiso', '^Conceder permiso'),
    { goto: '/colectivo/catalogo?vista=equivalencias', after: 3000 },
    ...seq('C · Nombres equivalentes', 12),
    { shot: 'foco/22-equivalencias-tab', desc: 'Nombres equivalentes: foco visible tras Tab', full: false },
    ...dialog('C · Unir con…', '^Unir con'),
    { goto: '/audit-logs', after: 3000 },
    ...seq('C · Bitácora', 10),
    { apiLog: 'teclado: llamadas (sólo GET esperados)' },
  ] },
];
