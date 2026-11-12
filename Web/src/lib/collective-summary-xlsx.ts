/**
 * Exportador del «Resumen colectivo» a Excel: la campaña tal como la entregó
 * `GET /collective/campaigns/{id}/summary`. Hojas: portada «Resumen» (campaña,
 * versión sellada, cobertura y conteos), «Necesidad declarada» y «Consumo
 * publicado». Mismas reglas que la pantalla: sólo cifras publicadas, ninguna
 * ausencia como cero, sin sumas entre productos ni unidades.
 *
 * Es la única exportación del resumen (el CSV del servidor se retiró el
 * 2026-11-12): cada columna de aquel CSV tiene su lugar en el libro (portada o
 * columnas filtrables de cada hoja; tabla en
 * `docs/architecture/WEB_EXCEL_UNICO_2026-11-12.md`).
 */
import {
  BOLIVIA_OFFSET,
  campaignStatusText,
  coverSheet,
  coverageText,
  dataSheet,
  dateCell,
  fileSlug,
  integerCell,
  publishedQuantity,
  refCell,
  saveXlsx,
  sealText,
  statusCell,
  text,
  yesNoCell,
  zoneLabel,
} from './xlsx-common';
import { buildXlsx, type XlsxCell } from './xlsx-writer';
import type { CollectiveSummary, SummaryCell } from '../types/collective';

export interface SummaryXlsxInput {
  summary: CollectiveSummary;
  exportedAt?: Date;
  utcOffsetMinutes?: number;
}

export interface BuiltXlsx {
  bytes: Uint8Array;
  fileName: string;
}

function counts(cells: SummaryCell[]): string {
  const published = cells.filter((cell) => cell.status === 'DISCLOSED').length;
  const privacy = cells.filter((cell) => cell.status === 'SUPPRESSED_UNDER_THRESHOLD').length;
  const other = cells.length - published - privacy;
  return `${published} con cifra publicada · ${privacy} ${privacy === 1 ? 'oculto' : 'ocultos'} por privacidad · ${other} sin cifra publicada`;
}

function rowsOf(cells: SummaryCell[], threshold: number | null, offset: number): XlsxCell[][] {
  return cells.map((cell) => {
    const quantity = publishedQuantity({
      status: cell.status,
      base: cell.total_base,
      presentation: cell.total_presentation,
      baseUnit: cell.base_unit,
      presentationUnit: cell.presentation_unit,
      pending: cell.pending_changes,
      threshold,
    });
    const disclosed = cell.status === 'DISCLOSED';
    return [
      text(cell.product_name, 'strong'),
      quantity.cell,
      text(cell.presentation_unit),
      statusCell(cell.status),
      text(quantity.explanation, 'wrap'),
      disclosed ? integerCell(cell.contributors) : null,
      disclosed ? dateCell(cell.data_as_of, offset) : null,
      yesNoCell(cell.pending_changes),
      disclosed ? dateCell(cell.released_at, offset) : null,
      refCell(cell.product_ref),
    ];
  });
}

export function summaryXlsxFileName(summary: CollectiveSummary): string {
  return `resumen-${fileSlug(summary.campaign.name)}.xlsx`;
}

