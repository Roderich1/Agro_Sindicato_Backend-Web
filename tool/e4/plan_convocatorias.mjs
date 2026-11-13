// Verificación E4, Parte 1 (1–3): convocatorias por rol, antes de las sustituciones.
import { C, LIST, FORBID_DIRECTIVA } from './ids_e4.mjs';
const det = (role, key, desc, expect = [], extra = []) => [
  { goto: C[key] },
  { shot: `web/${role}_${key}`, desc },
  { text: `${role} ${key}`, expect, forbid: role.startsWith('D') ? FORBID_DIRECTIVA : ['anónim', 'umbral', 'Consultar participantes y cantidades'] },
  ...extra,
  { apiLog: `${role} ${key}` },
];
export default [
  { role: 'D1', steps: [
    { goto: LIST }, { shot: 'web/D1_lista', desc: 'Directiva D1: lista de convocatorias (sin totales ni nombres)' }, { text: 'D1 lista', forbid: FORBID_DIRECTIVA }, { apiLog: 'D1 lista' },
    ...det('D1', 'CA', 'Directiva responsable (D1) en CA abierta: total provisional ROLE_CONSENT (1 persona) y PENDING_CONSENT', ['Pendiente de autorización', 'Total provisional|Pedido hasta ahora']),
    { click: 'Conceder «Administrar' }, { shot: 'web/D1_CA_conceder', desc: 'D1 responsable: el único permiso que se concede es «Administrar la convocatoria»' }, { text: 'D1 CA conceder', forbid: ['Consultar participantes y cantidades'] }, { escape: true },
    ...det('D1', 'CB', 'Directiva no responsable (D1) en CB cerrada: consolidado PREVIOUS_POLICY_K3 en Herbicida, PENDING_CONSENT en Fertilizante', ['Visible por la regla anterior', 'Pendiente de autorización']),
    ...det('D1', 'CC', 'Directiva (D1) en CC abierta con la responsable D3 no habilitada: explicación para pedir a la Administración, sin botón', ['Administración']),
    ...det('D1', 'CD', 'Directiva (D1) en CD cerrada con la responsable D3 no habilitada (2 personas CONV-4: VISIBLE)', []),
    ...det('D1', 'CX', 'Directiva responsable (D1) en CX cancelada', []),
    { bodies: 'D1 todas las respuestas' },
  ] },
  { role: 'D2', steps: [
    ...det('D2', 'CA', 'Directiva no responsable (D2) en CA abierta', ['Pendiente de autorización']),
    ...det('D2', 'CB', 'Directiva no responsable (D2) en CB cerrada (PREVIOUS_POLICY_K3)', ['Visible por la regla anterior']),
    { bodies: 'D2 todas las respuestas' },
  ] },
  { role: 'A1', steps: [
    ...det('A1', 'CA', 'Administración no responsable (A1) en CA abierta: detalle identificado sólo de F1 (CONV-4) y aviso de 1 pendiente', ['F1 sintético', 'Pendiente de autorización'], [{ text: 'A1 CA sin F2', forbid: ['F2 sintético'] }]),
    ...det('A1', 'CB', 'Administración responsable (A1) en CB cerrada: detalle de F2 (CONV-4), Herbicida PENDING_CONSENT porque ve a F2 por nombre, aviso de 2 pendientes', ['F2 sintético'], [{ text: 'A1 CB sin F1/F3', forbid: ['F1 sintético', 'F3 sintético'] }]),
    ...det('A1', 'CC', 'Administración (A1) en CC abierta con responsable no habilitada: «Sustituir responsable…» visible', ['Sustituir responsable']),
    { click: '^Sustituir responsable…$' }, { shot: 'web/A1_CC_dialogo_sustituir', desc: 'Diálogo de sustitución (A1): A1 no figura entre las candidatas (autosustitución prohibida)' },
    { probe: 'opciones del selector', js: "[...document.querySelectorAll('#substitute-user option')].map(o=>o.textContent)" },
    { escape: true },
    { goto: '/users' }, { open: 'details' }, { wait: 2500 }, { shot: 'web/A1_usuarios', desc: 'Usuarios (A1): sin gestión del permiso «Sustituir responsable»; historia plegada de sólo lectura' },
    { text: 'A1 usuarios', expect: ['ya no se usa'], forbid: ['Conceder «Sustituir'] }, { apiLog: 'A1 usuarios' },
  ] },
  { role: 'A2', steps: [
    ...det('A2', 'CM1', 'Administración responsable (A2) en CM1 abierta: F2 por nombre', ['F2 sintético']),
    ...det('A2', 'CA', 'Administración no responsable (A2) en CA', ['F1 sintético']),
  ] },
];
