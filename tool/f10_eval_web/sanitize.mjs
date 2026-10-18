/**
 * F10 (§0.9 del protocolo): saneado de lo que se publica en docs/evidence.
 *
 *   node sanitize.mjs <directorio>
 *
 * Recorre el directorio: en los .json y .csv enmascara los UUID a sus 8
 * primeros hex, retira los correos (claves `email`/`emails` y cualquier valor
 * con forma de correo) y renombra los archivos cuyo nombre lleve un UUID.
 * No toca los .png ni los .log. Los valores medidos no cambian: sólo
 * identificadores. Idempotente.
 */
import { readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const [root = '.'] = process.argv.slice(2);
const UUID = /\b([0-9a-f]{8})-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
let files = 0;

function scrub(value) {
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !/^e-?mails?$/i.test(key))
        .map(([key, v]) => [key.replace(UUID, '$1'), scrub(v)]),
    );
  }
  if (typeof value === 'string') return value.replace(UUID, '$1').replace(EMAIL, '<correo retirado>');
  return value;
}

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) { walk(path); continue; }
    if (name.endsWith('.json')) {
      writeFileSync(path, `${JSON.stringify(scrub(JSON.parse(readFileSync(path, 'utf8'))), null, 2)}\n`);
      files += 1;
    } else if (name.endsWith('.csv')) {
      writeFileSync(path, readFileSync(path, 'utf8').replace(UUID, '$1').replace(EMAIL, '<correo retirado>'));
      files += 1;
    } else continue;
    const clean = name.replace(UUID, '$1');
    if (clean !== name) renameSync(path, join(dir, clean));
  }
}

walk(root);
// Sólo el nombre del directorio: la salida se anexa a env.txt, que se publica,
// y una ruta absoluta llevaría el nombre de usuario del PC.
process.stdout.write(`saneado: ${files} archivos en ${basename(root)}\n`);
