/**
 * Escritor mínimo de libros `.xlsx` (Office Open XML, SpreadsheetML), sin
 * dependencias: un ZIP sin compresión con texto en línea, estilos, anchos de
 * columna, filtros, paneles inmovilizados, celdas combinadas, alturas de fila,
 * color de pestaña y configuración de impresión. No hay fórmulas: ningún texto
 * que llegue de un usuario («=…», «+…») se evalúa al abrir el libro.
 *
 * Los números se escriben tal como llegan, como string decimal con punto
 * (`"11.5"`, `"0.000292613"`): el XML del libro no depende de la configuración
 * regional, así que Excel los lee igual con coma o con punto decimal. Este
 * módulo no convierte, no redondea y no suma nada.
 *
 * Identidad visual (defensa, 2026-11-05): verde oscuro `#0F1D15` para la banda
 * superior, esmeralda `#047857` para títulos y encabezados, superficies claras,
 * estados «Publicado» en verde y los demás en ámbar, cifras en negrita.
 */

export type XlsxStyle =
  | 'default'
  | 'title'
  | 'note'
  | 'header'
  | 'label'
  | 'wrap'
  | 'date'
  | 'integer'
  /** Banda superior: texto claro sobre verde oscuro. */
  | 'band'
  | 'subtitle'
  /** Estado favorable («Publicado», «Vigente»). */
  | 'ok'
  /** Estado que pide atención («Oculto por privacidad», «Datos insuficientes»). */
  | 'warn'
  | 'muted'
  | 'strong';

export type XlsxCell =
  | null
  | { kind: 'text'; value: string; style?: XlsxStyle }
  /** `value` es un decimal exacto con punto; `decimals` fija cuántos se muestran (0–9). `emphasis`: cifra destacada. */
  | { kind: 'number'; value: string; decimals: number; style?: 'number' | 'integer' | 'emphasis' }
  /** Número de serie de Excel (días desde 1899-12-30) ya llevado a la hora local deseada. */
  | { kind: 'date'; serial: number };

export interface XlsxSheet {
  /** Hasta 31 caracteres, sin `[]:*?/\`. */
  name: string;
  /** Ancho de cada columna, en caracteres. */
  widths: number[];
  rows: XlsxCell[][];
  /** Filas superiores inmovilizadas (incluye la fila de encabezados). */
  freezeRows?: number;
  /** Filtro automático: fila de encabezados (1 = primera) y última fila de datos. */
  filter?: { headerRow: number; lastRow: number; columns: number };
  /** Color de la pestaña, `RRGGBB`. */
  tabColor?: string;
  /** Rangos combinados, p. ej. `A1:G1`. */
  merges?: string[];
  /** Altura en puntos de filas concretas (1 = primera). */
  rowHeights?: Record<number, number>;
  /** Oculta la cuadrícula (portadas). */
  hideGridLines?: boolean;
  /** Impresión apaisada y ajustada al ancho de una página. */
  landscape?: boolean;
}

const DECIMAL = /^(0|[1-9][0-9]*)(\.[0-9]+)?$/;
const MAX_DECIMALS = 9;

/** `true` sólo para un decimal no negativo escrito con punto y sin exponente. */
export function isPlainDecimal(value: string): boolean {
  return DECIMAL.test(value);
}

/** Excel guarda dobles: más de 15 dígitos significativos se redondearían al abrir. */
export function fitsExcelPrecision(value: string): boolean {
  if (!isPlainDecimal(value)) return false;
  const digits = value.replace('.', '').replace(/^0+/, '');
  return digits.length <= 15;
}