export function buildSummaryXlsx(input: SummaryXlsxInput): BuiltXlsx {
  const { summary } = input;
  const exportedAt = input.exportedAt ?? new Date();
  const offset = input.utcOffsetMinutes ?? BOLIVIA_OFFSET;
  const zone = zoneLabel(offset);
  const pending = summary.disclosure.mode === 'POLICY_PENDING';
  const needs = summary.cells.filter((cell) => cell.projection_type === 'DECLARED_NEED');
  const consumption = summary.cells.filter((cell) => cell.projection_type === 'CONSUMPTION_TOTAL');
  const headers = [
    'Producto',
    'Cantidad',
    'Unidad',
    'Estado',
    'Explicación',
    'Aportantes',
    `Datos hasta (${zone})`,
    'Cambios pendientes',
    `Publicado el (${zone})`,
    'Referencia del producto',
  ];
  const widths = [30, 14, 8, 22, 64, 12, 20, 12, 20, 38];

  const cover = coverSheet({
    name: 'Resumen',
    title: `Resumen colectivo · ${summary.campaign.name}`,
    subtitle: 'Cifras publicadas por el servidor según la política de divulgación F07-POL-01. Necesidad declarada y consumo publicado son datos distintos: no se restan ni se comparan.',
    fields: [
      { label: 'Campaña', value: text(summary.campaign.name, 'strong') },
      { label: 'Referencia de la campaña', value: refCell(summary.campaign.campaign_ref) },
      { label: 'Estado de la campaña', value: text(campaignStatusText(summary.campaign.status)) },
      { label: 'Versión', value: text(summary.seal ? sealText(summary.seal) : 'Sin sellar: cifras vigentes al exportar.', 'wrap') },
      ...(summary.seal
        ? [
            { label: `Sellada el (${zone})`, value: dateCell(summary.seal.sealed_at, offset) },
            { label: 'Referencia de la versión sellada', value: refCell(summary.seal.seal_ref) },
          ]
        : []),
      { label: summary.seal ? 'Cobertura al sellar' : 'Cobertura', value: text(coverageText(summary.coverage, summary.seal ? 'sealed' : 'now'), 'wrap') },
      { label: 'Necesidad declarada', value: text(pending ? 'Sin cifras: política pendiente.' : `${needs.length} productos: ${counts(needs)}.`, 'wrap') },
      { label: 'Consumo publicado', value: text(pending ? 'Sin cifras: política pendiente.' : consumption.length === 0 ? 'Sin consumo publicado en esta campaña. No significa cero.' : `${consumption.length} productos: ${counts(consumption)}.`, 'wrap') },
      ...(pending ? [{ label: 'Cifras', value: text('La política de divulgación no está aprobada: no se exporta ninguna cifra.', 'warn') }] : []),
      ...(summary.disclosure.threshold !== null ? [{ label: 'Umbral de privacidad', value: text(`${summary.disclosure.threshold} agricultores como mínimo por cifra publicada`) }] : []),
      { label: `Exportado el (${zone})`, value: dateCell(exportedAt.toISOString(), offset) },
    ],
    howToRead: [
      'Una celda vacía en «Cantidad» significa que la cifra no está disponible, no cero; la columna «Explicación» dice por qué.',
      'Las filas no se suman: cada una conserva su producto y su unidad (L y KG no se mezclan).',
    ],
  });

  const sheets = [
    cover,
    dataSheet({
      name: 'Necesidad declarada',
      title: `Necesidad declarada · ${summary.campaign.name}`,
      note: 'Lo que cada agricultor declaró que necesita para la campaña. No es pronóstico, consumo ni cantidad comprada.',
      headers,
      widths,
      rows: pending ? [] : rowsOf(needs, summary.disclosure.threshold, offset),
      emptyText: pending ? 'Sin cifras: la política de divulgación no está aprobada.' : 'Ningún agricultor publicó una necesidad declarada en esta campaña. Eso no significa cero.',
    }),
    dataSheet({
      name: 'Consumo publicado',
      title: `Consumo publicado · ${summary.campaign.name}`,
      note: 'Consumo que los agricultores registraron y publicaron desde la app. Es un dato distinto de la necesidad declarada.',
      headers,
      widths,
      rows: pending ? [] : rowsOf(consumption, summary.disclosure.threshold, offset),
      emptyText: pending ? 'Sin cifras: la política de divulgación no está aprobada.' : 'Sin consumo publicado en esta campaña. Eso no significa cero.',
      tabColor: '0EA5E9',
    }),
  ];
  return {
    bytes: buildXlsx(sheets, { title: `Resumen colectivo · ${summary.campaign.name}`, created: exportedAt }),
    fileName: summaryXlsxFileName(summary),
  };
}

export function downloadSummaryXlsx(input: SummaryXlsxInput): BuiltXlsx {
  const book = buildSummaryXlsx(input);
  saveXlsx(book.bytes, book.fileName);
  return book;
}
