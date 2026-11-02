import type { InstitutionalResults } from '../types/estimation';

/**
 * F12-EST-06 (#179): exportación de la consulta de resultados tal como la
 * entregó el servidor (`GET /estimation/results`, perfil institucional). Cada
 * celda es el valor de la respuesta, sin traducir, convertir ni recalcular: la
 * exportación coincide con el servicio. No es la copia sin conexión (RF-40, de
 * F12-EST-07): no se guarda en el navegador.
 */
export const RESULTS_CSV_COLUMNS = [
  'target_campaign_ref',
  'target_name',
  'season_key',
  'evaluated_at',
  'product_ref',
  'product_name',
  'base_unit',
  'presentation_unit',
  'status',
  'reason_code',
  'method',
  'run_ref',
  'generated_at',
  'span_length',
  'estimate_base',
  'naive_base',
  'coverage_status',
  'validity',
  'validity_reason',
] as const;

type Column = (typeof RESULTS_CSV_COLUMNS)[number];

/** Una fila por resultado, con los valores de la respuesta (null → celda vacía). */
export function resultsRows(response: InstitutionalResults): Record<Column, string>[] {
  return response.results.map((result) => {
    const row: Record<Column, string | number | null> = {
      target_campaign_ref: response.target.campaign_ref,
      target_name: response.target.name,
      season_key: response.season?.key ?? null,
      evaluated_at: response.evaluated_at,
      product_ref: result.product.product_ref,
      product_name: result.product.name,
      base_unit: result.base_unit,
      presentation_unit: result.presentation_unit,
      status: result.status,
      reason_code: result.reason_code,
      method: result.method,
      run_ref: result.run_ref,
      generated_at: result.generated_at,
      span_length: result.span_length,
      estimate_base: result.estimate_base,
      naive_base: result.naive_base,
      coverage_status: result.coverage.status,
      validity: result.validity,
      validity_reason: result.validity_reason,
    };
    return Object.fromEntries(RESULTS_CSV_COLUMNS.map((column) => [column, row[column] === null ? '' : String(row[column])])) as Record<
      Column,
      string
    >;
  });
}

const quote = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

/** CSV (RFC 4180, separador coma, fin de línea CRLF) de la consulta. */
export function resultsCsv(response: InstitutionalResults): string {
  const lines = [RESULTS_CSV_COLUMNS.join(','), ...resultsRows(response).map((row) => RESULTS_CSV_COLUMNS.map((c) => quote(row[c])).join(','))];
  return `${lines.join('\r\n')}\r\n`;
}

/** Lee un CSV de `resultsCsv` (para comprobar que la exportación coincide con la respuesta). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\r' && text[i + 1] === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
    } else field += ch;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
