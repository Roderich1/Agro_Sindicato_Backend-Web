// VERIFICACIÓN 1: inicio de sesión por rol (Directiva, Administración y Agricultor) contra la API real.
// El agricultor sólo ve el aviso, sin llamadas de datos; «Cambiar de cuenta» y «Cerrar sesión» llevan a /login.
const NAV = () => ({
  path: location.pathname + location.search,
  h1: [...document.querySelectorAll('h1')].map((h) => h.textContent.replace(/\s+/g, ' ').trim()),
  nav: [...document.querySelectorAll('nav a, nav button')].map((a) => (a.getAttribute('aria-label') || a.textContent).replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 30),
  usuarios: !![...document.querySelectorAll('nav a')].find((a) => /Usuarios/.test(a.textContent)),
});
const AVISO = () => ({
  path: location.pathname,
  h1: [...document.querySelectorAll('h1')].map((h) => h.textContent.trim()),
  botones: [...document.querySelectorAll('button')].map((b) => b.textContent.trim()),
  menus: document.querySelectorAll('nav').length,
});
export default [
  { role: 'directiva', steps: [
    { wait: 2500 }, { assert: 'directiva: destino y menú', js: NAV.toString() }, { apiLog: 'directiva: llamadas desde el inicio de sesión' },
    { shot: 'acceso/directiva-inicio', desc: 'Directiva tras ingresar', full: false },
  ] },
  { role: 'admin', steps: [
    { wait: 2500 }, { assert: 'administración: destino y menú', js: NAV.toString() }, { apiLog: 'administración: llamadas desde el inicio de sesión' },
    { shot: 'acceso/administracion-inicio', desc: 'Administración tras ingresar', full: false },
  ] },
  { role: 'agricultor', steps: [
    { wait: 3000 }, { assert: 'agricultor: aviso', js: AVISO.toString() }, { apiLog: 'agricultor: llamadas desde el inicio de sesión' },
    { shot: 'acceso/02-agricultor-aviso', desc: 'Agricultor: sólo el aviso', full: false, mobile: true },
    { goto: '/colectivo/resumen', allowLogin: true }, { assert: 'agricultor: /colectivo/resumen', js: AVISO.toString() },
    { goto: '/users', allowLogin: true }, { assert: 'agricultor: /users', js: AVISO.toString() },
    { goto: '/campaigns', allowLogin: true }, { assert: 'agricultor: /campaigns', js: AVISO.toString() },
    { apiLog: 'agricultor: llamadas al pedir rutas institucionales' },
    { click: '^Cambiar de cuenta$' }, { waitPath: '^/login' },
    { assert: 'agricultor: tras «Cambiar de cuenta»', js: AVISO.toString() }, { apiLog: 'agricultor: llamadas de «Cambiar de cuenta»' },
    { shot: 'acceso/02-agricultor-cambiar-cuenta', desc: 'Tras «Cambiar de cuenta»', full: false, allowLogin: true },
  ] },
  { role: 'agricultor', steps: [
    { wait: 3000 }, { assert: 'agricultor (2): aviso', js: AVISO.toString() }, { apiLog: 'agricultor (2): llamadas desde el inicio de sesión' },
    { click: '^Cerrar sesión$' }, { waitPath: '^/login' },
    { assert: 'agricultor (2): tras «Cerrar sesión»', js: AVISO.toString() }, { apiLog: 'agricultor (2): llamadas de «Cerrar sesión»' },
    { shot: 'acceso/02-agricultor-cerrar-sesion', desc: 'Tras «Cerrar sesión»', full: false, allowLogin: true },
  ] },
];
