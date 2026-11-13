// VERIFICACIÓN 3: convocatoria nueva «Recorrido v2 (sintética)», de principio a fin, con Directiva y desde la interfaz.
// U.1 («Preparar convocatoria →» desde el borrador) se abre y se cancela sin enviar: el producto guardado en la
// selección del borrador ya está en otra convocatoria abierta de la campaña, así que la convocatoria se crea con
// «Nueva convocatoria» y un producto libre del catálogo. Crear y abrir no deben generar compras, deudas ni inventario.
// No toca las convocatorias existentes de las láminas 10–20.
const NAME = 'Recorrido v2 (sintética)';
const DEADLINE = '2026-11-20T18:00';
const FILA = (name) => `() => { const li = [...document.querySelectorAll('[data-testid^="call-row-"]')].filter((l) => l.textContent.includes(${JSON.stringify(name)})); return { path: location.pathname + location.search, filas: li.map((l) => ({ texto: l.innerText.replace(/\\s+/g, ' ').trim().slice(0, 220), seccion: l.closest('section')?.querySelector('h2,h3')?.textContent?.trim() ?? null })) }; }`;
const DETALLE = () => {
  const card = (re) => { const h = [...document.querySelectorAll('h2,h3')].find((x) => re.test(x.textContent)); const s = h?.closest('section, [data-testid]'); return s ? s.innerText.replace(/\s+/g, ' ').trim().slice(0, 500) : null; };
  return {
    path: location.pathname,
    h1: [...document.querySelectorAll('h1')].map((h) => h.textContent.trim()),
    estado: document.querySelector('[data-testid="call-status"]')?.textContent?.trim() ?? null,
    secciones: [...document.querySelectorAll('h2')].map((h) => h.textContent.trim()),
    consolidado: card(/Consolidado al cierre/),
    actividad: card(/Actividad/),
    productos: card(/Pedido hasta ahora|Productos/),
    avisos: [...document.querySelectorAll('[role="status"], [role="alert"]')].map((n) => n.textContent.trim()).filter(Boolean).slice(0, 4),
  };
};
const DIALOGO = () => {
  const d = document.querySelector('[role="dialog"]');
  if (!d) return { dialogo: null };
  return {
    titulo: d.querySelector('h2')?.textContent?.trim() ?? null,
    botones: [...d.querySelectorAll('button')].map((b) => `${b.textContent.replace(/\s+/g, ' ').trim()}${b.disabled ? ' [desactivado]' : ''}`),
    casillas: [...d.querySelectorAll('input[type="checkbox"]')].map((c) => c.checked),
    origen: [...d.querySelectorAll('[data-testid="call-product-source"] [aria-pressed="true"], [data-testid="call-product-source"] [aria-checked="true"], [data-testid="call-product-source"] input:checked')].map((b) => b.textContent?.trim() || b.value),
    preparado: d.querySelector('[data-testid="prepared-notice"]')?.textContent?.trim() ?? null,
    borrador: d.querySelector('#call-proposal')?.selectedOptions?.[0]?.textContent ?? null,
    lineasMarcadas: [...d.querySelectorAll('[data-testid^="proposal-line-"] input:checked')].length,
    texto: d.innerText.replace(/\s+/g, ' ').trim().slice(0, 600),
  };
};
const RUTA = () => location.pathname + location.search.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, '<id>');
const BITACORA = () => [...document.querySelectorAll('li, tr')].map((l) => l.innerText.replace(/\s+/g, ' ').trim()).filter((t) => t.includes('Recorrido v2')).slice(0, 6);

