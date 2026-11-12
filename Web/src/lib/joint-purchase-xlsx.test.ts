import { describe, expect, it } from 'vitest';
import { line, proposalWith } from '../test/fixtures';
import { available, BLOCKER_MESSAGE, comparableWith, LINK_RUN_REF, linkOf, linkViewFor } from '../dev/fixtures/proposal-fixtures';
import type { Proposal } from '../types/collective';
import { buildJointPurchaseXlsx, jointPurchaseXlsxFileName } from './joint-purchase-xlsx';
import { buildXlsx, columnName, crc32, fitsExcelPrecision } from './xlsx-writer';

/**
 * Exportador «Compra conjunta» (.xlsx). Datos sintéticos. El libro se
 * descomprime aquí mismo (ZIP sin compresión) y se leen las celdas del XML,
 * como las leería Excel: tipo, estilo y valor.
 */

// --- Lectura del libro --------------------------------------------------------

/** CRC-32 bit a bit, independiente de la tabla del escritor. */
function crcBitwise(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function unzip(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const files = new Map<string, string>();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const method = view.getUint16(at + 10, true);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const offset = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    expect(method).toBe(0);
    expect(view.getUint32(offset, true)).toBe(0x04034b50);
    const dataStart = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true);
    const data = bytes.subarray(dataStart, dataStart + size);
    expect(crcBitwise(data)).toBe(crc);
    files.set(name, decoder.decode(data));
    at += 46 + nameLength;
  }
  return files;
}

interface ReadCell {
  type: 'n' | 'inlineStr' | null;
  style: number;
  value: string | null;
}

interface ReadSheet {
  cells: Map<string, ReadCell>;
  xml: Document;
}

function parse(xml: string): Document {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
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
  return { cells, xml: doc };
}

interface Book {
  files: Map<string, string>;
  sheetNames: string[];
  sheets: Map<string, ReadSheet>;
  numFmtOf: (style: number) => string;
}

function read(bytes: Uint8Array): Book {
  const files = unzip(bytes);
  const workbook = parse(files.get('xl/workbook.xml')!);
  const sheetNames = Array.from(workbook.getElementsByTagName('sheet')).map((s) => s.getAttribute('name')!);
  const sheets = new Map(sheetNames.map((name, i) => [name, readSheet(files.get(`xl/worksheets/sheet${i + 1}.xml`)!)]));
  const styles = parse(files.get('xl/styles.xml')!);
  const formats = new Map(Array.from(styles.getElementsByTagName('numFmt')).map((f) => [f.getAttribute('numFmtId')!, f.getAttribute('formatCode')!]));
  const xfs = Array.from(styles.getElementsByTagName('cellXfs')[0]!.getElementsByTagName('xf'));
  const numFmtOf = (style: number) => {
    const id = xfs[style]!.getAttribute('numFmtId')!;
    return formats.get(id) ?? `builtin:${id}`;
  };
  return { files, sheetNames, sheets, numFmtOf };
}

/** Fila de datos (después de los encabezados) cuyo producto coincide. */
function rowOf(sheet: ReadSheet, product: string, unit?: string): number {
  for (const [ref, cell] of sheet.cells) {
    const [, col, row] = /^([A-Z]+)(\d+)$/.exec(ref)!;
    if (col === 'A' && cell.value === product && (!unit || sheet.cells.get(`C${row}`)?.value === unit)) return Number(row);
  }
  throw new Error(`sin fila para ${product}`);
}

// --- Datos sintéticos -----------------------------------------------------------

const EXPORTED_AT = new Date('2026-11-05T17:00:00.000Z');

const DRAFT = proposalWith([
  line({ position: 0, product_name: 'Fungicida sintético', quantity_base: '53000', quantity_presentation: '53', contributors: 3, data_as_of: '2026-11-03T23:54:25.043Z' }),
  line({ position: 1, product_name: 'Herbicida sintético', quantity_base: '11500', quantity_presentation: '11.5', contributors: 5, pending_changes: true }),
  line({ position: 2, product_name: 'Adherente sintético', base_unit: 'G', quantity_base: '25', quantity_presentation: '0.025', contributors: 4 }),
  line({ position: 3, product_name: 'Insecticida sintético', status: 'SUPPRESSED_UNDER_THRESHOLD' }),
  line({ position: 4, product_name: 'Cero sintético', quantity_base: '0', quantity_presentation: '0', contributors: 3 }),
]);

// Columnas de «Necesidades»: A Producto, B Cantidad, C Unidad, D Estado, E Explicación, F Aportantes, G Datos hasta,
// H Cambios pendientes, I Publicado el, J N.º de línea, K Referencia del producto.
// Hoja de datos: banda, título, nota y fila libre; los encabezados van en la fila 5.
const NEED_HEADER_ROW = 5;

