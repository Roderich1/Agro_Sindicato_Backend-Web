// VERIFICACIÓN: confirmar sobre la integración (5177, 06283da) las diferencias que las comparativas marcaron como
// posibles defectos (las capturas de las sesiones eran de sus ramas) y repetir la medida de «última fila tapada» de
// plan_v_telefono sin contar lo que está dentro de un <details> cerrado ni las celdas pegadas a la izquierda de una
// tabla (falsos positivos de la primera medida). Directiva y Administración, sólo lectura.
const SINT = () => ({ path: location.pathname + location.search, chip: [...document.querySelectorAll('main *')].filter((e) => e.children.length === 0 && /^Datos sintéticos$/.test(e.textContent.trim()) && e.offsetParent !== null).length });
const UNIDADES = () => { const t = document.querySelector('main')?.innerText ?? ''; return { path: location.pathname + location.search, KG: (t.match(/\d\s?KG\b/g) ?? []).length, kg: (t.match(/\d\s?kg\b/g) ?? []).length, ejemplos: (t.match(/[\d.,]+\s?(KG|kg)\b/g) ?? []).slice(0, 4) }; };
const DECIMALES = () => { const t = document.querySelector('main')?.innerText ?? ''; return { largos: (t.match(/\d+,\d{4,}\s?(KG|kg|L)?/g) ?? []).slice(0, 6), total: (t.match(/\d+,\d{4,}/g) ?? []).length }; };
const TAPA = () => {
  window.scrollTo(0, document.documentElement.scrollHeight);
  const vh = window.innerHeight;
  const bars = [...document.querySelectorAll('body *')].filter((e) => { const cs = getComputedStyle(e); if (!(cs.position === 'fixed' || (cs.position === 'sticky' && cs.bottom !== 'auto'))) return false; const r = e.getBoundingClientRect(); return r.height > 0 && r.bottom >= vh - 2 && r.top > vh / 2; });
  const barTop = Math.min(vh, ...bars.map((e) => e.getBoundingClientRect().top));
  const items = [...document.querySelectorAll('main li, main tr, main p, main button, main a, main h2, main h3, main dd, main label')].filter((e) => e.offsetParent !== null && !e.closest('details:not([open])') && !bars.some((f) => f.contains(e)) && e.getBoundingClientRect().height > 0);
  const last = items.reduce((a, e) => (e.getBoundingClientRect().bottom > (a?.getBoundingClientRect().bottom ?? -1) ? e : a), null);
  const lastBottom = last ? Math.round(last.getBoundingClientRect().bottom) : null;
  return { path: location.pathname + location.search, barras: bars.map((e) => e.getAttribute('aria-label') || e.tagName.toLowerCase()), barraArriba: Math.round(barTop), ultimo: last ? `${last.tagName.toLowerCase()}:${(last.textContent || '').trim().slice(0, 50)}` : null, ultimoAbajo: lastBottom, tapada: lastBottom !== null && lastBottom > barTop + 1 };
};
// Borrador en teléfono, primera pantalla: ¿la franja de la referencia queda bajo una barra fija?
const FRANJA = () => {
  window.scrollTo(0, 0);
  const vh = innerHeight;
  const q = document.querySelector('[aria-label="Quitar referencia"]');
  const fixed = [...document.querySelectorAll('body *')].filter((e) => { const cs = getComputedStyle(e); return cs.position === 'fixed' || (cs.position === 'sticky' && cs.bottom !== 'auto'); }).map((e) => ({ e, r: e.getBoundingClientRect() })).filter(({ r }) => r.height > 0 && r.bottom > 0 && r.top < vh);
  const qr = q?.getBoundingClientRect();
  return { quitar: qr ? [Math.round(qr.top), Math.round(qr.bottom)] : null, barras: fixed.map(({ e, r }) => `${e.getAttribute('aria-label') || e.tagName.toLowerCase()}:${Math.round(r.top)}-${Math.round(r.bottom)}`), solapa: qr ? fixed.some(({ r }) => qr.bottom > r.top && qr.top < r.bottom) : null };
};
export default [
  { role: 'directiva', steps: [
    // D1: chip «Datos sintéticos» (H-03: no en vistas sin respuesta colectiva, p. ej. Bitácora)
    ...['/colectivo/resumen', '/colectivo/compras-conjuntas', '/colectivo/catalogo?vista=productos', '/campaigns', '/audit-logs'].flatMap((r) => [{ goto: r, after: 3000 }, { assert: `D1 chip en ${r}`, js: SINT.toString() }]),
    // D2/D3: unidades y decimales
    ...['/colectivo/resumen', '/colectivo/propuestas', '/colectivo/catalogo?vista=productos', '/colectivo/historico?vista=estimacion', '/colectivo/historico?vista=tendencias'].flatMap((r) => [{ goto: r, after: 3000 }, { assert: `D2 unidades en ${r}`, js: UNIDADES.toString() }]),
    { goto: '/colectivo/historico?vista=estimacion', after: 3000 }, { assert: 'D3 decimales en la Estimación', js: DECIMALES.toString() },
    { shot: 'hallazgos/26-estimacion-decimales', desc: 'Estimación: cifras con muchos decimales', full: false },
    // D7: Histórico
    { goto: '/colectivo/historico?vista=tendencias', after: 3000 },
    { assert: 'D7 Histórico: enlaces repetidos y campaña sin sellar', js: "() => ({ verCampanas: [...document.querySelectorAll('main a')].filter((a) => /Ver campañas y cobertura/.test(a.textContent)).length, sinSellar: (document.querySelector('main')?.innerText.match(/[^\\n]*(sin sellar|no sellada|Sin sellar)[^\\n]*/gi) ?? []).slice(0, 4) })" },
    // D6: Campañas
    { goto: '/campaigns', after: 3000 },
    { assert: 'D6 recuento de «Otras campañas»', js: "() => ({ recuento: document.querySelector('[data-testid=\"campaign-counts\"]')?.textContent?.trim(), filasDebajo: document.querySelectorAll('[aria-label=\"Otras campañas\"] li').length })" },
    // Teléfono
    { viewport: 'movil' },
    { goto: '/colectivo/catalogo?vista=productos', after: 3000 },
    { assert: 'D5 catálogo en teléfono: pestañas y recuentos', js: "() => [...document.querySelectorAll('main a, main [role=\"tab\"]')].map((a) => a.textContent.replace(/\\s+/g, ' ').trim()).filter((t) => /Productos|equivalentes|identificar|unido/.test(t))" },
    { goto: '/colectivo/catalogo?vista=identificacion', after: 3000 }, { assert: 'movil identificación: última fila (sin <details> cerrados)', js: TAPA.toString() },
    { goto: '/colectivo/historico?vista=tendencias', after: 3000 }, { assert: 'movil histórico: última fila (sin celdas pegadas)', js: TAPA.toString() },
    { goto: '/campaigns', after: 3000 },
    { assert: 'D4 «Más» marcado en Campañas', js: "() => [...document.querySelectorAll('nav[aria-label=\"Navegación rápida\"] a, nav[aria-label=\"Navegación rápida\"] button')].map((a) => `${a.textContent.trim()}${a.getAttribute('aria-current') ? ' [actual]' : ''}`)" },
    { shot: 'hallazgos/41-campanas-barra', desc: 'Campañas a 390: barra inferior sin sección marcada', full: false, sizes: ['actual'] },
    { goto: '/colectivo/propuestas', after: 3500 },
    { assert: 'D9 borrador en teléfono: franja de la referencia frente a barras fijas', js: FRANJA.toString() },
    { shot: 'hallazgos/36-borrador-primera-pantalla', desc: 'Borrador a 390, primera pantalla', full: false, sizes: ['actual'] },
    { goto: '/colectivo/compras-conjuntas', after: 3000 },
    { click: '^Nueva convocatoria' }, { wait: 2500 },
    { assert: 'D8 formulario en teléfono: alto de la lista de productos y responsable', js: "() => { const ul = document.querySelector('[role=\"dialog\"] ul[aria-label=\"Productos del catálogo\"]'); return { lista: ul ? [ul.clientHeight, ul.scrollHeight] : null, responsable: document.querySelector('#call-responsible')?.selectedOptions[0]?.textContent }; }" },
    { shot: 'hallazgos/45-formulario', desc: 'Nueva convocatoria a 390', full: false, sizes: ['actual'] },
    { escape: true },
  ] },
  { role: 'admin', steps: [
    { goto: '/users', after: 3000 }, { assert: 'D1 chip en /users', js: SINT.toString() },
    { assert: 'D12 Usuarios: filas y rótulo', js: "() => ({ filas: document.querySelectorAll('[aria-label=\"Usuarios\"] li').length, rotulo: document.querySelector('[data-testid=\"users-shown\"]')?.textContent ?? null })" },
    { viewport: 'movil' }, { goto: '/users', after: 3000 }, { assert: 'movil /users: última fila (sin <details> cerrados)', js: TAPA.toString() },
    { shot: 'hallazgos/44-usuarios-final', desc: 'Usuarios a 390, al final de la página', full: false, sizes: ['actual'] },
  ] },
];
