// Cierre (2026-11-13), decisión D: como tool/e4/plan_rol.mjs, y además comprueba que la barra
// lateral adopta el rol vigente tras el 403 (sin recargar): con Directiva desaparece «Usuarios»
// (entrada sólo de Administración); al volver a Administración reaparece. Datos de E4_LABEL=VER1.
import { C } from '../e4/ids_e4.mjs';
export default [{ role: 'A2', steps: [
  { goto: C.CA }, { shot: 'web/A2_rol_1_antes', desc: 'A2 (Administración) en CA: ve a F1 por nombre; la barra lateral tiene «Usuarios»', mobile: false },
  { text: 'A2 Administración (barra)', expect: ['Usuarios', 'F1 sintético'] },
  { admin: 'role', user: 'A2', role: 'DIRECTIVA' }, { focus: true }, { wait: 5000 },
  { shot: 'web/A2_rol_2_directiva', desc: 'A2 pasada a Directiva: tras el 403, la Web revalida /auth/me; barra sin «Usuarios» y sin nombres por persona', mobile: false },
  { text: 'A2 como Directiva (barra y datos)', forbid: ['Usuarios', 'F1 sintético', 'F2 sintético'] }, { apiLog: 'A2 tras pasar a Directiva' }, { bodies: 'A2 tras pasar a Directiva' },
  { admin: 'role', user: 'A2', role: 'ADMINISTRADOR' }, { goto: C.CA, reload: true }, { wait: 4000 },
  { shot: 'web/A2_rol_3_admin_otra_vez', desc: 'A2 vuelve a Administración: al recargar, la sesión renovada trae el rol vigente: barra con «Usuarios» y detalle autorizado (sin recargar, este sentido espera a la renovación del token: limitación declarada)', mobile: false },
  { text: 'A2 de nuevo Administración', expect: ['Usuarios', 'F1 sintético'] }, { apiLog: 'A2 de vuelta' },
  { admin: 'deactivate', user: 'A2' }, { focus: true }, { wait: 6000 }, { url: 'A2 deshabilitada' },
  { shot: 'web/A2_rol_4_deshabilitada', desc: 'A2 deshabilitada: 401 y la Web sale de la sesión', mobile: false, allowLogin: true },
  { text: 'A2 deshabilitada', forbid: ['F1 sintético'] }, { apiLog: 'A2 deshabilitada' },
  { admin: 'activate', user: 'A2' },
] }];