describe('exportador Compra conjunta (.xlsx)', () => {
  it('hojas Borrador y Necesidades; sin referencia consultada no hay tercera hoja y se explica', () => {
    const book = buildJointPurchaseXlsx({ proposal: DRAFT, exportedAt: EXPORTED_AT });
    expect(book.includesReference).toBe(false);
    expect(book.fileName).toBe(`propuesta-${DRAFT.proposal_ref}.xlsx`);
    expect(jointPurchaseXlsxFileName(DRAFT)).toBe(book.fileName);
    const { sheetNames, sheets } = read(book.bytes);
    expect(sheetNames).toEqual(['Borrador', 'Necesidades']);
    const summary = [...sheets.get('Borrador')!.cells.values()].map((c) => c.value);
    expect(summary).toContain(DRAFT.campaign.name);
    expect(summary).toContain('Abierta');
    expect(summary).toContain('Borrador');
    expect(summary).toContain('No incluida: la referencia fijada no se pudo consultar al exportar. No se usa ninguna otra estimación en su lugar.');
    // Identificación del borrador y de la campaña (antes, columnas del CSV).
    expect(summary).toContain(DRAFT.proposal_ref);
    expect(summary).toContain(DRAFT.campaign.campaign_ref);
  });

  it('cantidad numérica tal como la publicó el servidor, con su unidad y su estado', () => {
    const { sheets, numFmtOf } = read(buildJointPurchaseXlsx({ proposal: DRAFT, exportedAt: EXPORTED_AT }).bytes);
    const need = sheets.get('Necesidades')!;
    expect(['A', 'B', 'C', 'D'].map((c) => need.cells.get(`${c}${NEED_HEADER_ROW}`)!.value)).toEqual(['Producto', 'Cantidad', 'Unidad', 'Estado']);

    const r1 = rowOf(need, 'Fungicida sintético');
    expect(need.cells.get(`B${r1}`)).toMatchObject({ type: 'n', value: '53' });
    expect(numFmtOf(need.cells.get(`B${r1}`)!.style)).toBe('#,##0');
    expect(need.cells.get(`C${r1}`)!.value).toBe('L');
    expect(need.cells.get(`D${r1}`)!.value).toBe('Publicado');
    expect(need.cells.get(`F${r1}`)).toMatchObject({ type: 'n', value: '3' });

    const r2 = rowOf(need, 'Herbicida sintético');
    expect(need.cells.get(`B${r2}`)).toMatchObject({ type: 'n', value: '11.5' });
    expect(numFmtOf(need.cells.get(`B${r2}`)!.style)).toBe('#,##0.0');
    expect(need.cells.get(`E${r2}`)!.value).toContain('cambios recibidos que aún no alcanzan el umbral');

    const r3 = rowOf(need, 'Adherente sintético');
    expect(need.cells.get(`B${r3}`)).toMatchObject({ type: 'n', value: '0.025' });
    expect(numFmtOf(need.cells.get(`B${r3}`)!.style)).toBe('#,##0.000');
    expect(need.cells.get(`C${r3}`)!.value).toBe('KG');
  });

  it('una cifra oculta deja la celda numérica vacía y explica el estado; nunca un cero', () => {
    const { sheets } = read(buildJointPurchaseXlsx({ proposal: DRAFT, exportedAt: EXPORTED_AT }).bytes);
    const need = sheets.get('Necesidades')!;
    const r = rowOf(need, 'Insecticida sintético');
    expect(need.cells.has(`B${r}`)).toBe(false);
    expect(need.cells.has(`F${r}`)).toBe(false);
    expect(need.cells.has(`G${r}`)).toBe(false);
    expect(need.cells.get(`D${r}`)!.value).toBe('Oculto por privacidad');
    expect(need.cells.get(`E${r}`)!.value).toContain('la cifra no se publica para no revelar aportes individuales');
    // Un cero publicado sí es un cero.
    const zero = rowOf(need, 'Cero sintético');
    expect(need.cells.get(`B${zero}`)).toMatchObject({ type: 'n', value: '0' });
  });

  it('cada estado sin cifra se explica y no exporta el número aunque llegue por error', () => {
    const statuses = ['SUPPRESSED_REVISION', 'OVERFLOW', 'WITHDRAWN', 'SUPERSEDED', 'POLICY_PENDING', 'WITHDRAWN_AFTER_SEAL'] as const;
    const proposal = proposalWith(
      statuses.map((status, i) =>
        line({ position: i, product_name: `P-${status}`, status, quantity_base: '9000', quantity_presentation: '9', contributors: 9, data_as_of: '2026-11-01T00:00:00.000Z' }),
      ),
    );
    const need = read(buildJointPurchaseXlsx({ proposal, exportedAt: EXPORTED_AT }).bytes).sheets.get('Necesidades')!;
    for (const status of statuses) {
      const r = rowOf(need, `P-${status}`);
      expect(need.cells.has(`B${r}`), status).toBe(false);
      expect(need.cells.has(`F${r}`), status).toBe(false);
      expect(need.cells.get(`E${r}`)!.value!.length, status).toBeGreaterThan(20);
    }
  });

  it('una cifra incoherente o no válida del servidor no se exporta', () => {
    const proposal = proposalWith([
      line({ position: 0, product_name: 'Desajuste', quantity_base: '11500', quantity_presentation: '11.6' }),
      line({ position: 1, product_name: 'Negativo', quantity_base: '-1', quantity_presentation: null }),
      line({ position: 2, product_name: 'Sin base', quantity_base: null, quantity_presentation: '5' }),
      line({ position: 3, product_name: 'Unidad cruzada', base_unit: 'ML', presentation_unit: 'KG', quantity_base: '1000', quantity_presentation: '1' }),
    ]);
    const need = read(buildJointPurchaseXlsx({ proposal, exportedAt: EXPORTED_AT }).bytes).sheets.get('Necesidades')!;
    for (const name of ['Desajuste', 'Negativo', 'Sin base', 'Unidad cruzada']) {
      const r = rowOf(need, name);
      expect(need.cells.has(`B${r}`), name).toBe(false);
      expect(need.cells.get(`E${r}`)!.value, name).toBe('Dato no válido recibido del servidor; no se exporta.');
    }
  });

  it('una cifra que Excel redondearía queda vacía y se da exacta como texto', () => {
    const proposal = proposalWith([line({ product_name: 'Enorme', quantity_base: '9223372036854775807', quantity_presentation: '9223372036854775.807' })]);
    const need = read(buildJointPurchaseXlsx({ proposal, exportedAt: EXPORTED_AT }).bytes).sheets.get('Necesidades')!;
    const r = rowOf(need, 'Enorme');
    expect(need.cells.has(`B${r}`)).toBe(false);
    expect(need.cells.get(`E${r}`)!.value).toContain('9223372036854775.807 L');
  });

  it('encabezados con filtro, fila inmovilizada y anchos fijos', () => {
    const { files, sheets } = read(buildJointPurchaseXlsx({ proposal: DRAFT, exportedAt: EXPORTED_AT }).bytes);
    const doc = sheets.get('Necesidades')!.xml;
    expect(doc.getElementsByTagName('autoFilter')[0]!.getAttribute('ref')).toBe(`A${NEED_HEADER_ROW}:K${NEED_HEADER_ROW + DRAFT.lines.length}`);
    expect(doc.getElementsByTagName('pane')[0]!.getAttribute('ySplit')).toBe(String(NEED_HEADER_ROW));
    const widths = Array.from(doc.getElementsByTagName('col')).map((c) => Number(c.getAttribute('width')));
    expect(widths).toHaveLength(11);
    expect(Math.min(...widths)).toBeGreaterThanOrEqual(8);
    expect(files.get('xl/workbook.xml')).toContain(`'Necesidades'!$A$${NEED_HEADER_ROW}:$K$${NEED_HEADER_ROW + DRAFT.lines.length}`);
  });

  it('no hay fórmulas ni totales: los textos de usuario no se evalúan y las filas no se suman', () => {
    const proposal = proposalWith([
      line({ position: 0, product_name: '=HYPERLINK("http://x","clic")', quantity_base: '1000', quantity_presentation: '1' }),
      line({ position: 1, product_name: 'A & B <c>', quantity_base: '2000', quantity_presentation: '2' }),
    ]);
    const { files, sheets } = read(buildJointPurchaseXlsx({ proposal, exportedAt: EXPORTED_AT }).bytes);
    for (const [path, xml] of files) if (path.startsWith('xl/worksheets/')) expect(xml).not.toMatch(/<f[ >]/);
    const need = sheets.get('Necesidades')!;
    expect(need.cells.get(`A${rowOf(need, '=HYPERLINK("http://x","clic")')}`)!.type).toBe('inlineStr');
    expect(rowOf(need, 'A & B <c>')).toBeGreaterThan(NEED_HEADER_ROW);
    const all = [...need.cells.values()].map((c) => c.value ?? '');
    expect(all.some((v) => /total/i.test(v))).toBe(false);
    expect(all).not.toContain('3');
  });

  it('fechas como fechas de Excel en hora de Bolivia', () => {
    const { sheets, numFmtOf } = read(buildJointPurchaseXlsx({ proposal: DRAFT, exportedAt: EXPORTED_AT }).bytes);
    const need = sheets.get('Necesidades')!;
    const cell = need.cells.get(`G${rowOf(need, 'Fungicida sintético')}`)!;
    // 2026-11-03T23:54:25Z → 19:54:25 en Bolivia (UTC−4) → serie 46329.829456…
    expect(Number(cell.value)).toBeCloseTo(46329 + (19 * 3600 + 54 * 60 + 25) / 86400, 6);
    expect(numFmtOf(cell.style)).toBe('yyyy-mm-dd hh:mm');
    expect(need.cells.get(`G${NEED_HEADER_ROW}`)!.value).toBe('Datos hasta (hora de Bolivia, UTC−4)');
  });

  it('el modo provisional no añade ningún aviso; la política pendiente sí se explica', () => {
    const text = (p: Proposal) => [...read(buildJointPurchaseXlsx({ proposal: p, exportedAt: EXPORTED_AT }).bytes).sheets.get('Borrador')!.cells.values()].map((c) => c.value).join('\n');
    expect(text(DRAFT)).not.toMatch(/provisional|PROVISIONAL_SYNTHETIC/i);
    const pending = proposalWith([line({ status: 'POLICY_PENDING', product_name: 'X' })], {
      disclosure: { mode: 'POLICY_PENDING', policy: 'F07-POL-01', approved: false },
    });
    expect(text(pending)).toContain('La política de divulgación no está aprobada: no se exporta ninguna cifra.');
  });

  it('un borrador sin líneas lo dice, sin filas a cero', () => {
    const need = read(buildJointPurchaseXlsx({ proposal: proposalWith([]), exportedAt: EXPORTED_AT }).bytes).sheets.get('Necesidades')!;
    expect(need.cells.get(`A${NEED_HEADER_ROW + 1}`)!.value).toContain('Ausencia de declaración = desconocido, no cero.');
    expect([...need.cells.values()].some((c) => c.type === 'n')).toBe(false);
  });
});

