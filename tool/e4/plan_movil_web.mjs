// Verificación E4, Parte 2: lo que ve la Administración (A1) en la Web tras cada paso del teléfono (F1).
// Uso: E4_PASO=<etiqueta> E4_CALL=<CM1|CM2|CB> node capture_e4.mjs plan_movil_web.mjs docs/evidence/E4
import { C } from './ids_e4.mjs';
const paso = process.env.E4_PASO ?? 'paso';
const key = process.env.E4_CALL ?? 'CM2';
export default [{ role: process.env.E4_ROL ?? 'A1', steps: [
  { goto: C[key] },
  { shot: `web/movil_${paso}_${key}`, desc: `${process.env.E4_ROL ?? 'A1'} en ${key} tras «${paso}» en el teléfono`, mobile: false },
  { text: `${paso} ${key}`, expect: (process.env.E4_EXPECT ?? '').split('|').filter(Boolean), forbid: (process.env.E4_FORBID ?? '').split('|').filter(Boolean) },
  { apiLog: `${paso} ${key}` },
] }];