export default [
  { role: 'directiva', steps: [
    { wait: 2000 }, { apiLog: 'inicio de sesión' },
    // U.1
    { goto: '/colectivo/propuestas' }, { apiLog: 'borrador' },
    { click: '^Preparar convocatoria' }, { waitPath: 'nueva=1' }, { wait: 2500 },
    { assert: 'U.1: ruta tras «Preparar convocatoria →»', js: RUTA.toString() },
    { assert: 'U.1: formulario preajustado', js: DIALOGO.toString() },
    { shot: 'convocatoria/u1-preparar-desde-borrador', desc: 'U.1: formulario abierto desde el borrador, sin enviar', full: false },
    { apiLog: 'U.1: llamadas (sin escrituras)' },
    { click: '^Cancelar$', in: '[role="dialog"]' }, { inspect: 'U.1: tras cancelar' },
    { click: '^(Descartar|Salir sin guardar|Sí, descartar)', in: '[role="dialog"], [role="alertdialog"]' }, { inspect: 'U.1: tras descartar (si lo pidió)' },
    { apiLog: 'U.1: cancelar (sin escrituras)' },
    // Crear
    { goto: '/colectivo/compras-conjuntas' },
    { assert: 'lista antes de crear', js: FILA(NAME) },
    { click: '^Nueva convocatoria' }, { wait: 2500 },
    { type: ['#call-name', NAME] }, { setValue: ['#call-deadline', DEADLINE] },
    { selectByText: ['#call-responsible', '\\(usted\\)'] },
    { click: '^Fertilizante foliar DEMO', in: '[role="dialog"]' },
    { assert: 'formulario lleno antes de crear', js: DIALOGO.toString() },
    { shot: 'convocatoria/01-formulario-lleno', desc: 'Nueva convocatoria con los datos, antes de crear', full: false },
    { apiLog: 'antes de crear' },
    { click: '^Crear borrador$', in: '[role="dialog"]' }, { wait: 3000 },
    { inspect: 'tras «Crear borrador»' },
    { apiLog: 'CREAR: llamadas' },
    { assert: 'lista tras crear', js: FILA(NAME) },
    { shot: 'convocatoria/02-lista-borrador', desc: 'Lista: la nueva convocatoria en Borradores', full: false },
    { click: 'Recorrido v2' }, { waitPath: '^/colectivo/compras-conjuntas/[0-9a-f-]{36}' }, { wait: 2000 },
    { assert: 'detalle en borrador', js: DETALLE.toString() }, { apiLog: 'detalle en borrador (llamadas)' },
    { shot: 'convocatoria/03-detalle-borrador', desc: 'Detalle en borrador' },
    // Abrir
    { mark: '^Abrir convocatoria…' }, { focusInfo: 'diálogo «Abrir» recién abierto' },
    { assert: 'diálogo «Abrir» sin confirmar', js: DIALOGO.toString() },
    { check: '[role="dialog"] input[type="checkbox"]' },
    { assert: 'diálogo «Abrir» con la casilla', js: DIALOGO.toString() },
    { shot: 'convocatoria/04-dialogo-abrir', desc: 'Confirmación de abrir', full: false },
    { apiLog: 'antes de abrir' },
    { click: '^Abrir convocatoria$', in: '[role="dialog"]' }, { wait: 3500 },
    { apiLog: 'ABRIR: llamadas' },
    { assert: 'detalle abierta', js: DETALLE.toString() },
    { shot: 'convocatoria/05-detalle-abierta', desc: 'Detalle abierta' },
    { goto: '/colectivo/compras-conjuntas' }, { assert: 'lista tras abrir', js: FILA(NAME) },
    { click: 'Recorrido v2' }, { waitPath: '^/colectivo/compras-conjuntas/[0-9a-f-]{36}' }, { wait: 2000 },
    { apiLog: 'lista y detalle tras abrir' },
    // Cerrar
    { mark: '^Cerrar y consolidar…' },
    { assert: 'diálogo «Cerrar» sin confirmar', js: DIALOGO.toString() },
    { check: '[role="dialog"] input[type="checkbox"]' },
    { assert: 'diálogo «Cerrar» con la casilla', js: DIALOGO.toString() },
    { shot: 'convocatoria/06-dialogo-cerrar', desc: 'Confirmación de cerrar y consolidar', full: false },
    { apiLog: 'antes de cerrar' },
    { click: '^Cerrar convocatoria$', in: '[role="dialog"]' }, { wait: 3500 },
    { apiLog: 'CERRAR: llamadas' },
    { assert: 'detalle cerrada con consolidado y actividad', js: DETALLE.toString() },
    { shot: 'convocatoria/07-detalle-cerrada', desc: 'Cerrada: consolidado vacío y actividad' },
    { goto: '/colectivo/compras-conjuntas' }, { assert: 'lista tras cerrar', js: FILA(NAME) },
    { shot: 'convocatoria/08-lista-terminadas', desc: 'Lista: la convocatoria en Terminadas' },
    { goto: '/audit-logs' }, { assert: 'bitácora: filas de la convocatoria', js: BITACORA.toString() },
    { apiLog: 'listas y bitácora' },
  ] },
];
