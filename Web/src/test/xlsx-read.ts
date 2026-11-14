/**
 * Lector de los libros `.xlsx` que produce `lib/xlsx-writer.ts`, para las
 * pruebas: descomprime el ZIP (método 0) y lee las celdas del XML como las
 * leería Excel (tipo, estilo y valor). Sólo para datos sintéticos.
 */

function crcBitwise(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function unzipStored(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  if (view.getUint32(end, true) !== 0x06054b50) throw new Error('zip: sin registro final');
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const files = new Map<string, string>();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  for (let i = 0; i < count; i++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new Error('zip: directorio central dañado');
    const method = view.getUint16(at + 10, true);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const offset = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    if (method !== 0) throw new Error(`zip: ${name} comprimido`);
    if (view.getUint32(offset, true) !== 0x04034b50) throw new Error(`zip: cabecera local de ${name} dañada`);
    const dataStart = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true);
    const data = bytes.subarray(dataStart, dataStart + size);
    if (crcBitwise(data) !== crc) throw new Error(`zip: CRC de ${name} no coincide`);
    files.set(name, decoder.decode(data));
    at += 46 + nameLength;
  }
  return files;
}

export interface ReadCell {
  type: 'n' | 'inlineStr' | null;
  style: number;
  value: string | null;
}

export interface ReadSheet {
  cells: Map<string, ReadCell>;
  xml: Document;
  /** Texto de todas las celdas, en orden de aparición. */
  text: string;
}

function parse(xml: string): Document {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) throw new Error('xml: no válido');
  return doc;
}

function readSheet(xml: string): ReadSheet {
  const doc = parse(xml);
  const cells = new Map<string, ReadCell>();
  for (const c of Array.from(doc.getElementsByTagName('c'))) {
    const t = c.getAttribute('t');
    const v = c.getElementsByTagName('v')[0]?.textContent ?? null;
    const s = c.getElementsByTagName('t')[0]?.textContent ?? null;
    cells.set(c.getAttribute('r')!, { type: t === 'inlineStr' ? 'inlineStr' : v !== null ? 'n' : null, style: Number(c.getAttribute('s') ?? 0), value: t === 'inlineStr' ? s : v });
  }
  return { cells, xml: doc, text: [...cells.values()].map((c) => c.value ?? '').join('\n') };
}

export interface ReadBook {
  files: Map<string, string>;
  sheetNames: string[];
  sheets: Map<string, ReadSheet>;
  numFmtOf: (style: number) => string;
  /** Color de fuente y de relleno del estilo (`RRGGBB`), para comprobar la identidad visual. */
  colorsOf: (style: number) => { font: string | null; fill: string | null; bold: boolean };
}

export function readXlsx(bytes: Uint8Array): ReadBook {
  const files = unzipStored(bytes);
  const workbook = parse(files.get('xl/workbook.xml')!);
  const sheetNames = Array.from(workbook.getElementsByTagName('sheet')).map((s) => s.getAttribute('name')!);
  const sheets = new Map(sheetNames.map((name, i) => [name, readSheet(files.get(`xl/worksheets/sheet${i + 1}.xml`)!)]));
  const styles = parse(files.get('xl/styles.xml')!);
  const formats = new Map(Array.from(styles.getElementsByTagName('numFmt')).map((f) => [f.getAttribute('numFmtId')!, f.getAttribute('formatCode')!]));
  const xfs = Array.from(styles.getElementsByTagName('cellXfs')[0]!.getElementsByTagName('xf'));
  const fonts = Array.from(styles.getElementsByTagName('fonts')[0]!.getElementsByTagName('font'));
  const fills = Array.from(styles.getElementsByTagName('fills')[0]!.getElementsByTagName('fill'));
  const numFmtOf = (style: number) => {
    const id = xfs[style]!.getAttribute('numFmtId')!;
    return formats.get(id) ?? `builtin:${id}`;
  };
  const colorsOf = (style: number) => {
    const xf = xfs[style]!;
    const font = fonts[Number(xf.getAttribute('fontId'))]!;
    const fill = fills[Number(xf.getAttribute('fillId'))]!;
    const rgb = (el: Element | undefined) => el?.getAttribute('rgb')?.slice(2) ?? null;
    return {
      font: rgb(font.getElementsByTagName('color')[0]),
      fill: rgb(fill.getElementsByTagName('fgColor')[0]),
      bold: font.getElementsByTagName('b').length > 0,
    };
  };
  return { files, sheetNames, sheets, numFmtOf, colorsOf };
}

/** Fila de datos cuyo producto (columna A) coincide. */
export function rowOf(sheet: ReadSheet, product: string, startRow = 6): number {
  for (const [ref, cell] of sheet.cells) {
    const match = /^A(\d+)$/.exec(ref);
    if (match && Number(match[1]) >= startRow && cell.value === product) return Number(match[1]);
  }
  throw new Error(`sin fila para ${product}`);
}
