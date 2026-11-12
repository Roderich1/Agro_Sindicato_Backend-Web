// Lote 2b: pasos del lote 2 que fallaron por el límite de autenticación o por el selector.
const C = '/colectivo/compras-conjuntas';
export default [
  {
    role: 'suc',
    steps: [
      { goto: `${C}/69bfef4a-be8e-4464-9e70-7aafc6a7cf15` },
      { open: 'details' },
      { clickSel: 'button[aria-label^="Confirmar «"]' },
      { shot: '06_permisos_psa/04_revisar_permiso', desc: 'Revisión de un permiso suspendido: confirmar (no se envía)', state: 'diálogo', full: false },
      { escape: true },
      { goto: `${C}/123434f8-0ea0-4e16-9b88-12ebc2568dd3` },
      { open: 'details' },
      { shot: '06_permisos_psa/05_sucesora_tras_autorizacion', desc: 'Tras la revisión: un participante autorizó a la nueva responsable, otros pendientes; historial de permisos', state: 'parcialmente restringido' },
    ],
  },
  {
    role: 'admin',
    steps: [
      { goto: C },
      { open: '[data-testid="substitution-permissions"]' },
      { clickSel: '[data-testid="substitution-grant-button"]' },
      { shot: '06_permisos_psa/07_conceder_permiso_dialogo', desc: 'Conceder el permiso a una persona concreta, con motivo (no se envía)', state: 'diálogo', full: false },
      { escape: true },
    ],
  },
];
