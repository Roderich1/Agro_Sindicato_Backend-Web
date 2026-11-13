// VERIFICACIÓN 7: Campañas, Usuarios y Bitácora. Se abren y se cancelan los diálogos de crear o editar (sin enviar);
// nada de cerrar la campaña activa. En la Bitácora: filtros (van al servidor) y «Qué pasó».
const DLG = () => {
  const d = document.querySelector('[role="dialog"], [role="alertdialog"]');
  if (!d) return { dialogo: null };
  return {
    rol: d.getAttribute('role'),
    titulo: d.querySelector('h2')?.textContent?.trim(),
    campos: [...d.querySelectorAll('input, select, textarea')].map((e) => `${e.id || e.type}${e.disabled ? ' [bloqueado]' : ''}${e.tagName === 'SELECT' ? `=${e.selectedOptions[0]?.textContent}` : ''}`),
    soloLectura: [...d.querySelectorAll('[data-testid="email-readonly"]')].map(() => 'correo de sólo lectura'),
    botones: [...d.querySelectorAll('button')].map((b) => `${b.textContent.replace(/\s+/g, ' ').trim()}${b.disabled ? ' [desactivado]' : ''}`),
  };
};
const BITACORA = () => ({
  filas: document.querySelectorAll('button[aria-label^="Detalle:"]').length,
  dias: [...document.querySelectorAll('main h2, main h3')].map((h) => h.textContent.trim()).slice(0, 6),
  primeras: [...document.querySelectorAll('button[aria-label^="Detalle:"]')].slice(0, 3).map((b) => b.getAttribute('aria-label')),
  filtros: { campana: document.querySelector('#audit-campaign')?.selectedOptions[0]?.textContent, persona: document.querySelector('#audit-actor')?.selectedOptions[0]?.textContent, tipo: document.querySelector('#audit-category')?.selectedOptions[0]?.textContent, desde: document.querySelector('#audit-from')?.value, hasta: document.querySelector('#audit-to')?.value },
  vacio: document.querySelector('main')?.innerText?.match(/Sin acciones[^\n]*/)?.[0] ?? null,
});
const QUE_PASO = () => {
  const d = document.querySelector('[role="dialog"]');
  return d ? { titulo: d.querySelector('h2')?.textContent?.trim(), texto: d.innerText.replace(/\s+/g, ' ').trim().slice(0, 500), tecnico: !!d.querySelector('[data-testid="audit-technical"]') } : null;
};
const openCancel = (label, regex, extra = {}) => [
  { mark: regex, ...extra }, { wait: 1000 },
  { focusInfo: `${label}: foco al abrir` },
  { assert: `${label}: diálogo`, js: DLG.toString() },
  ...(extra.shot ? [{ shot: extra.shot, desc: label, full: false }] : []),
  { escape: true },
  { assert: `${label}: tras Esc`, js: DLG.toString() },
  { focusInfo: `${label}: foco tras Esc` },
];
// Bitácora (Directiva): filtros y «Qué pasó». También se ejecuta solo con plan_v_bitacora.mjs.
export const bitacora = { role: 'directiva', steps: [
    { apiLog: 'inicio de sesión' },
    { goto: '/audit-logs' }, { wait: 2000 },
    { assert: 'Bitácora sin filtros', js: BITACORA.toString() },
    { apiLog: 'Bitácora: carga' },
    { selectByText: ['#audit-category', 'Convocatorias'] }, { wait: 1500 },
    { assert: 'Bitácora: tipo «Convocatorias»', js: BITACORA.toString() },
    { apiLog: 'Bitácora: tipo de acción' },
    { selectByText: ['#audit-actor', '^Administración DEMO'] }, { wait: 2000 },
    { assert: 'Bitácora: + persona Administración DEMO', js: BITACORA.toString() },
    { apiLog: 'Bitácora: persona' },
    { selectByText: ['#audit-actor', '^Todas las personas'] }, { selectByText: ['#audit-category', 'Todas las acciones'] },
    { selectByText: ['#audit-campaign', 'Invierno 2026'] }, { setValue: ['#audit-from', '2026-11-13'] }, { setValue: ['#audit-to', '2026-11-13'] }, { wait: 2000 },
    { assert: 'Bitácora: campaña Invierno 2026 y fechas 13 nov', js: BITACORA.toString() },
    { apiLog: 'Bitácora: campaña y fechas' },
    { shot: 'admin/32-bitacora-filtrada', desc: 'Bitácora con campaña y fechas', full: false },
    { mark: '^Detalle:' }, { wait: 1000 },
    { assert: 'Qué pasó', js: QUE_PASO.toString() }, { focusInfo: 'Qué pasó: foco al abrir' },
    { shot: 'admin/33-4-que-paso', desc: 'Qué pasó', full: false },
    { escape: true }, { focusInfo: 'Qué pasó: foco tras Esc' },
    { setValue: ['#audit-from', '2026-01-01'] }, { setValue: ['#audit-to', '2026-01-02'] }, { wait: 2000 },
    { assert: 'Bitácora: fechas sin acciones', js: BITACORA.toString() },
    { apiLog: 'Bitácora: detalle y fechas vacías' },
] };

export default [
  { role: 'directiva', steps: [
    { apiLog: 'inicio de sesión' },
    { goto: '/campaigns' }, { wait: 1500 },
    { assert: 'Campañas: acciones visibles', js: "() => ({ botones: [...document.querySelectorAll('main button, main a')].map((b) => (b.getAttribute('aria-label') || b.textContent).replace(/\\s+/g, ' ').trim()).filter((t) => /Nueva|Editar|Cerrar|Abrir/.test(t)) })" },
    ...openCancel('Nueva campaña', '^Nueva campaña', { shot: 'admin/30-1-nueva-campana' }),
    ...openCancel('Editar campaña activa', '^Editar$', { in: '[data-testid="active-campaign"]', shot: 'admin/34-3-editar-campana' }),
    { apiLog: 'Campañas: abrir y cancelar (sólo GET)' },
  ] },
  { role: 'admin', steps: [
    { apiLog: 'inicio de sesión' },
    { goto: '/users' }, { wait: 2000 },
    { assert: 'Usuarios: acciones', js: "() => ({ principal: [...document.querySelectorAll('main button')].map((b) => b.textContent.trim()).filter((t) => /Nuevo/.test(t)), filas: document.querySelectorAll('[aria-label=\"Usuarios\"] li').length, mostrados: document.querySelector('[data-testid=\"users-shown\"]')?.textContent?.trim() ?? null })" },
    ...openCancel('Nuevo usuario', '^Nuevo usuario', { shot: 'admin/33-1-nuevo-usuario' }),
    ...openCancel('Editar usuario', '^Editar a Sucesora PA', { shot: 'admin/34-6-editar-usuario' }),
    ...openCancel('Cambiar contraseña', '^Contraseña de Sucesora PA'),
    ...openCancel('Desactivar usuario', '^Desactivar a Sucesora PA', { shot: 'admin/33-3-desactivar' }),
    { apiLog: 'Usuarios: abrir y cancelar (sólo GET)' },
  ] },
  bitacora,
];