/** Columna 0 → `A`, 26 → `AA`. */
export function columnName(index: number): string {
  let n = index + 1;
  let name = '';
  while (n > 0) {
    const rest = (n - 1) % 26;
    name = String.fromCharCode(65 + rest) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

// Caracteres que XML 1.0 no admite (controles y sustitutos sueltos): se quitan.
// eslint-disable-next-line no-control-regex
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export function xmlText(value: string): string {
  return value
    .replace(INVALID_XML, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Estilos (índices de cellXfs). Las cifras con d decimales usan NUMBER_BASE + d (o EMPHASIS_BASE + d).
const XF: Record<XlsxStyle, number> = {
  default: 0,
  title: 1,
  note: 2,
  header: 3,
  label: 4,
  wrap: 5,
  date: 6,
  integer: 7,
  band: 8,
  subtitle: 9,
  ok: 10,
  warn: 11,
  muted: 12,
  strong: 13,
};
const NUMBER_BASE = 14;
const EMPHASIS_BASE = NUMBER_BASE + MAX_DECIMALS + 1;

function numberFormat(decimals: number): string {
  return decimals === 0 ? '#,##0' : `#,##0.${'0'.repeat(decimals)}`;
}

// Fuentes (índices de <fonts>).
const FONTS = [
  '<font><sz val="11"/><color rgb="FF0F172A"/><name val="Calibri"/><family val="2"/></font>', // 0 normal
  '<font><b/><sz val="11"/><color rgb="FF0F172A"/><name val="Calibri"/><family val="2"/></font>', // 1 negrita
  '<font><b/><sz val="18"/><color rgb="FF047857"/><name val="Calibri"/><family val="2"/></font>', // 2 título
  '<font><i/><sz val="10"/><color rgb="FF475569"/><name val="Calibri"/><family val="2"/></font>', // 3 nota
  '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>', // 4 encabezado
  '<font><b/><sz val="13"/><color rgb="FFD1FAE5"/><name val="Calibri"/><family val="2"/></font>', // 5 banda
  '<font><sz val="11"/><color rgb="FF64748B"/><name val="Calibri"/><family val="2"/></font>', // 6 subtítulo
  '<font><b/><sz val="11"/><color rgb="FF047857"/><name val="Calibri"/><family val="2"/></font>', // 7 ok
  '<font><b/><sz val="11"/><color rgb="FF92400E"/><name val="Calibri"/><family val="2"/></font>', // 8 atención
  '<font><b/><sz val="12"/><color rgb="FF0F172A"/><name val="Calibri"/><family val="2"/></font>', // 9 cifra destacada
  '<font><sz val="10"/><color rgb="FF64748B"/><name val="Calibri"/><family val="2"/></font>', // 10 atenuado
  '<font><b/><sz val="10"/><color rgb="FF0F1D15"/><name val="Calibri"/><family val="2"/></font>', // 11 etiqueta
];
// Rellenos.
const FILLS = [
  '<fill><patternFill patternType="none"/></fill>', // 0
  '<fill><patternFill patternType="gray125"/></fill>', // 1 (reservado por Excel)
  '<fill><patternFill patternType="solid"><fgColor rgb="FF047857"/><bgColor indexed="64"/></patternFill></fill>', // 2 encabezado esmeralda
  '<fill><patternFill patternType="solid"><fgColor rgb="FF0F1D15"/><bgColor indexed="64"/></patternFill></fill>', // 3 banda verde oscuro
  '<fill><patternFill patternType="solid"><fgColor rgb="FFD1FAE5"/><bgColor indexed="64"/></patternFill></fill>', // 4 ok
  '<fill><patternFill patternType="solid"><fgColor rgb="FFFEF3C7"/><bgColor indexed="64"/></patternFill></fill>', // 5 atención
  '<fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/><bgColor indexed="64"/></patternFill></fill>', // 6 etiqueta
];
// Bordes.
const BORDERS = [
  '<border><left/><right/><top/><bottom/><diagonal/></border>', // 0
  '<border><left/><right/><top/><bottom style="medium"><color rgb="FF0F1D15"/></bottom><diagonal/></border>', // 1 encabezado
  '<border><left/><right/><top/><bottom style="thin"><color rgb="FFE2E8F0"/></bottom><diagonal/></border>', // 2 fila de datos
];

function stylesXml(): string {
  const numFmts = [`<numFmt numFmtId="164" formatCode="yyyy-mm-dd hh:mm"/>`];
  for (let d = 0; d <= MAX_DECIMALS; d++) numFmts.push(`<numFmt numFmtId="${165 + d}" formatCode="${numberFormat(d)}"/>`);
  const top = '<alignment vertical="top"/>';
  const topWrap = '<alignment vertical="top" wrapText="1"/>';
  const center = '<alignment vertical="center"/>';
  const xf = (opts: { numFmt?: number; font: number; fill?: number; border?: number; align?: string }) =>
    `<xf numFmtId="${opts.numFmt ?? 0}" fontId="${opts.font}" fillId="${opts.fill ?? 0}" borderId="${opts.border ?? 0}" xfId="0"` +
    `${opts.numFmt ? ' applyNumberFormat="1"' : ''} applyFont="1"${opts.fill ? ' applyFill="1"' : ''}${opts.border ? ' applyBorder="1"' : ''} applyAlignment="1">` +
    `${opts.align ?? top}</xf>`;
  const xfs = [
    xf({ font: 0, border: 2 }), // default
    xf({ font: 2, align: center }), // title
    xf({ font: 3 }), // note: sin ajuste de línea, se lee sobre las celdas vacías de la derecha
    xf({ font: 4, fill: 2, border: 1, align: '<alignment vertical="center" wrapText="1"/>' }), // header
    xf({ font: 11, fill: 6, border: 2 }), // label
    xf({ font: 0, border: 2, align: topWrap }), // wrap
    xf({ numFmt: 164, font: 0, border: 2, align: '<alignment horizontal="left" vertical="top"/>' }), // date
    xf({ numFmt: 1, font: 0, border: 2 }), // integer
    xf({ font: 5, fill: 3, align: '<alignment vertical="center" indent="1"/>' }), // band
    xf({ font: 6, align: center }), // subtitle
    xf({ font: 7, fill: 4, border: 2, align: '<alignment horizontal="center" vertical="top"/>' }), // ok
    xf({ font: 8, fill: 5, border: 2, align: '<alignment horizontal="center" vertical="top"/>' }), // warn
    xf({ font: 10, border: 2, align: topWrap }), // muted
    xf({ font: 9, border: 2 }), // strong
  ];
  for (let d = 0; d <= MAX_DECIMALS; d++) xfs.push(xf({ numFmt: 165 + d, font: 0, border: 2 }));
  for (let d = 0; d <= MAX_DECIMALS; d++) xfs.push(xf({ numFmt: 165 + d, font: 9, border: 2 }));
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<numFmts count="${numFmts.length}">${numFmts.join('')}</numFmts>` +
    `<fonts count="${FONTS.length}">${FONTS.join('')}</fonts>` +
    `<fills count="${FILLS.length}">${FILLS.join('')}</fills>` +
    `<borders count="${BORDERS.length}">${BORDERS.join('')}</borders>` +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    `<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>` +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>'
  );
}

function cellXml(cell: XlsxCell, ref: string): string {
  if (cell === null) return '';
  if (cell.kind === 'text') {
    return `<c r="${ref}" s="${XF[cell.style ?? 'default']}" t="inlineStr"><is><t xml:space="preserve">${xmlText(cell.value)}</t></is></c>`;
  }
  if (cell.kind === 'date') {
    if (!Number.isFinite(cell.serial)) return '';
    return `<c r="${ref}" s="${XF.date}"><v>${cell.serial}</v></c>`;
  }
  // Una cifra que no es un decimal simple, o que Excel redondearía, no se escribe: mejor vacía que dudosa.
  if (!fitsExcelPrecision(cell.value)) throw new Error(`xlsx: cifra no admitida (${cell.value})`);
  const decimals = Math.min(Math.max(Math.trunc(cell.decimals), 0), MAX_DECIMALS);
  const style = cell.style === 'integer' ? XF.integer : (cell.style === 'emphasis' ? EMPHASIS_BASE : NUMBER_BASE) + decimals;
  return `<c r="${ref}" s="${style}"><v>${cell.value}</v></c>`;
}

const MERGE = /^[A-Z]+\d+:[A-Z]+\d+$/;

function sheetXml(sheet: XlsxSheet): string {
  const columns = Math.max(sheet.widths.length, ...sheet.rows.map((r) => r.length), 1);
  const lastRef = `${columnName(columns - 1)}${Math.max(sheet.rows.length, 1)}`;
  const freeze = sheet.freezeRows ?? 0;
  const grid = sheet.hideGridLines ? ' showGridLines="0"' : '';
  const view =
    freeze > 0
      ? `<sheetView workbookViewId="0"${grid}><pane ySplit="${freeze}" topLeftCell="A${freeze + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${freeze + 1}" sqref="A${freeze + 1}"/></sheetView>`
      : `<sheetView workbookViewId="0"${grid}/>`;
  const cols = sheet.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
  const rows = sheet.rows
    .map((row, r) => {
      const cells = row.map((cell, c) => cellXml(cell, `${columnName(c)}${r + 1}`)).join('');
      const height = sheet.rowHeights?.[r + 1];
      return `<row r="${r + 1}"${height ? ` ht="${height}" customHeight="1"` : ''}>${cells}</row>`;
    })
    .join('');
  const filter = sheet.filter ? `<autoFilter ref="${filterRef(sheet.filter)}"/>` : '';
  const merges = (sheet.merges ?? []).filter((m) => MERGE.test(m));
  const mergeCells = merges.length ? `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
  const sheetPr =
    sheet.tabColor || sheet.landscape
      ? `<sheetPr>${sheet.tabColor ? `<tabColor rgb="FF${sheet.tabColor}"/>` : ''}${sheet.landscape ? '<pageSetUpPr fitToPage="1"/>' : ''}</sheetPr>`
      : '';
  const pageSetup = sheet.landscape ? '<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>' : '';
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    sheetPr +
    `<dimension ref="A1:${lastRef}"/>` +
    `<sheetViews>${view}</sheetViews>` +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    (cols ? `<cols>${cols}</cols>` : '') +
    `<sheetData>${rows}</sheetData>` +
    filter +
    mergeCells +
    '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>' +
    pageSetup +
    '</worksheet>'
  );
}

function filterRef(filter: NonNullable<XlsxSheet['filter']>): string {
  const last = columnName(filter.columns - 1);
  return `A${filter.headerRow}:${last}${Math.max(filter.lastRow, filter.headerRow)}`;
}

function absoluteRef(sheetName: string, ref: string): string {
  const [from, to] = ref.split(':') as [string, string];
  const abs = (r: string) => r.replace(/^([A-Z]+)(\d+)$/, '$$$1$$$2');
  return `'${sheetName.replace(/'/g, "''")}'!${abs(from)}:${abs(to)}`;
}

function workbookXml(sheets: XlsxSheet[]): string {
  const entries = sheets.map((s, i) => `<sheet name="${xmlText(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('');
  const names = sheets
    .map((s, i) =>
      s.filter
        ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${xmlText(absoluteRef(s.name, filterRef(s.filter)))}</definedName>`
        : '',
    )
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<bookViews><workbookView activeTab="0"/></bookViews>' +
    `<sheets>${entries}</sheets>` +
    (names ? `<definedNames>${names}</definedNames>` : '') +
    '</workbook>'
  );
}

function contentTypesXml(count: number): string {
  const sheets = Array.from(
    { length: count },
    (_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join('');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    sheets +
    '</Types>'
  );
}

const ROOT_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
  '</Relationships>';

function workbookRelsXml(count: number): string {
  const sheets = Array.from(
    { length: count },
    (_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
  ).join('');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    sheets +
    `<Relationship Id="rId${count + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    '</Relationships>'
  );
}

function coreXml(title: string, created: Date): string {
  const iso = `${created.toISOString().slice(0, 19)}Z`;
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    `<dc:title>${xmlText(title)}</dc:title>` +
    '<dc:creator>Agrocuentas</dc:creator>' +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created>` +
    '</cp:coreProperties>'
  );
}

const SHEET_NAME = /^[^[\]:*?/\\]{1,31}$/;

/** El libro completo, como bytes de un `.xlsx`. Mismo contenido y fecha → mismos bytes. */
export function buildXlsx(sheets: XlsxSheet[], meta: { title: string; created: Date }): Uint8Array {
  if (sheets.length === 0) throw new Error('xlsx: el libro necesita al menos una hoja');
  const names = new Set<string>();
  for (const sheet of sheets) {
    if (!SHEET_NAME.test(sheet.name)) throw new Error(`xlsx: nombre de hoja no válido (${sheet.name})`);
    const key = sheet.name.toLowerCase();
    if (names.has(key)) throw new Error(`xlsx: hoja repetida (${sheet.name})`);
    names.add(key);
  }
  const files: [string, string][] = [
    ['[Content_Types].xml', contentTypesXml(sheets.length)],
    ['_rels/.rels', ROOT_RELS],
    ['docProps/core.xml', coreXml(meta.title, meta.created)],
    ['xl/workbook.xml', workbookXml(sheets)],
    ['xl/_rels/workbook.xml.rels', workbookRelsXml(sheets.length)],
    ['xl/styles.xml', stylesXml()],
    ...sheets.map((s, i): [string, string] => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)]),
  ];
  return zipStore(files, meta.created);
}

// --- ZIP (método 0, sin compresión) ---------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Fecha y hora MS-DOS, en UTC para que el archivo no dependa de la zona del equipo. */
function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.min(Math.max(date.getUTCFullYear(), 1980), 2107);
  return {
    time: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | Math.floor(date.getUTCSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
  };
}

function zipStore(files: [string, string][], modified: Date): Uint8Array {
  const encoder = new TextEncoder();
  const { time, date } = dosDateTime(modified);
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [path, content] of files) {
    const name = encoder.encode(path);
    const data = encoder.encode(content);
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // nombres en UTF-8
    lv.setUint16(8, 0, true);
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);
    local.set(data, 30 + name.length);
    locals.push(local);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    centrals.push(central);
    offset += local.length;
  }
  const centralSize = centrals.reduce((sum, c) => sum + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + centralSize + end.length);
  let at = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
