// VERIFICACIÓN 8, U.3 con un borrador ANTERIOR: en plan_v_uniones el selector `:last-of-type` abrió el más reciente.
const ACTIVE = '/campaigns/ec4db92b-9067-4083-944c-eae96e7571bc';
const BORRADOR = () => {
  const strip = (h) => (h || '').replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, (m) => m.slice(0, 8));
  return {
    path: strip(location.pathname + location.search),
    pestanas: [...document.querySelectorAll('[role="tab"]')].map((t) => `${t.textContent.trim()}${t.getAttribute('aria-selected') === 'true' ? ' [activa]' : ''}`),
    generado: [...document.querySelectorAll('main p, main span, main dd')].map((e) => e.textContent.trim()).filter((t) => /Generado|generado/.test(t)).slice(0, 3),
    avisos: [...document.querySelectorAll('[role="status"], [role="alert"], [role="note"]')].map((n) => n.textContent.trim()).filter(Boolean).slice(0, 3),
    anterior: /anterior/i.test(document.querySelector('main')?.innerText ?? ''),
  };
};
export default [
  { role: 'directiva', steps: [
    { goto: ACTIVE }, { wait: 2000 },
    { clickSel: 'a[href*="borrador=84e18f96"]' }, { waitPath: 'borrador=84e18f96' }, { wait: 2500 },
    { assert: 'U.3 borrador anterior (11 nov, 19:45)', js: BORRADOR.toString() },
    { shot: 'uniones/u3-borrador-anterior', desc: 'U.3: borrador anterior abierto desde el detalle de campaña', full: false },
    { probe: 'U.3 qué borradores se pidieron, en orden (8 primeros caracteres)', js: "performance.getEntriesByType('resource').map((r) => new URL(r.name).pathname).filter((p) => p.includes('/collective/proposals/') && p.split('/').pop().length === 36).map((p) => p.split('/').pop().slice(0, 8))" },
    { apiLog: 'U.3 borrador anterior' },
  ] },
];
