/**
 * Piezas comunes de los libros Excel de la Directiva (defensa, 2026-11-05):
 * celdas con la identidad de Agrocuentas, portada con banda, título y ficha de
 * datos, cabecera de cada hoja de datos y conversión de cifras y fechas.
 *
 * Reglas compartidas por todos los exportadores:
 * - Sólo se escribe una cifra si el servidor la publicó y es válida; si está
 *   oculta, falta o es dudosa, la celda numérica queda vacía y una columna de
 *   explicación dice por qué. Una ausencia nunca se escribe como 0.
 * - No se recalcula nada ni se suman filas: cada una conserva su unidad.
 * - Los textos van como texto en línea: nada se evalúa como fórmula.
 */
import { CAMPAIGN_STATUS_TEXT, statusReason } from './collective-text';
import { presentationUnit, toPresentation } from './quantity';
import { buildXlsx, columnName, fitsExcelPrecision, type XlsxCell, type XlsxSheet, type XlsxStyle } from './xlsx-writer';
import type { AnyStatus, Coverage, SealRef } from '../types/collective';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const BRAND = 'AGROCUENTAS · PANEL DE LA DIRECTIVA';
/** Desfase por defecto: Bolivia, UTC−4, sin horario de verano. */
export const BOLIVIA_OFFSET = -240;

export const INVALID_FIGURE_TEXT = 'Dato no válido recibido del servidor; no se exporta.';
export const PENDING_CHANGES_TEXT = 'Hay cambios recibidos que aún no alcanzan el umbral: se muestra la cifra anterior.';

/** Mismos rótulos que el distintivo de estado de la pantalla (`collective-ui.tsx`). */
export const STATUS_LABEL: Record<AnyStatus, string> = {
  DISCLOSED: 'Publicado',
  SUPPRESSED_UNDER_THRESHOLD: 'Oculto por privacidad',
  SUPPRESSED_REVISION: 'Sin cifra publicada',
  OVERFLOW: 'Fuera de rango',
  WITHDRAWN: 'Retirado',
  SUPERSEDED: 'Sustituido',
  POLICY_PENDING: 'Política pendiente',
  WITHDRAWN_AFTER_SEAL: 'Retirado tras sellar',
  NO_DATA: 'Sin cifra publicada',
  NOT_SEALED: 'Sin sellar',
};

export function text(value: string, style?: XlsxStyle): XlsxCell {
  return { kind: 'text', value, style };
}

/** Celda de estado: verde si está publicado, ámbar en cualquier otro caso. */
export function statusCell(status: AnyStatus): XlsxCell {
  return text(STATUS_LABEL[status] ?? status, status === 'DISCLOSED' ? 'ok' : 'warn');
}

/** Un dato sí/no del servidor, como texto filtrable. */
export function yesNoCell(value: boolean | null | undefined): XlsxCell {
  return value === null || value === undefined ? null : text(value ? 'Sí' : 'No');
}

/** Un identificador del servidor (producto, campaña, versión sellada…), en gris: sirve para cruzar datos, no para leer. */
export function refCell(value: string | null | undefined): XlsxCell {
  return value ? text(value, 'muted') : null;
}

export function integerCell(value: number | null): XlsxCell {
  return value !== null && Number.isSafeInteger(value) && value >= 0 ? { kind: 'number', value: String(value), decimals: 0, style: 'integer' } : null;
}

/** `"11.5"` → 1 decimal; `"250"` → 0. */
export function decimalsOf(value: string): number {
  return value.split('.')[1]?.length ?? 0;
}

/** Una cifra exacta lista para Excel (destacada), o el motivo por el que no se escribe. */
export function figure(value: string | null, unit: string, emphasis = true): { cell: XlsxCell; note: string | null } {
  if (value === null) return { cell: null, note: INVALID_FIGURE_TEXT };
  if (!fitsExcelPrecision(value)) {
    // Excel la redondearía: se deja la celda vacía y el valor exacto como texto.
    return { cell: null, note: `Cifra de más de 15 dígitos: Excel la redondearía. Valor exacto: ${value} ${unit}.` };
  }
  return { cell: { kind: 'number', value, decimals: decimalsOf(value), style: emphasis ? 'emphasis' : 'number' }, note: null };
}

/**
 * Cantidad publicada de una celda del servidor (necesidad, consumo o punto de
 * tendencia): sólo si el estado es DISCLOSED y la presentación es coherente
 * con la base, como hace `formatQuantity` en pantalla.
 */
export function publishedQuantity(input: {
  status: AnyStatus;
  base: string | null;
  presentation: string | null;
  baseUnit: 'ML' | 'G';
  presentationUnit: 'L' | 'KG';
  pending?: boolean;
  threshold?: number | null;
}): { cell: XlsxCell; explanation: string } {
  if (input.status !== 'DISCLOSED') {
    // Aunque llegara un número por error en una celda no publicada, no se exporta.
    return { cell: null, explanation: statusReason(input.status, input.threshold) ?? `Sin cifra (${STATUS_LABEL[input.status] ?? input.status}).` };
  }
  const computed = input.base === null ? null : toPresentation(input.base);
  const coherent =
    computed !== null && (input.presentation === null || input.presentation === computed) && presentationUnit(input.baseUnit) === input.presentationUnit;
  const { cell, note } = figure(coherent ? computed : null, input.presentationUnit);
  const notes = [note, input.pending ? PENDING_CHANGES_TEXT : null].filter(Boolean);
  return { cell, explanation: notes.length ? notes.join(' ') : 'Cifra publicada.' };
}

