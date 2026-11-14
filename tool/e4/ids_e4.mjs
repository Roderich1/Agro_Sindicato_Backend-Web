// Referencias de las convocatorias de la verificación (docs/evidence/E4/datos/03_convocatorias.json).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const file = fileURLToPath(new URL('../../docs/evidence/E4/datos/03_convocatorias.json', import.meta.url));
const d = JSON.parse(readFileSync(file, 'utf8'));
export const C = Object.fromEntries(Object.entries(d.calls).map(([k, v]) => [k, `/colectivo/compras-conjuntas/${v.call_ref}`]));
export const LIST = '/colectivo/compras-conjuntas';
// Nombres de agricultores, «umbral» y «anónimo» no deben aparecer en lo que ve la Directiva.
export const FORBID_DIRECTIVA = ['F1 sintético', 'F2 sintético', 'F3 sintético', 'anónim', 'umbral', 'Consultar participantes y cantidades'];
