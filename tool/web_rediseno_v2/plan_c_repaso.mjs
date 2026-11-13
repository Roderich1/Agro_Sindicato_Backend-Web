/**
 * Repaso de la sesión C (2026-11-13) tras ajustar Usuarios y la tarjeta activa de Campañas: vuelve a capturar sólo
 * esas vistas con los mismos nombres de archivo. Sólo lectura: nada se crea ni se modifica.
 *   node capture_base.mjs plan_c_repaso.mjs ../../docs/evidence/rediseno-web-v2/c
 */
const SIZES_FULL = ['escritorio', 'portatil', 'tableta', 'movil'];

export default [
  {
    role: 'directiva',
    steps: [
      { goto: '/campaigns', after: 6000 },
      { shot: 'campanas/28-campanas', desc: 'Campañas: activa y las demás con «Sellada · versión N» (lámina 28; teléfono 41)', sizes: SIZES_FULL },
      { viewport: 'zoom200' },
      { goto: '/campaigns?z=1', after: 4000 },
      { shot: 'zoom200/28-campanas', desc: 'Campañas al 200 %', sizes: ['actual'], full: false },
      { measure: 'zoom200 campañas' },
      { viewport: 'escritorio' },
    ],
  },
  {
    role: 'admin',
    steps: [
      { goto: '/users', after: 6000 },
      { shot: 'usuarios/31-usuarios', desc: 'Usuarios (Administración) con el permiso «Sustituir responsable» (lámina 31; teléfono 44)', sizes: SIZES_FULL },
      { viewport: 'movil' },
      { goto: '/users?m=1', after: 4000 },
      { measure: 'movil usuarios' },
      { viewport: 'escritorio' },
    ],
  },
];
