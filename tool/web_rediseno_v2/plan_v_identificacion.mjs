// VERIFICACIÓN 6: identificación con foto, con Directiva, contra la API real.
// - «Ver la foto» de la única solicitud pendiente con foto: la imagen se pide con la sesión (blob) y carga
//   (naturalWidth > 0). La foto es privada: NO se captura ni se guarda; sin sesión, la misma URL debe rechazarse.
// - Se identifica UNA sola solicitud («Fertilizante foliar artesanal ZZ», sin foto) uniéndola al producto existente del
//   mismo nombre (otra solicitud idéntica ya se unió a él el 11 nov). La insignia baja en 1 y pasa a «Ya identificados».
const PHOTO_NAME = 'Herbicida 48 SL del agro';
const TARGET_NAME = 'Fertilizante foliar artesanal ZZ';
const ESTADO = () => {
  const navCat = [...document.querySelectorAll('nav a, nav button')].map((a) => (a.getAttribute('aria-label') || a.textContent).replace(/\s+/g, ' ').trim()).filter((t) => /pendientes|Por identificar/.test(t));
  const tabs = [...document.querySelectorAll('[data-testid="identification-tabs"] button, [data-testid="identification-tabs"] [role="tab"], [data-testid="identification-tabs"] label')].map((b) => b.textContent.trim());
  return {
    path: location.pathname + location.search,
    insignias: navCat,
    pestanas: tabs,
    pendientes: [...document.querySelectorAll('[aria-label="Solicitudes pendientes"] li')].map((li) => li.innerText.replace(/\s+/g, ' ').trim()),
    identificados: [...document.querySelectorAll('[data-testid="identified"] li')].map((li) => li.innerText.replace(/\s+/g, ' ').trim()).slice(0, 8),
    aviso: [...document.querySelectorAll('[role="status"], [role="alert"]')].map((n) => n.textContent.trim()).filter(Boolean).slice(0, 3),
  };
};
const PANEL = () => {
  const p = document.querySelector('[data-testid="identification-panel"]');
  if (!p) return null;
  return {
    etiqueta: p.getAttribute('aria-label'),
    opciones: [...p.querySelectorAll('input[type="radio"]')].map((r) => `${r.closest('label')?.innerText?.replace(/\s+/g, ' ').trim().slice(0, 60)}${r.checked ? ' [elegida]' : ''}`),
    producto: p.querySelector('select[id^="identification-product-"]')?.selectedOptions?.[0]?.textContent ?? null,
    casilla: [...p.querySelectorAll('input[type="checkbox"]')].map((c) => ({ marcada: c.checked, desactivada: c.disabled })),
    boton: [...p.querySelectorAll('button')].filter((b) => /Confirmar identificación/.test(b.textContent)).map((b) => (b.disabled ? 'desactivado' : 'activo')),
    verFoto: [...p.querySelectorAll('button')].some((b) => /Ver la foto/.test(b.textContent)),
    quienReporto: /reportó|envió|agricultor\d|@/i.test(p.innerText) ? p.innerText.match(/.{0,40}(reportó|envió|@).{0,40}/i)?.[0] ?? null : null,
  };
};
const FOTO = () => {
  const img = document.querySelector('img[alt="Foto de la etiqueta reportada"]');
  return img ? { cargada: img.complete && img.naturalWidth > 0, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, origen: img.src.split(':')[0] } : { imagen: null, texto: document.querySelector('[role="dialog"]')?.innerText?.slice(0, 200) ?? null };
};
// Sin sesión: la misma ruta de la foto, sin cabecera Authorization, debe rechazarse.
const FOTO_SIN_SESION = `async () => { const call = (window.__verifPhotoPath || ''); if (!call) return 'sin ruta'; const r = await fetch(call, { credentials: 'omit' }); return { estado: r.status }; }`;

export default [
  { role: 'directiva', steps: [
    { apiLog: 'inicio de sesión' },
    { goto: '/colectivo/catalogo?vista=identificacion' }, { wait: 2000 },
    { assert: 'antes: insignia y listas', js: ESTADO.toString() },
    { click: PHOTO_NAME, in: '[aria-label="Solicitudes pendientes"]' }, { wait: 2000 },
    { assert: 'solicitud con foto: panel', js: PANEL.toString() },
    { apiLog: 'abrir la solicitud (la foto todavía no se pide)' },
    { mark: '^Ver la foto' }, { wait: 3000 },
    { assert: 'foto: carga autorizada (no se captura)', js: FOTO.toString() },
    { focusInfo: 'diálogo de la foto' },
    { apiLog: 'Ver la foto: llamadas' },
    { probe: 'ruta de la foto pedida', js: "(() => { const e = performance.getEntriesByType('resource').map((r) => new URL(r.name).pathname).filter((p) => /\\/photo$/.test(p)); window.__verifPhotoPath = '/api/v1' + (e.at(-1) || '').replace(/^\\/api\\/v1/, ''); return e.length; })()" },
    { assert: 'foto pedida sin sesión (fetch sin Authorization)', js: FOTO_SIN_SESION },
    { escape: true }, { focusInfo: 'tras cerrar la foto con Esc' },
    { apiLog: 'cerrar la foto' },
    // Identificar una sola
    { click: TARGET_NAME, in: '[aria-label="Solicitudes pendientes"]' }, { wait: 2500 },
    { click: '^Ya está en el catálogo', in: '[data-testid="identification-panel"]' }, { wait: 1500 },
    { assert: 'a identificar: estado inicial', js: PANEL.toString() },
    { selectByText: ['[data-testid="identification-panel"] select[id^="identification-product-"]', `^${TARGET_NAME}`] },
    { type: ['[data-testid="identification-panel"] textarea', 'Mismo producto que la solicitud idéntica ya identificada el 11 nov (recorrido de verificación, datos sintéticos).'] },
    { assert: 'a identificar: producto y motivo, sin casilla', js: PANEL.toString() },
    { check: '[data-testid="identification-panel"] input[type="checkbox"]' },
    { assert: 'a identificar: con casilla', js: PANEL.toString() },
    { shot: 'identificacion/23-antes-de-confirmar', desc: 'Identificar «Fertilizante foliar artesanal ZZ» (sin foto) con un producto existente', full: false },
    { apiLog: 'antes de confirmar' },
    { click: '^Confirmar identificación$', in: '[data-testid="identification-panel"]' }, { wait: 3500 },
    { apiLog: 'CONFIRMAR: llamadas' },
    { assert: 'después: insignia y listas', js: ESTADO.toString() },
    { shot: 'identificacion/23-despues', desc: 'Tras confirmar: insignia y pendientes', full: false },
    { click: '^Ya identificados', in: 'main' }, { wait: 2500 },
    { assert: 'Ya identificados', js: ESTADO.toString() },
    { shot: 'identificacion/24-ya-identificados', desc: 'Ya identificados con la nueva', full: false },
    { apiLog: 'Ya identificados' },
  ] },
];
