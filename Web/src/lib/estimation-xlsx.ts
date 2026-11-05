/**
 * Exportador de «Estimación del consumo» a Excel: la consulta institucional tal
 * como la entregó `GET /estimation/results` más el detalle de cada ejecución
 * (`GET /estimation/runs/{id}`) ya cargado por la pantalla. Hojas: portada
 * «Estimación» (campaña objetivo, temporada, vigencia evaluada), «Resultados»
 * (estimación, línea base, vigencia y método por producto) y «Serie observada»
 * (los consumos publicados de las campañas anteriores, con su clase y cobertura).
 * Nada se recalcula: SES, línea base y α son los del servidor.
 */
import { REASON_TEXT, RESULT_STATUS_TEXT, VALIDITY_REASON_TEXT, VALIDITY_TEXT, formatAlpha } from './estimation-text';
import { decimalToPresentation, toPresentation } from './quantity';
import { BOLIVIA_OFFSET, campaignStatusText, coverSheet, dataSheet, dateCell, figure, fileSlug, saveXlsx, text, zoneLabel } from './xlsx-common';
import { buildXlsx, type XlsxCell } from './xlsx-writer';
import type { InstitutionalResult, InstitutionalResults, ResultDetail, Run, SeriesPoint } from '../types/estimation';
import type { BuiltXlsx } from './collective-summary-xlsx';

export interface EstimationXlsxInput {
  results: InstitutionalResults;
  /** Detalle de las ejecuciones citadas en los resultados, por `run_ref`. */
  details: Record<string, Run>;
  exportedAt?: Date;
  utcOffsetMinutes?: number;
}

const KIND_TEXT: Record<SeriesPoint['kind'], string> = {
  VERIFIED_CONSUMPTION: 'Consumo comprobado',
  NO_RECORD: 'Sin registro',
  HIDDEN: 'Oculto',
};
const EXCLUSION_TEXT: Record<NonNullable<SeriesPoint['exclusion_reason']>, string> = {
  NO_RECORD: 'sin registro',
  HIDDEN: 'oculto por la política',
  BEFORE_GAP: 'antes de un hueco',
  NOT_BEFORE_TARGET: 'no es anterior al objetivo',
};

function detailOf(details: Record<string, Run>, result: InstitutionalResult): ResultDetail | null {
  return details[result.run_ref]?.results.find((r) => r.product.product_ref === result.product.product_ref && r.base_unit === result.base_unit) ?? null;
}

/** La estimación o la línea base: sólo con estado ESTIMATED y cifra válida. */
function estimateCell(status: InstitutionalResult['status'], value: string | null, unit: 'L' | 'KG', validityReason: string | null): { cell: XlsxCell; note: string | null } {
  if (status !== 'ESTIMATED') return { cell: null, note: null };
  if (value === null) return { cell: null, note: validityReason === 'SOURCES_WITHDRAWN' ? 'Cifra retirada: ya no se divulga.' : 'Sin cifra.' };
  return figure(decimalToPresentation(value), unit);
}

export function estimationXlsxFileName(results: InstitutionalResults): string {
  return `estimacion-${fileSlug(results.target.name)}.xlsx`;
}

