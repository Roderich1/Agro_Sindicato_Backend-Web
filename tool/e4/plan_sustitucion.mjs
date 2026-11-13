// Verificación E4, Parte 1.2: «Sustituir responsable…» por la Administración (A1, no responsable)
// en una convocatoria ABIERTA (CC → D1) y en una CERRADA (CD → D2), con motivo, casilla y confirmación.
import { C } from './ids_e4.mjs';
const run = (key, successor, label) => [
  { goto: C[key] },
  { click: '^Sustituir responsable…$' },
  { select: ['#substitute-user', successor] },
  { type: ['#substitute-reason', `Responsable deshabilitada; verificacion E4 ${label}`] },
  { check: '[role="dialog"] input[type="checkbox"]' },
  { shot: `web/A1_${key}_sustituir_listo`, desc: `A1 en ${key} (${label}): sucesora, motivo y casilla marcados antes de confirmar` },
  { click: '^Sustituir responsable$', in: '[role="dialog"]' },
  { wait: 3000 },
  { shot: `web/A1_${key}_sustituida`, desc: `A1 en ${key} (${label}) tras la sustitución: nueva responsable, historial y totales` },
  { apiLog: `A1 ${key} sustitución` },
];
export default [
  { role: 'A1', steps: [...run('CC', 'D1 sintético', 'abierta'), ...run('CD', 'D2 sintético', 'cerrada')] },
];