// Columnas de «Consumo estimado»: A Producto, B Consumo estimado, C Unidad, D Estado, E Explicación, F Vigencia,
// G Motivo de la vigencia, H Alcance, I Campañas del tramo, J Aportantes mín., K máx., L Aportantes de la necesidad,
// M Comparable, N Motivo de no comparar, O Diferencia (del servidor), P Diferencia porcentual (del servidor), Q Nota,
// R Referencia del producto.
const REF_HEADER_ROW = 5;
const REF_SHEET = 'Consumo estimado';

/** Texto de las celdas de texto de una hoja (sin números ni fechas). */
function textOf(sheet: ReadSheet): string {
  return [...sheet.cells.values()]
    .filter((c) => c.type === 'inlineStr')
    .map((c) => c.value ?? '')
    .join('\n');
}

/** Celdas numéricas debajo de los encabezados (la fila 4 lleva la fecha de evaluación). */
function numbersBelowHeader(sheet: ReadSheet): string[] {
  return [...sheet.cells.entries()]
    .filter(([ref, c]) => c.type === 'n' && Number(/\d+$/.exec(ref)![0]) > REF_HEADER_ROW)
    .map(([ref]) => ref);
}

describe('hoja «Consumo estimado»: la referencia fijada en el borrador (E3)', () => {
  const linked = linkViewFor(DRAFT, [
    available('111000.000000', { scope: { span_campaigns: 11, contributors_min: 4, contributors_max: 6 } }),
    { state: 'INSUFFICIENT_DATA', status: 'INSUFFICIENT_DATA', reason_code: 'SPAN_TOO_SHORT', validity: 'NOT_USABLE', validity_reason: 'NO_FIGURE' },
    {
      state: 'OUTDATED',
      status: 'ESTIMATED',
      estimate_base: '0.292613',
      validity: 'OUTDATED',
      validity_reason: 'SOURCES_CHANGED',
      scope: { span_campaigns: 3, contributors_min: 5, contributors_max: 5 },
    },
    available('48000.500000'),
    { state: 'NO_RESULT' },
  ]);

  it('va en hoja aparte; la portada identifica el borrador y la versión, fecha y estado de la referencia fijada', () => {
    const book = buildJointPurchaseXlsx({ proposal: DRAFT, link: linked, exportedAt: EXPORTED_AT });
    expect(book.includesReference).toBe(true);
    expect(book.referenceState).toBe('LINKED');
    const { sheetNames, sheets, numFmtOf } = read(book.bytes);
    expect(sheetNames).toEqual(['Borrador', 'Necesidades', REF_SHEET, 'Historial de la referencia']);
    const cover = textOf(sheets.get('Borrador')!);
    expect(cover).toContain(DRAFT.proposal_ref);
    expect(cover).toContain('Referencia fijada');
    expect(cover).toContain('N.º 1: Obtener (ejecución existente fijada) por Directiva sintética');
    expect(cover).toContain(LINK_RUN_REF);
    expect(cover).toContain('SES_NAIVE 1.0.0');
    expect(cover).toContain('Referencia fijada el (hora de Bolivia, UTC−4)');
    expect(cover).toContain('No hay una actualización disponible.');

    const ref = sheets.get(REF_SHEET)!;
    expect(ref.cells.get('A2')!.value).toBe('Consumo estimado · referencia fijada N.º 1');
    expect(ref.cells.get('A4')!.value).toBe('Vigencia evaluada el');
    expect(numFmtOf(ref.cells.get('B4')!.style)).toBe('yyyy-mm-dd hh:mm');
    expect(ref.xml.getElementsByTagName('autoFilter')[0]!.getAttribute('ref')).toBe(`A${REF_HEADER_ROW}:R${REF_HEADER_ROW + DRAFT.lines.length}`);
    const r = rowOf(ref, 'Fungicida sintético');
    expect(ref.cells.get(`B${r}`)).toMatchObject({ type: 'n', value: '111' });
    expect(ref.cells.get(`C${r}`)!.value).toBe('L');
    expect(ref.cells.get(`D${r}`)!.value).toBe('Vigente');
    expect(ref.cells.get(`F${r}`)!.value).toBe('Vigente');
    expect(ref.cells.get(`R${r}`)!.value).toBe('p-Fungicida sintético');

    const history = sheets.get('Historial de la referencia')!;
    expect(textOf(history)).toContain('ejecución existente fijada');
    expect(textOf(history)).toContain('Sí');
  });

  it('la cifra es la fijada aunque haya una ejecución posterior: no se sustituye y la portada lo dice', () => {
    const newer = linkViewFor(DRAFT, [available('111000.000000')], { update: { available: true, reason: 'NEWER_RUN' } });
    const { sheets } = read(buildJointPurchaseXlsx({ proposal: DRAFT, link: newer, exportedAt: EXPORTED_AT }).bytes);
    const ref = sheets.get(REF_SHEET)!;
    expect(ref.cells.get(`B${rowOf(ref, 'Fungicida sintético')}`)).toMatchObject({ type: 'n', value: '111' });
    const cover = textOf(sheets.get('Borrador')!);
    expect(cover).toContain('Hay una ejecución calculada posterior a la fijada.');
    expect(cover).toContain('Este libro conserva la referencia fijada; no la sustituye.');
  });

  it('el alcance de cada cifra va en sus columnas; sin cifra no hay alcance de la estimación', () => {
    const ref = read(buildJointPurchaseXlsx({ proposal: DRAFT, link: linked, exportedAt: EXPORTED_AT }).bytes).sheets.get(REF_SHEET)!;
    const r = rowOf(ref, 'Fungicida sintético');
    expect(ref.cells.get(`H${r}`)!.value).toBe('Cifras de 4 a 6 agricultores por campaña (11 campañas)');
    expect(ref.cells.get(`I${r}`)).toMatchObject({ type: 'n', value: '11' });
    expect(ref.cells.get(`J${r}`)).toMatchObject({ type: 'n', value: '4' });
    expect(ref.cells.get(`K${r}`)).toMatchObject({ type: 'n', value: '6' });
    expect(ref.cells.get(`L${r}`)).toMatchObject({ type: 'n', value: '3' });
    const insufficient = rowOf(ref, 'Herbicida sintético');
    for (const col of ['B', 'H', 'I', 'J', 'K']) expect(ref.cells.has(`${col}${insufficient}`), col).toBe(false);
    expect(ref.cells.get(`D${insufficient}`)!.value).toBe('Datos insuficientes');
    expect(ref.cells.get(`E${insufficient}`)!.value).toBe('Datos insuficientes. Hay menos de tres campañas comparables consecutivas con consumo comprobado.');
    // Necesidad no divulgada: sin aportantes de la necesidad.
    expect(ref.cells.has(`L${rowOf(ref, 'Insecticida sintético')}`)).toBe(false);
  });

  it('desactualizada: la cifra fijada rotulada así, sin diferencia; sin resultado: celda vacía y motivo', () => {
    const ref = read(buildJointPurchaseXlsx({ proposal: DRAFT, link: linked, exportedAt: EXPORTED_AT }).bytes).sheets.get(REF_SHEET)!;
    const r = rowOf(ref, 'Adherente sintético');
    expect(ref.cells.get(`B${r}`)).toMatchObject({ type: 'n', value: '0.000292613' });
    expect(ref.cells.get(`C${r}`)!.value).toBe('KG');
    expect(ref.cells.get(`D${r}`)!.value).toBe('Desactualizada');
    expect(ref.cells.get(`E${r}`)!.value).toContain('No se compara con la necesidad.');
    expect(ref.cells.get(`M${r}`)!.value).toBe('No');
    expect(ref.cells.has(`O${r}`)).toBe(false);
    expect(ref.cells.has(`P${r}`)).toBe(false);
    const none = rowOf(ref, 'Cero sintético');
    expect(ref.cells.has(`B${none}`)).toBe(false);
    expect(ref.cells.get(`E${none}`)!.value).toBe('La ejecución fijada no incluye este producto y unidad.');
  });

  it('no comparable (hoy, siempre): ni diferencia ni porcentaje, aunque llegaran por error; sólo el motivo del servidor', () => {
    const withStray = linkViewFor(DRAFT, [
      available('111000.000000', {
        comparison: {
          comparable: false,
          blockers: ['POPULATION_NOT_VERIFIED'],
          message: BLOCKER_MESSAGE.POPULATION_NOT_VERIFIED,
          difference: {
            difference_base: '-58000.000000',
            difference_percent: '-52.2523',
            percent_undefined: null,
            direction: 'BELOW',
            observation: 'La necesidad declarada es inferior en 58 L.',
          },
        },
      }),
    ]);
    const ref = read(buildJointPurchaseXlsx({ proposal: DRAFT, link: withStray, exportedAt: EXPORTED_AT }).bytes).sheets.get(REF_SHEET)!;
    const r = rowOf(ref, 'Fungicida sintético');
    expect(ref.cells.get(`M${r}`)!.value).toBe('No');
    expect(ref.cells.get(`N${r}`)!.value).toBe(BLOCKER_MESSAGE.POPULATION_NOT_VERIFIED);
    expect(ref.cells.has(`O${r}`)).toBe(false);
    expect(ref.cells.has(`P${r}`)).toBe(false);
    // Ni la diferencia del servidor ni una propia (53 − 111 = −58; −52 %).
    expect(textOf(ref)).not.toMatch(/58|52[.,]2|%/);
  });

  it('desactualizada y comparable según el servidor: se conserva la cifra fijada, pero sin diferencia ni porcentaje; la portada la cuenta', () => {
    const outdatedComparable = linkViewFor(DRAFT, [
      {
        state: 'OUTDATED',
        status: 'ESTIMATED',
        estimate_base: '111000.000000',
        validity: 'OUTDATED',
        validity_reason: 'SOURCES_CHANGED',
        scope: { span_campaigns: 3, contributors_min: 5, contributors_max: 5 },
        comparison: comparableWith({
          difference_base: '-58000.000000',
          difference_percent: '-52.2523',
          direction: 'BELOW',
          observation: 'La necesidad declarada es inferior en 58 L a la estimación.',
        }),
      },
    ]);
    const book = read(buildJointPurchaseXlsx({ proposal: DRAFT, link: outdatedComparable, exportedAt: EXPORTED_AT }).bytes);
    const ref = book.sheets.get(REF_SHEET)!;
    const r = rowOf(ref, 'Fungicida sintético');
    expect(ref.cells.get(`B${r}`)).toMatchObject({ type: 'n', value: '111' });
    expect(ref.cells.get(`D${r}`)!.value).toBe('Desactualizada');
    expect(ref.cells.get(`G${r}`)!.value).toBeTruthy();
    expect(ref.cells.get(`M${r}`)!.value).toBe('No');
    expect(ref.cells.get(`N${r}`)!.value).toBe('Desactualizada: se conserva la cifra de la referencia fijada, pero no se compara con la necesidad.');
    expect(ref.cells.has(`O${r}`)).toBe(false);
    expect(ref.cells.has(`P${r}`)).toBe(false);
    expect(textOf(ref)).not.toMatch(/58 L|52[.,]2|%/);
    const cover = textOf(book.sheets.get('Borrador')!);
    expect(cover).toContain('1 línea con la cifra de la referencia fijada rotulada «Desactualizada»');
    expect(cover).toContain('Referencia del borrador');
    expect(cover).toContain('Versión de la referencia');
  });

  it('comparable según el servidor: copia su observación y su porcentaje, sin calcular nada', () => {
    const comparable = linkViewFor(DRAFT, [
      available('111000.000000', {
        comparison: comparableWith({
          difference_base: '-58000.000000',
          difference_percent: '-52.2523',
          direction: 'BELOW',
          observation: 'La necesidad declarada es inferior en 58 L a la estimación.',
        }),
      }),
    ]);
    const ref = read(buildJointPurchaseXlsx({ proposal: DRAFT, link: comparable, exportedAt: EXPORTED_AT }).bytes).sheets.get(REF_SHEET)!;
    const r = rowOf(ref, 'Fungicida sintético');
    expect(ref.cells.get(`M${r}`)!.value).toBe('Sí');
    expect(ref.cells.has(`N${r}`)).toBe(false);
    expect(ref.cells.get(`O${r}`)!.value).toBe('La necesidad declarada es inferior en 58 L a la estimación.');
    expect(ref.cells.get(`P${r}`)!.value).toBe('-52,2523 %');
  });

  it('una cifra restringida o retirada no aparece, aunque llegara por error', () => {
    const withdrawn = linkViewFor(DRAFT, [
      {
        state: 'RESTRICTED',
        status: 'ESTIMATED',
        estimate_base: '111000.000000',
        validity: 'NOT_USABLE',
        validity_reason: 'SOURCES_WITHDRAWN',
        scope: { span_campaigns: 2, contributors_min: 7, contributors_max: 9 },
      },
    ]);
    const a = read(buildJointPurchaseXlsx({ proposal: DRAFT, link: withdrawn, exportedAt: EXPORTED_AT }).bytes).sheets.get(REF_SHEET)!;
    const r = rowOf(a, 'Fungicida sintético');
    expect(a.cells.has(`B${r}`)).toBe(false);
    expect(a.cells.get(`D${r}`)!.value).toBe('Restringida');
    expect(a.cells.get(`E${r}`)!.value).toContain('No se exporta la cifra.');
    expect(textOf(a)).not.toMatch(/\b111\b|111000/);

    // La referencia entera restringida (política pendiente): ninguna cifra, alcance ni diferencia, aunque las líneas trajeran una.
    const restricted = linkViewFor(
      DRAFT,
      [
        available('111000.000000', {
          scope: { span_campaigns: 11, contributors_min: 4, contributors_max: 6 },
          comparison: comparableWith({ observation: 'Coincide.' }),
        }),
      ],
      { state: 'RESTRICTED' },
    );
    const book = buildJointPurchaseXlsx({ proposal: DRAFT, link: restricted, exportedAt: EXPORTED_AT });
    expect(book.referenceState).toBe('RESTRICTED');
    const { sheets } = read(book.bytes);
    const b = sheets.get(REF_SHEET)!;
    // Sólo quedan números de aportantes de la necesidad (L), nunca de la estimación.
    expect(numbersBelowHeader(b).every((ref) => ref.startsWith('L'))).toBe(true);
    expect(textOf(b)).not.toMatch(/111|Coincide|Cifras de/);
    expect(b.cells.get(`D${rowOf(b, 'Fungicida sintético')}`)!.value).toBe('Restringida');
    expect(textOf(sheets.get('Borrador')!)).toContain('Se conserva el vínculo (ejecución, fecha y método) pero no se exporta ninguna cifra.');
  });

  it('con la necesidad oculta, la estimación se rotula aparte y la necesidad sigue vacía', () => {
    const { sheets } = read(buildJointPurchaseXlsx({ proposal: DRAFT, link: linked, exportedAt: EXPORTED_AT }).bytes);
    const ref = sheets.get(REF_SHEET)!;
    const r = rowOf(ref, 'Insecticida sintético');
    expect(ref.cells.get(`B${r}`)).toMatchObject({ type: 'n', value: '48.0005' });
    expect(ref.cells.get(`Q${r}`)!.value).toContain('no la sustituye ni se suma a la propuesta');
    const need = sheets.get('Necesidades')!;
    expect(need.cells.has(`B${rowOf(need, 'Insecticida sintético')}`)).toBe(false);
    expect(ref.cells.has(`Q${rowOf(ref, 'Fungicida sintético')}`)).toBe(false);
  });

  it('la referencia no cambia la hoja de necesidades', () => {
    const without = read(buildJointPurchaseXlsx({ proposal: DRAFT, exportedAt: EXPORTED_AT }).bytes);
    const withRef = read(buildJointPurchaseXlsx({ proposal: DRAFT, link: linked, exportedAt: EXPORTED_AT }).bytes);
    expect(withRef.files.get('xl/worksheets/sheet2.xml')).toBe(without.files.get('xl/worksheets/sheet2.xml'));
  });

  it('sin referencia fijada: ninguna estimación (tampoco la más reciente) y la portada lo dice', () => {
    const none = linkViewFor(DRAFT, [], { state: 'NONE', prepare_blocker: 'TARGET_CAMPAIGN_NOT_CLASSIFIED' });
    const book = buildJointPurchaseXlsx({ proposal: DRAFT, link: none, exportedAt: EXPORTED_AT });
    expect(book.includesReference).toBe(false);
    expect(book.referenceState).toBe('NONE');
    const { sheetNames, sheets } = read(book.bytes);
    expect(sheetNames).toEqual(['Borrador', 'Necesidades']);
    const cover = textOf(sheets.get('Borrador')!);
    expect(cover).toContain(
      'Este borrador no tiene una referencia de consumo estimado fijada: el libro no incluye ninguna estimación (no se usa la más reciente en su lugar).',
    );
    expect(cover).toContain('la campaña no está clasificada en una temporada');
    expect(cover).toContain('Sin referencia fijada');
  });

  it('calculando: hoja con el estado de cada línea y ninguna cifra', () => {
    const calculating = linkViewFor(DRAFT, [], {
      state: 'CALCULATING',
      link: linkOf({ action: 'REQUEST_JOB', run_ref: null, job_ref: 'job-1', job_status: 'RUNNING' }),
    });
    const { sheets } = read(buildJointPurchaseXlsx({ proposal: DRAFT, link: calculating, exportedAt: EXPORTED_AT }).bytes);
    const ref = sheets.get(REF_SHEET)!;
    expect(ref.cells.get(`D${rowOf(ref, 'Fungicida sintético')}`)!.value).toBe('Calculando');
    expect(numbersBelowHeader(ref).every((cellRef) => cellRef.startsWith('L'))).toBe(true);
    expect(textOf(sheets.get('Borrador')!)).toContain('Calculando: la referencia fijada todavía no tiene cifras (procesándose).');
  });

  it('sin respuesta de la referencia o de otro borrador: no se incluye y se explica', () => {
    const missing = buildJointPurchaseXlsx({ proposal: DRAFT, link: null, exportedAt: EXPORTED_AT });
    expect(missing.includesReference).toBe(false);
    expect(missing.referenceState).toBeNull();
    expect(textOf(read(missing.bytes).sheets.get('Borrador')!)).toContain(
      'No incluida: la referencia fijada no se pudo consultar al exportar. No se usa ninguna otra estimación en su lugar.',
    );

    const other = { ...linked, proposal_ref: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' };
    const book = buildJointPurchaseXlsx({ proposal: DRAFT, link: other, exportedAt: EXPORTED_AT });
    expect(book.includesReference).toBe(false);
    const { sheetNames, sheets } = read(book.bytes);
    expect(sheetNames).toEqual(['Borrador', 'Necesidades']);
    expect(textOf(sheets.get('Borrador')!)).toContain('No incluida: la referencia consultada no corresponde a este borrador.');
  });

  it('una línea de la referencia de otro producto no se usa', () => {
    const shifted = { ...linked, lines: linked.lines.map((l) => ({ ...l, product: { ...l.product, product_ref: `${l.product.product_ref}-otro` } })) };
    const ref = read(buildJointPurchaseXlsx({ proposal: DRAFT, link: shifted, exportedAt: EXPORTED_AT }).bytes).sheets.get(REF_SHEET)!;
    for (const name of ['Fungicida sintético', 'Adherente sintético']) {
      const r = rowOf(ref, name);
      expect(ref.cells.has(`B${r}`), name).toBe(false);
      expect(ref.cells.get(`E${r}`)!.value, name).toBe('Sin referencia para esta fila.');
    }
  });
});

describe('escritor xlsx', () => {
  it('CRC-32 conocido y ZIP válido', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    const bytes = buildXlsx([{ name: 'Hoja', widths: [10], rows: [[{ kind: 'text', value: 'ñandú' }]] }], { title: 't', created: EXPORTED_AT });
    const files = unzip(bytes);
    expect([...files.keys()]).toContain('[Content_Types].xml');
    expect(files.get('xl/worksheets/sheet1.xml')).toContain('ñandú');
  });

  it('mismas entradas, mismos bytes', () => {
    const a = buildJointPurchaseXlsx({ proposal: DRAFT, exportedAt: EXPORTED_AT }).bytes;
    const b = buildJointPurchaseXlsx({ proposal: DRAFT, exportedAt: EXPORTED_AT }).bytes;
    expect(a).toEqual(b);
  });

  it('rechaza cifras dudosas y nombres de hoja no válidos', () => {
    expect(fitsExcelPrecision('123456789012345')).toBe(true);
    expect(fitsExcelPrecision('1234567890123456')).toBe(false);
    expect(fitsExcelPrecision('0.000292613')).toBe(true);
    for (const bad of ['1e3', '-1', ' 1', '1,5', 'NaN', '']) expect(fitsExcelPrecision(bad), bad).toBe(false);
    expect(() => buildXlsx([{ name: 'a', widths: [], rows: [[{ kind: 'number', value: '1e3', decimals: 0 }]] }], { title: 't', created: EXPORTED_AT })).toThrow();
    expect(() => buildXlsx([{ name: 'a/b', widths: [], rows: [] }], { title: 't', created: EXPORTED_AT })).toThrow();
    expect(columnName(0)).toBe('A');
    expect(columnName(25)).toBe('Z');
    expect(columnName(26)).toBe('AA');
  });
});