export function dateCell(iso: string | null | undefined, offsetMinutes: number): XlsxCell {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  // Días desde 1899-12-30, en hora local fija; redondeado al segundo para un XML estable.
  const seconds = Math.round(ms / 1000) + offsetMinutes * 60;
  return { kind: 'date', serial: Number((seconds / 86400 + 25569).toFixed(8)) };
}

export function offsetLabel(minutes: number): string {
  const sign = minutes < 0 ? '−' : '+';
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
}

export function zoneLabel(offset: number): string {
  return offset === BOLIVIA_OFFSET ? 'hora de Bolivia, UTC−4' : `hora local, ${offsetLabel(offset)}`;
}

export function campaignStatusText(status: string): string {
  return CAMPAIGN_STATUS_TEXT[status] ?? status;
}

export function coverageText(coverage: Coverage | null, when: 'now' | 'draft' | 'sealed'): string {
  if (!coverage) return 'Sin dato de cobertura.';
  const who = coverage.basis === 'ALL_CONTRIBUTORS' ? 'agricultores vinculados habían aportado datos' : 'agricultores vinculados con cifras publicadas';
  const suffix = when === 'draft' ? ' al generar el borrador' : when === 'sealed' ? ' al sellar' : '';
  const extra = coverage.suppressed_cells ? ' Hay filas sin cifra cuyos aportes no se cuentan.' : '';
  return `${coverage.members_with_contribution} de ${coverage.linked_members} ${who}${suffix}.${extra} Ausencia de aporte = desconocido, no cero.`;
}

export function sealText(seal: SealRef | null): string {
  return seal ? `Versión ${seal.version}, sellada por ${seal.sealed_by.name}.` : 'Sin versión sellada.';
}

/** Nombre de archivo seguro a partir de un rótulo. */
export function fileSlug(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

export interface CoverField {
  label: string;
  value: XlsxCell;
}

/**
 * Portada: banda de marca, título grande, subtítulo, ficha de datos y «cómo
 * leer este libro» con los dos colores de estado como leyenda.
 */
export function coverSheet(input: {
  name: string;
  title: string;
  subtitle: string;
  fields: CoverField[];
  howToRead: string[];
  tabColor?: string;
}): XlsxSheet {
  const rows: XlsxCell[][] = [
    [text(BRAND, 'band'), text('', 'band')],
    [text(input.title, 'title')],
    [text(input.subtitle, 'subtitle')],
    [],
    ...input.fields.map((field): XlsxCell[] => [text(field.label, 'label'), field.value]),
    [],
    [text('Cómo leer este libro', 'label'), text(input.howToRead.join(' '), 'wrap')],
    [text('Leyenda', 'label'), text('Publicado', 'ok')],
    [null, text('Oculto por privacidad · Sin cifra publicada · Datos insuficientes: la celda numérica queda vacía y la explicación dice por qué.', 'warn')],
  ];
  return {
    name: input.name,
    widths: [34, 110],
    rows,
    merges: ['A1:B1', 'A2:B2', 'A3:B3'],
    rowHeights: { 1: 30, 2: 34, 3: 20 },
    hideGridLines: true,
    tabColor: input.tabColor ?? '0F1D15',
  };
}

/**
 * Hoja de datos: banda, título, nota y la tabla con encabezados filtrables e
 * inmovilizados. `rows` son sólo las filas de datos.
 */
export function dataSheet(input: {
  name: string;
  title: string;
  note: string;
  headers: string[];
  widths: number[];
  rows: XlsxCell[][];
  emptyText: string;
  tabColor?: string;
}): XlsxSheet {
  const last = columnName(input.headers.length - 1);
  const top: XlsxCell[][] = [
    [text(BRAND, 'band'), ...input.headers.slice(1).map(() => text('', 'band'))],
    [text(input.title, 'title')],
    [text(input.note, 'note')],
    [],
  ];
  const headerRow = top.length + 1;
  const body = input.rows.length ? input.rows : [[text(input.emptyText, 'note')]];
  return {
    name: input.name,
    widths: input.widths,
    rows: [...top, input.headers.map((h) => text(h, 'header')), ...body],
    freezeRows: headerRow,
    filter: { headerRow, lastRow: headerRow + input.rows.length, columns: input.headers.length },
    merges: [`A1:${last}1`, `A2:${last}2`],
    rowHeights: { 1: 26, 2: 30, [headerRow]: 30 },
    tabColor: input.tabColor ?? '047857',
    landscape: true,
  };
}

/** Descarga el libro en el navegador; revoca la URL después del clic. */
export function saveXlsx(bytes: Uint8Array, fileName: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: XLSX_MIME }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revocar después: algunos navegadores leen el blob tras el clic.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export { buildXlsx };
