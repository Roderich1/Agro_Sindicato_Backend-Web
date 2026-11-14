// VERIFICACIÓN 8: uniones §U (TAREAS_POR_SESION.md). Directiva, sólo lectura.
// U.7/U.2: Campaña → Resumen e Histórico · U.3: detalle de campaña → borrador concreto (?borrador=) ·
// U.5: Catálogo → Identificación y equivalencias · U.9: «Cómo se calculó» → Estimación.
// U.1 (borrador → convocatoria) está en plan_v_convocatoria; U.4 (Usuarios ↔ permiso) en plan_v_pa;
// U.6 (convocatoria → participantes, permisos y actividad) en plan_v_participantes y plan_v_convocatoria.
const ACTIVE = '/campaigns/ec4db92b-9067-4083-944c-eae96e7571bc';
const CLOSED = '/campaigns/b044b7c1-1d79-48d0-821d-e73e876e8a03'; // Invierno 2025, cerrada y sellada
const ID = /[0-9a-f]{8}-[0-9a-f-]{27}/g;
const ENLACES = () => {
  const strip = (h) => (h || '').replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, (m) => m.slice(0, 8));
  return {
    path: strip(location.pathname + location.search),
    h1: document.querySelector('h1')?.textContent?.trim(),
    enlaces: [...document.querySelectorAll('main a[href]')].map((a) => `${(a.getAttribute('aria-label') || a.textContent).replace(/\s+/g, ' ').trim().slice(0, 50)} → ${strip(a.getAttribute('href'))}`).filter((t) => /colectivo|campaigns|users|audit/.test(t)).slice(0, 25),
  };
};
const BORRADOR = () => {
  const strip = (h) => (h || '').replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, (m) => m.slice(0, 8));
  return {
    path: strip(location.pathname + location.search),
    pestanas: [...document.querySelectorAll('[role="tab"]')].map((t) => `${t.textContent.trim()}${t.getAttribute('aria-selected') === 'true' ? ' [activa]' : ''}`),
    cabecera: document.querySelector('main')?.innerText?.replace(/\s+/g, ' ').trim().slice(0, 300),
    avisos: [...document.querySelectorAll('[role="status"], [role="alert"]')].map((n) => n.textContent.trim()).filter(Boolean).slice(0, 3),
  };
};
export default [
  { role: 'directiva', steps: [
    { apiLog: 'inicio de sesión' },
    // U.7 / U.2 / U.3 desde el detalle de la campaña activa
    { goto: ACTIVE }, { wait: 2000 },
    { assert: 'detalle de campaña activa: enlaces', js: ENLACES.toString() },
    { click: '^Ver resumen' }, { waitPath: '^/colectivo/resumen' },
    { assert: 'U.7 Ver resumen → destino', js: ENLACES.toString() },
    { goto: ACTIVE }, { wait: 1500 },
    { clickSel: 'a[href*="borrador="]:last-of-type' }, { waitPath: 'borrador=' }, { wait: 2000 },
    { assert: 'U.3 borrador concreto (último de la lista)', js: BORRADOR.toString() },
    { shot: 'uniones/u3-borrador-concreto', desc: 'U.3: borrador abierto desde el detalle de campaña', full: false },
    { goto: ACTIVE }, { wait: 1500 },
    { probe: 'U.3 hrefs de borradores', js: "[...document.querySelectorAll('a[href*=\"borrador=\"]')].map((a) => a.getAttribute('href').replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, (m) => m.slice(0, 8)))" },
    { apiLog: 'detalle de campaña y U.3' },
    // Campaña cerrada → Histórico
    { goto: CLOSED }, { wait: 2000 },
    { assert: 'detalle de campaña cerrada: enlaces', js: ENLACES.toString() },
    { click: 'histórico|Histórico', in: 'main' }, { wait: 2500 },
    { assert: 'U.2 campaña cerrada → Histórico', js: ENLACES.toString() },
    // Resumen → Histórico / Cobertura
    { goto: '/colectivo/resumen' }, { wait: 1500 },
    { assert: 'Resumen: enlaces', js: ENLACES.toString() },
    // U.9
    { goto: '/colectivo/propuestas' }, { wait: 1500 },
    { click: '^Cómo se calculó', in: 'main' }, { wait: 1500 },
    { assert: 'U.9 «Cómo se calculó»: enlaces', js: ENLACES.toString() },
    { click: '^Ver la estimación completa', in: 'main' }, { wait: 2500 },
    { assert: 'U.9 destino', js: ENLACES.toString() },
    // U.5
    { goto: '/colectivo/catalogo?vista=productos' }, { wait: 1500 },
    { assert: 'Catálogo: vistas en el menú', js: "() => [...document.querySelectorAll('nav a')].map((a) => `${a.textContent.replace(/\\s+/g, ' ').trim()} → ${a.getAttribute('href')}`).filter((t) => /catalogo/.test(t))" },
    { goto: '/colectivo/catalogo?vista=equivalencias' }, { wait: 1500 }, { assert: 'U.5 equivalencias', js: ENLACES.toString() },
    { goto: '/colectivo/catalogo?vista=identificacion' }, { wait: 1500 }, { assert: 'U.5 identificación', js: ENLACES.toString() },
    { apiLog: 'resto de uniones' },
  ] },
];
