/**
 * Escritor mínimo de libros `.xlsx` (Office Open XML, SpreadsheetML), sin
 * dependencias: un ZIP sin compresión con texto en línea, estilos, anchos de
 * columna, filtros y paneles inmovilizados. No hay fórmulas: ningún texto que
 * llegue de un usuario («=…», «+…») se evalúa al abrir el libro.
 *
 * Los números se escriben tal como llegan, como string decimal con punto
 * (`"11.5"`, `"0.000292613"`): el XML del libro no depende de la configuración
 * regional, así que Excel los lee igual con coma o con punto decimal. Este
 * módulo no convierte, no redondea y no suma nada.
 */

export type XlsxStyle = 'default' | 'title' | 'note' | 'header' | 'label' | 'wrap' | 'date' | 'integer';

export type XlsxCell =
  | null
  | { kind: 'text'; value: string; style?: XlsxStyle }
  /** `value` es un decimal exacto con punto; `decimals` fija cuántos se muestran (0–9). */
  | { kind: 'number'; value: string; decimals: number; style?: 'number' | 'integer' }
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

// Estilos (índices de cellXfs). Las cifras con d decimales usan NUMBER_BASE + d.
const XF: Record<XlsxStyle, number> = { default: 0, title: 1, note: 2, header: 3, label: 4, wrap: 5, date: 6, integer: 7 };
const NUMBER_BASE = 8;

function numberFormat(decimals: number): string {
  return decimals === 0 ? '#,##0' : `#,##0.${'0'.repeat(decimals)}`;
}

function stylesXml(): string {
  const numFmts = [`<numFmt numFmtId="164" formatCode="yyyy-mm-dd hh:mm"/>`];
  for (let d = 0; d <= MAX_DECIMALS; d++) numFmts.push(`<numFmt numFmtId="${165 + d}" formatCode="${numberFormat(d)}"/>`);
  const top = '<alignment vertical="top"/>';
  const topWrap = '<alignment vertical="top" wrapText="1"/>';
  const xfs = [
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1">${top}</xf>`, // default
    `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>`, // title
    // note: sin ajuste de línea, para que una nota larga se lea sobre las celdas vacías de la derecha
    `<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1">${top}</xf>`,
    `<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>`, // header
    `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1">${top}</xf>`, // label
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1">${topWrap}</xf>`, // wrap
    `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left" vertical="top"/></xf>`, // date
    `<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1">${top}</xf>`, // integer
  ];
  for (let d = 0; d <= MAX_DECIMALS; d++) {
    xfs.push(`<xf numFmtId="${165 + d}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1">${top}</xf>`);
  }
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<numFmts count="${numFmts.length}">${numFmts.join('')}</numFmts>` +
    '<fonts count="4">' +
    '<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
    '<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
    '<font><b/><sz val="14"/><name val="Calibri"/><family val="2"/></font>' +
    '<font><i/><sz val="10"/><color rgb="FF475569"/><name val="Calibri"/><family val="2"/></font>' +
    '</fonts>' +
    '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFE2E8F0"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
    '<border><left/><right/><top/><bottom style="thin"><color rgb="FF94A3B8"/></bottom><diagonal/></border></borders>' +
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
  const style = cell.style === 'integer' ? XF.integer : NUMBER_BASE + decimals;
  return `<c r="${ref}" s="${style}"><v>${cell.value}</v></c>`;
}

function sheetXml(sheet: XlsxSheet): string {
  const columns = Math.max(sheet.widths.length, ...sheet.rows.map((r) => r.length), 1);
  const lastRef = `${columnName(columns - 1)}${Math.max(sheet.rows.length, 1)}`;
  const freeze = sheet.freezeRows ?? 0;
  const view =
    freeze > 0
      ? `<sheetView workbookViewId="0"><pane ySplit="${freeze}" topLeftCell="A${freeze + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${freeze + 1}" sqref="A${freeze + 1}"/></sheetView>`
      : '<sheetView workbookViewId="0"/>';
  const cols = sheet.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
  const rows = sheet.rows
    .map((row, r) => {
      const cells = row.map((cell, c) => cellXml(cell, `${columnName(c)}${r + 1}`)).join('');
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join('');
  const filter = sheet.filter ? `<autoFilter ref="${filterRef(sheet.filter)}"/>` : '';
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<dimension ref="A1:${lastRef}"/>` +
    `<sheetViews>${view}</sheetViews>` +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    (cols ? `<cols>${cols}</cols>` : '') +
    `<sheetData>${rows}</sheetData>` +
    filter +
    '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>' +
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