export function buildEstimationXlsx(input: EstimationXlsxInput): BuiltXlsx {
  const { results, details } = input;
  const exportedAt = input.exportedAt ?? new Date();
  const offset = input.utcOffsetMinutes ?? BOLIVIA_OFFSET;
  const zone = zoneLabel(offset);
  const estimated = results.results.filter((r) => r.status === 'ESTIMATED').length;

  const cover = coverSheet({
    name: 'Estimación',
    title: `Estimación del consumo · ${results.target.name}`,
    subtitle: 'Referencia de consumo para una campaña comparable, calculada en el servidor (SES frente a la línea base). No es una necesidad declarada ni una propuesta: no se suma a ellas.',
    fields: [
      { label: 'Campaña objetivo', value: text(results.target.name, 'strong') },
      { label: 'Estado de la campaña', value: text(campaignStatusText(results.target.status)) },
      { label: 'Temporada', value: text(results.season ? `${results.season.key}: ${results.season.definition}` : 'La campaña no está clasificada en una temporada.', 'wrap') },
      { label: `Vigencia evaluada el (${zone})`, value: dateCell(results.evaluated_at, offset) },
      { label: 'Resultados', value: text(`${results.results.length} productos: ${estimated} estimados, ${results.results.length - estimated} sin cifra (datos insuficientes u otro motivo).`, 'wrap') },
      { label: 'Aviso del servidor', value: text(results.notice, 'wrap') },
      { label: `Exportado el (${zone})`, value: dateCell(exportedAt.toISOString(), offset) },
    ],
    howToRead: [
      '«Estimación» es la cifra SES y «Línea base» el último consumo publicado de la serie; ambas vienen del servidor.',
      'Una celda vacía significa que no hay cifra (datos insuficientes, retirada o no publicada), no cero; «Estado» y «Motivo» dicen por qué.',
    ],
  });

  const resultHeaders = [
    'Producto',
    'Estimación',
    'Línea base',
    'Unidad',
    'Estado',
    'Motivo',
    'Vigencia',
    'Motivo de la vigencia',
    'α',
    'Campañas observadas',
    `Ejecución del (${zone})`,
    'Ejecución (referencia)',
  ];
  const resultRows = results.results.map((result): XlsxCell[] => {
    const detail = detailOf(details, result);
    const estimate = estimateCell(result.status, result.estimate_base, result.presentation_unit, result.validity_reason);
    const naive = estimateCell(result.status, result.naive_base, result.presentation_unit, result.validity_reason);
    const reason = [result.reason_code ? REASON_TEXT[result.reason_code] : null, estimate.note].filter(Boolean).join(' ');
    const alpha = detail?.alpha ? formatAlpha(detail.alpha) : null;
    const observed = detail?.span ? `${detail.span.length}` : null;
    return [
      text(result.product.name, 'strong'),
      estimate.cell,
      naive.cell,
      text(result.presentation_unit),
      text(RESULT_STATUS_TEXT[result.status] ?? result.status, result.status === 'ESTIMATED' ? 'ok' : 'warn'),
      text(reason || (result.status === 'ESTIMATED' ? 'Estimado.' : 'Sin cifra.'), 'wrap'),
      text(VALIDITY_TEXT[result.validity] ?? result.validity, result.validity === 'CURRENT' ? 'ok' : 'warn'),
      result.validity_reason ? text(VALIDITY_REASON_TEXT[result.validity_reason] ?? result.validity_reason, 'wrap') : null,
      alpha ? text(alpha) : null,
      observed ? text(observed) : null,
      dateCell(result.generated_at, offset),
      text(result.run_ref, 'muted'),
    ];
  });

  const seriesHeaders = ['Producto', 'Campaña', 'Consumo publicado', 'Unidad', 'Clase', 'En el tramo', 'Cobertura'];
  const seriesRows = results.results.flatMap((result) => {
    const detail = detailOf(details, result);
    if (!detail) return [];
    return detail.points.map((point): XlsxCell[] => {
      const shown = point.kind === 'VERIFIED_CONSUMPTION' && point.quantity_base !== null ? figure(toPresentation(point.quantity_base), result.presentation_unit, false) : { cell: null, note: null };
      const coverage = point.coverage.status === 'IDENTIFIED' ? `${point.coverage.members_in_published_figures} de ${point.coverage.linked_members}` : 'Desconocida';
      return [
        text(result.product.name, 'strong'),
        text(point.campaign.name),
        shown.cell,
        text(result.presentation_unit),
        text(KIND_TEXT[point.kind], point.kind === 'VERIFIED_CONSUMPTION' ? 'ok' : 'warn'),
        text(point.in_span ? 'Sí' : point.exclusion_reason ? `No: ${EXCLUSION_TEXT[point.exclusion_reason]}` : 'No'),
        text(coverage),
      ];
    });
  });

  const sheets = [
    cover,
    dataSheet({
      name: 'Resultados',
      title: `Resultados · ${results.target.name}`,
      note: 'Estimación (SES) y línea base (último consumo publicado) por producto, con su vigencia. Sin cifra = no hay estimación, no cero.',
      headers: resultHeaders,
      widths: [30, 14, 14, 8, 20, 56, 16, 44, 8, 12, 20, 38],
      rows: resultRows,
      emptyText: 'Todavía no hay ninguna estimación para esta campaña. No se muestra ninguna cifra.',
    }),
    dataSheet({
      name: 'Serie observada',
      title: 'Consumos publicados de las campañas anteriores',
      note: 'Los puntos que vio el servidor al estimar, en orden. «Oculto» y «Sin registro» no son ceros. La cobertura mide participación, no integridad.',
      headers: seriesHeaders,
      widths: [30, 26, 18, 8, 22, 30, 16],
      rows: seriesRows,
      emptyText: 'Sin serie observada: no hay ejecuciones con detalle.',
      tabColor: '0EA5E9',
    }),
  ];
  return {
    bytes: buildXlsx(sheets, { title: `Estimación del consumo · ${results.target.name}`, created: exportedAt }),
    fileName: estimationXlsxFileName(results),
  };
}

export function downloadEstimationXlsx(input: EstimationXlsxInput): BuiltXlsx {
  const book = buildEstimationXlsx(input);
  saveXlsx(book.bytes, book.fileName);
  return book;
}
