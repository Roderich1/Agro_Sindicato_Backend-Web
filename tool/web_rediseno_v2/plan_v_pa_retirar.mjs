// VERIFICACIÓN 5 (b), segunda pasada: sólo la retirada del permiso «Sustituir responsable» a Sucesora PA (sintética).
// La primera pasada de plan_v_pa.mjs buscaba el diálogo de retirar como role="dialog"; es role="alertdialog" y no se retiró.
import { retirar } from './plan_v_pa.mjs';
export default [retirar];
