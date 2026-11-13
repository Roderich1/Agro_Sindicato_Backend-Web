// VERIFICACIÓN 4: participantes y consentimiento según permisos. SÓLO LECTURA sobre convocatorias existentes.
// - con permiso: nombres y cantidades sólo de quienes autorizaron;
// - sin permiso: nunca se pide /participants (apiLog);
// - permiso retirado y cierre sin todos los totales: se ven como estado, nunca como 0.
const C = {
  pcn7: 'c5e618a7-c7de-435d-ab0a-575dfe7c4891', // P-C y N7, abierta, responsable Directiva DEMO (11 / 17)
  e3: '514f346e-b245-4be0-89dd-f1c90bbf3684', // Compra conjunta desde propuesta E3, cerrada (12 / 18)
  herb: '97d993e8-5621-4d63-8773-09c7f612b9aa', // Herbicidas invierno 2026, cierre automático (19)
  appAnt: '69bfef4a-be8e-4464-9e70-7aafc6a7cf15', // P-A app anterior, nueva responsable (14 / 50)
  conc: 'a351af7a-9f84-4d7e-a41d-0a7857ec55bc', // P-A concurrencia, abierta (16)
};
const P = (id) => `/colectivo/compras-conjuntas/${id}`;
const VISTA = () => {
  const txt = (sel) => { const e = document.querySelector(sel); return e ? e.innerText.replace(/\s+/g, ' ').trim().slice(0, 700) : null; };
  const card = (re) => { const h = [...document.querySelectorAll('h2,h3')].find((x) => re.test(x.textContent)); const s = h?.closest('section, [data-testid]'); return s ? s.innerText.replace(/\s+/g, ' ').trim().slice(0, 700) : null; };
  return {
    h1: document.querySelector('h1')?.textContent?.trim(),
    estado: txt('[data-testid="call-status"]'),
    productos: txt('[data-testid="call-products"]') ?? card(/Pedido hasta ahora|Productos/),
    participantes: txt('[data-testid="participants-panel"]'),
    consolidado: card(/Consolidado al cierre/),
    detalleCierre: txt('[data-testid="closing-detail"]'),
    nuevaResponsable: txt('[data-testid="new-responsible"]'),
    acceso: card(/Su acceso/),
    avisos: [...document.querySelectorAll('[role="status"], [role="alert"], [data-testid="call-alert"]')].map((n) => n.textContent.trim()).filter(Boolean).slice(0, 4),
    ceroEscrito: /(^|\s)0(\s|,)?\s?(L|kg|KG)\b/.test(document.querySelector('main')?.innerText ?? ''),
  };
};
const v = VISTA.toString();
const visit = (role, key, label, shot) => [
  { goto: P(C[key]) }, { wait: 1500 },
  { assert: `${role} · ${label}`, js: v },
  { apiLog: `${role} · ${label} (¿pide /participants?)` },
  ...(shot ? [{ shot: `participantes/${shot}`, desc: `${role} · ${label}` }] : []),
];
export default [
  { role: 'directiva', steps: [
    { apiLog: 'inicio de sesión' },
    ...visit('directiva', 'pcn7', 'responsable, abierta con permiso (P-C y N7)', '11-directiva-responsable-abierta'),
    ...visit('directiva', 'e3', 'responsable, cerrada (Compra desde propuesta E3)', '12-directiva-responsable-cerrada'),
    ...visit('directiva', 'conc', 'sin permiso de participantes, abierta (P-A concurrencia)', null),
  ] },
  { role: 'suc', steps: [
    { apiLog: 'inicio de sesión' },
    ...visit('sucesora', 'appAnt', 'nueva responsable, autorizaciones pendientes (P-A app anterior)', '14-sucesora-nueva-responsable'),
  ] },
  { role: 'admin2', steps: [
    { apiLog: 'inicio de sesión' },
    ...visit('admin2', 'conc', 'sin permiso, abierta (P-A concurrencia)', '16-admin2-sin-permiso'),
    ...visit('admin2', 'pcn7', 'permiso retirado, abierta (P-C y N7)', '17-admin2-permiso-retirado'),
  ] },
  { role: 'admin', steps: [
    { apiLog: 'inicio de sesión' },
    ...visit('admin', 'e3', 'cerrada sin permiso de detalle (Compra desde propuesta E3)', '18-admin-cerrada-sin-detalle'),
    ...visit('admin', 'herb', 'cerrada automática, menos de 3 (Herbicidas invierno 2026)', '19-admin-cerrada-menos-de-3'),
  ] },
];
