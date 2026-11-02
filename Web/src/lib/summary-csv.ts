/**
 * Lectura mínima del CSV del resumen (`summaryCsv` del servidor): la fecha
 * más reciente de `data_as_of` («datos aceptados hasta») entre las filas de
 * cifras, para mostrarla junto a la descarga. Es la de la cifra más reciente,
 * no una garantía de que todos los agricultores hayan publicado hasta
 * entonces. No interpreta cantidades ni estados.
 */
export function latestDataAsOf(csv: string): string | null {
  const lines = csv.split(/\r?\n/);
  const header = lines.findIndex((line) => line.startsWith('projection_type,'));
  if (header < 0) return null;
  const column = splitCsvLine(lines[header]).indexOf('data_as_of');
  if (column < 0) return null;
  let latest: string | null = null;
  for (const line of lines.slice(header + 1)) {
    if (!line.trim()) continue;
    const value = splitCsvLine(line)[column] ?? '';
    if (/^\d{4}-\d{2}-\d{2}T/.test(value) && (latest === null || value > latest)) latest = value;
  }
  return latest;
}

/** Divide una línea CSV respetando comillas dobles (RFC 4180). */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      out.push(field);
      field = '';
    } else field += ch;
  }
  out.push(field);
  return out;
}
