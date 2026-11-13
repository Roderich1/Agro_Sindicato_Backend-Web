// Verificación E4, Parte 1.5: cambio de rol y deshabilitación de A2 (por la API, como A1) con la Web
// de A2 abierta en CA: se refleja en la consulta siguiente (403 al pasar a Directiva, 401 deshabilitada).
import { C } from './ids_e4.mjs';
export default [{ role: 'A2', steps: [
  { goto: C.CA }, { shot: 'web/A2_rol_1_antes', desc: 'A2 (Administración) en CA: ve a F1 por nombre', mobile: false },
  { apiLog: 'A2 antes' }, { bodies: 'A2 antes' },
  { admin: 'role', user: 'A2', role: 'DIRECTIVA' }, { focus: true }, { wait: 4000 },
  { shot: 'web/A2_rol_2_directiva', desc: 'A2 pasada a Directiva por A1: al recuperar el foco, sin nombres ni cantidades por persona', mobile: false },
  { text: 'A2 como Directiva', forbid: ['F1 sintético', 'F2 sintético'] }, { apiLog: 'A2 tras pasar a Directiva' }, { bodies: 'A2 tras pasar a Directiva' },
  { admin: 'role', user: 'A2', role: 'ADMINISTRADOR' }, { focus: true }, { wait: 4000 },
  { shot: 'web/A2_rol_3_admin_otra_vez', desc: 'A2 vuelve a Administración: la consulta siguiente vuelve a mostrar el detalle autorizado', mobile: false },
  { text: 'A2 de nuevo Administración', expect: ['F1 sintético'] }, { apiLog: 'A2 de vuelta' },
  { admin: 'deactivate', user: 'A2' }, { focus: true }, { wait: 6000 }, { url: 'A2 deshabilitada' },
  { shot: 'web/A2_rol_4_deshabilitada', desc: 'A2 deshabilitada por A1: la consulta siguiente recibe 401 y la Web sale de la sesión', mobile: false, allowLogin: true },
  { text: 'A2 deshabilitada', forbid: ['F1 sintético'] }, { apiLog: 'A2 deshabilitada' },
  { admin: 'activate', user: 'A2' },
] }];
