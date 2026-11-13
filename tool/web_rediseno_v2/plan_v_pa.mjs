// VERIFICACIÓN 5: P-A.
// (a) Directiva (tiene «Sustituir responsable»): en la convocatoria de la responsable no habilitada (lámina 20) abre
//     «Sustituir responsable…», comprueba que no se ofrece a sí misma, que hacen falta motivo y casilla, y cancela sin
//     enviar. En la de la nueva responsable (lámina 14) comprueba qué se ofrece.
// (b) Administración concede «Sustituir responsable» a Sucesora PA (sintética) con motivo; la Directiva lo ve en
//     Compras conjuntas («Ver quién lo tiene»); Administración lo retira con motivo y el historial queda.
const DEMO = '/colectivo/compras-conjuntas/2894efd3-8294-4ace-a4b5-87c89e719be1'; // lámina 20
const APP_ANT = '/colectivo/compras-conjuntas/69bfef4a-be8e-4464-9e70-7aafc6a7cf15'; // lámina 14
const AVISO = () => ({
  h1: document.querySelector('h1')?.textContent?.trim(),
  chip: document.querySelector('[data-testid="responsible-ineligible-chip"]')?.textContent?.trim() ?? null,
  aviso: document.querySelector('[data-testid="responsible-ineligible"]')?.closest('[role="status"], [role="alert"], div')?.innerText?.replace(/\s+/g, ' ').trim().slice(0, 400) ?? null,
  botonSustituir: !!document.querySelector('[data-testid="substitute-open"]'),
  textoSustituir: [...document.querySelectorAll('button, a')].filter((b) => /Sustituir/.test(b.textContent)).map((b) => b.textContent.trim()),
});
const SUST = () => {
  const d = document.querySelector('[data-testid="substitute-dialog"]') ?? document.querySelector('[role="dialog"]');
  if (!d) return { dialogo: null };
  const sel = d.querySelector('#substitute-user');
  return {
    titulo: d.querySelector('h2')?.textContent?.trim(),
    opciones: sel ? [...sel.options].map((o) => o.textContent.trim()) : null,
    sinCandidatas: d.querySelector('[data-testid="substitute-no-candidates"]')?.innerText?.replace(/\s+/g, ' ').trim() ?? null,
    notaPropia: d.querySelector('[data-testid="substitute-self-note"]')?.textContent?.trim() ?? null,
    ayuda: sel?.closest('div')?.parentElement?.innerText?.replace(/\s+/g, ' ').trim().slice(0, 300) ?? null,
    motivo: d.querySelector('#substitute-reason')?.value ?? null,
    casilla: [...d.querySelectorAll('input[type="checkbox"]')].map((c) => ({ marcada: c.checked, desactivada: c.disabled })),
    botones: [...d.querySelectorAll('button')].map((b) => `${b.textContent.replace(/\s+/g, ' ').trim()}${b.disabled ? ' [desactivado]' : ''}`),
    descartar: document.querySelector('[role="alert"]')?.innerText?.replace(/\s+/g, ' ').trim() ?? null,
  };
};
const DLG = () => {
  const d = document.querySelector('[role="dialog"], [role="alertdialog"]');
  if (!d) return { dialogo: null };
  return {
    titulo: d.querySelector('h2')?.textContent?.trim(),
    opciones: [...d.querySelectorAll('select option')].map((o) => o.textContent.trim()),
    casilla: [...d.querySelectorAll('input[type="checkbox"]')].map((c) => ({ marcada: c.checked, desactivada: c.disabled })),
    botones: [...d.querySelectorAll('button')].map((b) => `${b.textContent.replace(/\s+/g, ' ').trim()}${b.disabled ? ' [desactivado]' : ''}`),
  };
};
const PANEL = () => {
  const p = document.querySelector('[data-testid="substitution-permissions"]') ?? document.querySelector('#substitution-strip-panel');
  return {
    path: location.pathname,
    titulares: [...document.querySelectorAll('[data-testid^="substitution-holder-"]')].map((li) => li.innerText.replace(/\s+/g, ' ').trim()),
    mensaje: [...document.querySelectorAll('[role="status"]')].map((n) => n.textContent.trim()).filter((t) => /Sustituir responsable/.test(t)),
    historial: [...document.querySelectorAll('[data-testid="substitution-history-event"]')].map((li) => li.innerText.replace(/\s+/g, ' ').trim()),
    franja: document.querySelector('[data-testid="substitution-strip"]')?.innerText?.replace(/\s+/g, ' ').trim().slice(0, 300) ?? null,
    botones: p ? [...p.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') || b.textContent.trim()) : [],
  };
};
const REASON_GRANT = 'Recorrido de verificación del rediseño v2: concesión temporal a una cuenta sintética (se retira a continuación).';
const REASON_REVOKE = 'Fin del recorrido de verificación del rediseño v2.';

// Administración retira con motivo; el historial queda. (El diálogo de retirar es role="alertdialog".)
export const retirar = { role: 'admin', steps: [
    { goto: '/users' }, { wait: 2000 },
    { assert: 'Usuarios: panel antes de retirar', js: PANEL.toString() },
    { mark: '^Retirar el permiso a Sucesora PA' }, { wait: 1500 },
    { assert: 'diálogo de retirar', js: DLG.toString() },
    { type: ['[role="alertdialog"] textarea', REASON_REVOKE] },
    { check: '[role="alertdialog"] input[type="checkbox"]' },
    { assert: 'retirar: con motivo y casilla', js: DLG.toString() },
    { shot: 'pa/31-retirar-dialogo', desc: 'Retirar «Sustituir responsable» a Sucesora PA (sintética)', full: false },
    { apiLog: 'antes de retirar' },
    { click: '^Retirar el permiso$', in: '[role="alertdialog"]' }, { wait: 3000 },
    { apiLog: 'RETIRAR: llamadas' },
    { open: '[data-testid="substitution-history"]' },
    { assert: 'Usuarios: panel e historial tras retirar', js: PANEL.toString() },
    { shot: 'pa/31-retirado-historial', desc: 'Usuarios: titulares e historial tras retirar' },
  ] };

export default [
  // (a) y concesión: Administración concede
  { role: 'admin', steps: [
    { apiLog: 'inicio de sesión' },
    { goto: '/users' }, { wait: 2000 },
    { assert: 'Usuarios: panel antes de conceder', js: PANEL.toString() },
    { mark: '', markSel: '[data-testid="substitution-grant-button"]' }, { wait: 1500 },
    { focusInfo: 'diálogo de conceder recién abierto' },
    { assert: 'diálogo de conceder vacío', js: DLG.toString() },
    { selectByText: ['[role="dialog"] select', '^Sucesora PA'] },
    { assert: 'conceder: persona elegida, sin motivo ni casilla', js: DLG.toString() },
    { type: ['[role="dialog"] textarea', REASON_GRANT] },
    { assert: 'conceder: con motivo, sin casilla', js: DLG.toString() },
    { check: '[role="dialog"] input[type="checkbox"]' },
    { assert: 'conceder: con motivo y casilla', js: DLG.toString() },
    { shot: 'pa/31-conceder-dialogo', desc: 'Conceder «Sustituir responsable» a Sucesora PA (sintética), antes de confirmar', full: false },
    { apiLog: 'antes de conceder' },
    { click: '^Conceder el permiso$', in: '[role="dialog"]' }, { wait: 3000 },
    { apiLog: 'CONCEDER: llamadas' },
    { assert: 'Usuarios: panel tras conceder', js: PANEL.toString() },
    { shot: 'pa/31-concedido', desc: 'Usuarios: Sucesora PA aparece con el permiso' },
  ] },
  // La Directiva lo ve; lámina 20 y 14
  { role: 'directiva', steps: [
    { apiLog: 'inicio de sesión' },
    { goto: '/colectivo/compras-conjuntas' },
    { click: '^Ver quién lo tiene' }, { wait: 2500 },
    { assert: 'Directiva: «Ver quién lo tiene» tras conceder', js: PANEL.toString() },
    { shot: 'pa/09-directiva-ve-titulares', desc: 'Compras conjuntas: la Directiva ve quién tiene el permiso', full: false },
    { apiLog: 'Directiva: franja del permiso' },
    // lámina 20
    { goto: DEMO }, { wait: 1500 },
    { assert: 'lámina 20: aviso de responsable no habilitada', js: AVISO.toString() },
    { mark: '', markSel: '[data-testid="substitute-open"]' }, { wait: 2000 },
    { focusInfo: 'diálogo de sustituir recién abierto' },
    { assert: 'sustituir: candidatas y estado inicial', js: SUST.toString() },
    { shot: 'pa/20-sustituir-dialogo', desc: 'Sustituir a la responsable: quien sustituye no se ofrece', full: false },
    { selectByText: ['#substitute-user', '.+·'] },
    { assert: 'sustituir: persona elegida, sin motivo ni casilla', js: SUST.toString() },
    { type: ['#substitute-reason', 'Comprobación de verificación: no se envía.'] },
    { assert: 'sustituir: con motivo, sin casilla', js: SUST.toString() },
    { check: '[data-testid="substitute-dialog"] input[type="checkbox"]' },
    { assert: 'sustituir: con motivo y casilla (no se pulsa)', js: SUST.toString() },
    { escape: true }, { assert: 'Esc con cambios: pide confirmar el descarte', js: SUST.toString() },
    { click: '^Descartar cambios$' }, { wait: 1000 },
    { focusInfo: 'tras descartar: foco de vuelta' },
    { assert: 'tras cancelar sin enviar', js: AVISO.toString() },
    { apiLog: 'lámina 20: abrir y cancelar (sin POST …/responsible)' },
    // lámina 14
    { goto: APP_ANT }, { wait: 1500 },
    { assert: 'lámina 14 (Directiva): ¿se ofrece sustituir?', js: AVISO.toString() },
    { apiLog: 'lámina 14 (Directiva)' },
  ] },
  retirar,
];
