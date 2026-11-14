// Cierre (2026-11-13), recorrido Mobile M7: después de que F3 autorizó a la Administración en CC
// desde el teléfono (M3), A1 ve a F3 en CC y D1 ve CC sin nombres. Datos de E4_LABEL=VER1.
//   E4_LABEL=VER1 E4_BACK_DIR=<CIERRE-BE>/Back WEB_URL=http://127.0.0.1:5184 \
//     node tool/e4/capture_e4.mjs tool/cierre/plan_movil_cierre.mjs docs/evidence/CIERRE/mobile/web_M7
import { C, FORBID_DIRECTIVA } from '../e4/ids_e4.mjs';
export default [
  { role: 'A1', steps: [
    { goto: C.CC },
    { shot: 'web/M7_A1_CC', desc: 'A1 (Administración) en CC tras la autorización de F3 desde el teléfono (M3): F3 aparece con su cantidad' },
    { text: 'A1 en CC', expect: ['F3 sintético', 'F2 sintético'] },
    { apiLog: 'A1 en CC' },
  ] },
  { role: 'D1', steps: [
    { goto: C.CC },
    { shot: 'web/M7_D1_CC', desc: 'D1 (Directiva, responsable de CC) en CC: sólo totales, sin nombres' },
    { text: 'D1 en CC', forbid: FORBID_DIRECTIVA },
    { apiLog: 'D1 en CC' }, { bodies: 'D1 en CC' },
  ] },
];
