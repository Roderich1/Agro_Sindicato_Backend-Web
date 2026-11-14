// Verificación E4, Parte 1.5 (b): deshabilitación de A2 (por la API, como A1) mientras A2 VE el detalle
// identificado de CA: la comprobación al recuperar el foco recibe 401.
import { C } from './ids_e4.mjs';
export default [{ role: 'A2', steps: [
  { goto: C.CA }, { text: 'A2 antes de deshabilitar', expect: ['F1 sintético'] }, { apiLog: 'A2 antes' },
  { admin: 'deactivate', user: 'A2' }, { wait: 2500 }, { focus: true }, { wait: 6000 }, { url: 'A2 deshabilitada' },
  { shot: 'web/A2_deshabilitada_viendo', desc: 'A2 deshabilitada mientras veía el detalle: la consulta siguiente recibe 401', mobile: false, allowLogin: true },
  { text: 'A2 deshabilitada', forbid: ['F1 sintético'] }, { apiLog: 'A2 deshabilitada' }, { bodies: 'A2 deshabilitada' },
  { admin: 'activate', user: 'A2' },
] }];
