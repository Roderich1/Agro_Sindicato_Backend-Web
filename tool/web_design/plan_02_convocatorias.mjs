// Lote 2: convocatorias, permisos, consentimiento y sustitución (P-A). IDs del entorno aislado.
const C = '/colectivo/compras-conjuntas';
const OPEN_DIR = `${C}/c5e618a7-c7de-435d-ab0a-575dfe7c4891`;
const CLOSED = `${C}/514f346e-b245-4be0-89dd-f1c90bbf3684`;
const DRAFT = `${C}/2a461584-350c-4a15-9036-aa8b5e14404f`;
const INELIGIBLE = `${C}/2894efd3-8294-4ace-a4b5-87c89e719be1`;
const SUCCESSOR = `${C}/69bfef4a-be8e-4464-9e70-7aafc6a7cf15`;
const REVIEWED = `${C}/123434f8-0ea0-4e16-9b88-12ebc2568dd3`;
const TO_CANCEL = `${C}/56b761a0-40e1-48a6-8fe8-5c3295012623`;
export default [
  {
    role: 'directiva',
    steps: [
      { goto: OPEN_DIR },
      { open: 'details' },
      { shot: '05_convocatorias/02_abierta_responsable', desc: 'Convocatoria abierta vista por su responsable: productos, participantes según consentimiento, colaboradores e historial', state: 'abierta', mobile: true },
      { goto: CLOSED },
      { open: 'details' },
      { shot: '05_convocatorias/03_cerrada_consolidado', desc: 'Convocatoria cerrada con consolidado (no es una compra)', state: 'cerrada', mobile: true },
      { goto: DRAFT },
      { shot: '05_convocatorias/04_borrador_desde_propuesta', desc: 'Borrador creado desde una propuesta (origen visible)', state: 'borrador' },
      { click: '^Abrir( convocatoria)?$' },
      { shot: '05_convocatorias/05_abrir_confirmacion', desc: 'Confirmación para abrir la convocatoria (no se confirma)', state: 'diálogo', full: false },
      { escape: true },
      { goto: C },
      { click: '^Nueva convocatoria$' },
      { wait: 1500 },
      { shot: '05_convocatorias/06_nueva_desde_catalogo', desc: 'Formulario de convocatoria nueva (desde el catálogo)', state: 'formulario', full: false, mobile: true },
      { escape: true },
      { goto: INELIGIBLE },
      { shot: '06_permisos_psa/01_responsable_inhabilitada', desc: 'Responsable que ya no está habilitada: aviso, permisos suspendidos, sin Cerrar ni Cancelar; nombre largo', state: 'responsable inhabilitada', mobile: true },
      { click: '^Sustituir responsable$' },
      { select: ['#substitute-user', 'Sucesora PA'] },
      { type: ['#substitute-reason', 'La responsable dejó de estar habilitada (motivo sintético)'] },
      { shot: '06_permisos_psa/02_sustituir_dialogo', desc: 'Diálogo de sustitución: implicaciones, quien sustituye no figura (nota), motivo y confirmación (no se envía)', state: 'diálogo', full: false, mobile: true },
      { escape: true },
    ],
  },
  {
    role: 'suc',
    steps: [
      { goto: SUCCESSOR },
      { open: 'details' },
      { shot: '06_permisos_psa/03_sucesora_restringida', desc: 'Nueva responsable: datos restringidos hasta que cada agricultor la autorice; permisos suspendidos por revisar', state: 'restringido', mobile: true },
      { click: '^Confirmar «' },
      { shot: '06_permisos_psa/04_revisar_permiso', desc: 'Revisión de un permiso suspendido (confirmar o retirar; no se envía)', state: 'diálogo', full: false },
      { escape: true },
      { goto: REVIEWED },
      { open: 'details' },
      { shot: '06_permisos_psa/05_sucesora_tras_autorizacion', desc: 'Tras la revisión: un participante autorizó a la nueva responsable, otro pendiente; historial de permisos', state: 'parcialmente restringido' },
    ],
  },
  {
    role: 'admin',
    steps: [
      { goto: C },
      { open: '[data-testid="substitution-permissions"]' },
      { shot: '06_permisos_psa/06_permiso_sustituir_sindicato', desc: 'Permiso del sindicato «Sustituir responsable» (Administrador): titulares e historial', state: 'abierto', mobile: true },
      { clickSel: '[data-testid="substitution-grant-button"]' },
      { shot: '06_permisos_psa/07_conceder_permiso_dialogo', desc: 'Conceder el permiso a una persona concreta, con motivo (no se envía)', state: 'diálogo', full: false },
      { escape: true },
      { goto: OPEN_DIR },
      { shot: '05_convocatorias/07_sin_permiso_participantes', desc: 'Otra persona de la Directiva/Administración sin permiso de la responsable: no ve participantes', state: 'sin permiso' },
      { goto: TO_CANCEL },
      { click: '^Cancelar convocatoria$' },
      { type: ['[role="dialog"] textarea', 'Convocatoria de prueba que ya no se usará (sintética)'] },
      { check: '[role="dialog"] input[type="checkbox"]' },
      { shot: '05_convocatorias/08_cancelar_confirmacion', desc: 'Cancelar una convocatoria abierta: motivo y confirmación', state: 'diálogo', full: false },
      { click: '^Cancelar convocatoria$', in: '[role="dialog"]' },
      { wait: 2500 },
      { shot: '05_convocatorias/09_cancelada', desc: 'Convocatoria cancelada (operación hecha en el entorno sintético)', state: 'cancelada' },
    ],
  },
];
