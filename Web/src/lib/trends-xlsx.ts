/**
 * Exportador de «Tendencias» a Excel: las series selladas tal como las entregó
 * `GET /collective/trends`. Hojas: portada «Tendencias» (dato, campañas,
 * versión sellada y cobertura), «Por campaña» (una fila por producto y una
 * columna por campaña sellada: celda vacía = sin cifra publicada, nunca cero)
 * «Detalle» (una fila por producto y campaña con estado y explicación) y
 * «Campañas» (una fila por campaña: estado, inicio, versión sellada y
 * cobertura). Nada se suma, promedia ni interpola.
 *
 * Es la única exportación de las tendencias (el CSV del servidor se retiró el
 * 2026-11-12): cada columna de aquel CSV tiene su lugar en el libro (tabla en
 * `docs/architecture/WEB_EXCEL_UNICO_2026-11-12.md`).
 */
import {
  BOLIVIA_OFFSET,
  campaignStatusText,
  coverSheet,
  dataSheet,
  dateCell,
  fileSlug,
  integerCell,
  publishedQuantity,
  refCell,
  saveXlsx,
  STATUS_LABEL,
  statusCell,
  text,
  yesNoCell,
  zoneLabel,
} from './xlsx-common';
import { buildXlsx, type XlsxCell, type XlsxSheet } from './xlsx-writer';
import type { CollectiveTrends, ProjectionType, TrendCampaign } from '../types/collective';
import type { BuiltXlsx } from './collective-summary-xlsx';

export interface TrendsXlsxInput {
  trends: CollectiveTrends;
  /** El dato pedido («Consumo publicado» o «Necesidad declarada»). */
  type: ProjectionType;
  exportedAt?: Date;
  utcOffsetMinutes?: number;
}

export const TYPE_LABEL: Record<ProjectionType, string> = {
  CONSUMPTION_TOTAL: 'Consumo publicado',
  DECLARED_NEED: 'Necesidad declarada',
};

export function trendsXlsxFileName(type: ProjectionType): string {
  return `tendencias-${fileSlug(TYPE_LABEL[type])}.xlsx`;
}

function campaignLine(campaign: TrendCampaign): string {
  const seal = campaign.seal ? `versión ${campaign.seal.version} sellada` : 'sin sellar (no aporta cifras)';
  const coverage = campaign.coverage ? `, ${campaign.coverage.members_with_contribution} de ${campaign.coverage.linked_members} con cifras publicadas` : '';
  return `${campaign.name}: ${campaignStatusText(campaign.status)}, ${seal}${coverage}`;
}

export function buildTrendsXlsx(input: TrendsXlsxInput): BuiltXlsx {
  const { trends, type } = input;
  const exportedAt = input.exportedAt ?? new Date();
  const offset = input.utcOffsetMinutes ?? BOLIVIA_OFFSET;
  const zone = zoneLabel(offset);
  const label = TYPE_LABEL[type];
  const pending = trends.disclosure.mode === 'POLICY_PENDING';
  const sealed = trends.campaigns.filter((campaign) => campaign.seal !== null);
  const nameOf = new Map(trends.campaigns.map((campaign) => [campaign.campaign_ref, campaign.name]));

  const cover = coverSheet({
    name: 'Tendencias',
    title: `Tendencias · ${label}`,
    subtitle: 'Historial entre versiones selladas, campaña por campaña, tal como lo publicó el servidor. Un hueco es una cifra no publicada, no un cero.',
    fields: [
      { label: 'Dato', value: text(label, 'strong') },
      { label: 'Campañas selladas', value: text(sealed.length === 0 ? 'Ninguna' : sealed.map((campaign) => campaign.name).join(' · '), 'wrap') },
      ...trends.campaigns.map((campaign) => ({ label: campaign.seal ? 'Campaña sellada' : 'Campaña sin sellar', value: text(campaignLine(campaign), 'wrap') })),
      { label: 'Productos con serie', value: text(pending ? 'Sin cifras: política pendiente.' : String(trends.series.length)) },
      ...(pending ? [{ label: 'Cifras', value: text('La política de divulgación no está aprobada: no se exporta ninguna cifra.', 'warn') }] : []),
      ...(trends.disclosure.threshold !== null
        ? [{ label: 'Umbral de privacidad', value: text(`${trends.disclosure.threshold} agricultores como mínimo por cifra publicada`) }]
        : []),
      { label: 'Aviso del servidor', value: text(trends.notice, 'wrap') },
      { label: `Exportado el (${zone})`, value: dateCell(exportedAt.toISOString(), offset) },
    ],
    howToRead: [
      'En «Por campaña», una celda vacía significa que esa campaña no tiene cifra publicada de ese producto; «Detalle» dice por qué.',
      'Las cifras no se suman ni se promedian entre campañas, productos ni unidades.',
    ],
  });

  // --- «Por campaña»: matriz producto × campaña sellada ---
  const matrixHeaders = ['Producto', 'Unidad', ...sealed.map((campaign) => campaign.name)];
  const matrixRows: XlsxCell[][] = pending
    ? []
    : trends.series.map((line) => {
        const pointOf = new Map(line.points.map((point) => [point.campaign_ref, point]));
        return [
          text(line.product_name, 'strong'),
          text(line.presentation_unit),
          ...sealed.map((campaign): XlsxCell => {
            const point = pointOf.get(campaign.campaign_ref);
            if (!point) return null;
            return publishedQuantity({
              status: point.status,
              base: point.total_base,
              presentation: point.total_presentation,
              baseUnit: line.base_unit,
              presentationUnit: line.presentation_unit,
              threshold: trends.disclosure.threshold,
            }).cell;
          }),
        ];
      });
  const matrix: XlsxSheet = dataSheet({
    name: 'Por campaña',
    title: `${label} por campaña sellada`,
    note: 'Una fila por producto y una columna por campaña sellada. Celda vacía = sin cifra publicada, no cero. Las campañas sin sellar no aparecen.',
    headers: matrixHeaders,
    widths: [30, 8, ...sealed.map(() => 18)],
    rows: matrixRows,
    emptyText: pending ? 'Sin cifras: la política de divulgación no está aprobada.' : `No hay cifras selladas de ${label.toLowerCase()} en ninguna campaña. Eso no significa cero.`,
  });

  // --- «Detalle»: una fila por producto y campaña ---
  const detailHeaders = [
    'Producto',
    'Campaña',
    'Cantidad',
    'Unidad',
    'Estado',
    'Explicación',
    'Aportantes',
    `Datos hasta (${zone})`,
    'Cambios pendientes',
    'Referencia del producto',
    'Referencia de la campaña',
    'Referencia de la versión sellada',
  ];
  const sealOf = new Map(trends.campaigns.map((campaign) => [campaign.campaign_ref, campaign.seal?.seal_ref ?? null]));
  const detailRows: XlsxCell[][] = pending
    ? []
    : trends.series.flatMap((line) =>
        line.points.map((point): XlsxCell[] => {
          const quantity = publishedQuantity({
            status: point.status,
            base: point.total_base,
            presentation: point.total_presentation,
            baseUnit: line.base_unit,
            presentationUnit: line.presentation_unit,
            pending: point.pending_changes,
            threshold: trends.disclosure.threshold,
          });
          const disclosed = point.status === 'DISCLOSED';
          return [
            text(line.product_name, 'strong'),
            text(nameOf.get(point.campaign_ref) ?? point.campaign_ref),
            quantity.cell,
            text(line.presentation_unit),
            statusCell(point.status),
            text(quantity.explanation, 'wrap'),
            disclosed ? integerCell(point.contributors) : null,
            disclosed ? dateCell(point.data_as_of, offset) : null,
            yesNoCell(point.pending_changes),
            refCell(line.product_ref),
            refCell(point.campaign_ref),
            refCell(sealOf.get(point.campaign_ref)),
          ];
        }),
      );
  const detail = dataSheet({
    name: 'Detalle',
    title: `${label} · detalle por producto y campaña`,
    note: `Estados posibles: ${['DISCLOSED', 'SUPPRESSED_UNDER_THRESHOLD', 'SUPPRESSED_REVISION', 'WITHDRAWN_AFTER_SEAL', 'NO_DATA', 'NOT_SEALED'].map((s) => STATUS_LABEL[s as keyof typeof STATUS_LABEL]).join(', ')}.`,
    headers: detailHeaders,
    widths: [30, 24, 14, 8, 22, 64, 12, 20, 12, 38, 38, 38],
    rows: detailRows,
    emptyText: pending ? 'Sin cifras: la política de divulgación no está aprobada.' : 'Sin series selladas.',
    tabColor: '0EA5E9',
  });

  // --- «Campañas»: una fila por campaña, sellada o no ---
  const campaigns = dataSheet({
    name: 'Campañas',
    title: 'Campañas del historial',
    note: 'Cada campaña con su estado, su versión sellada y su cobertura. Sólo las selladas aportan cifras a las tendencias. La cobertura mide participación, no integridad.',
    headers: [
      'Campaña',
      'Estado',
      'Inicio (día de calendario)',
      'Versión sellada',
      `Sellada el (${zone})`,
      'Agricultores vinculados',
      'Con cifras publicadas',
      'Filas sin cifra',
      'Referencia de la campaña',
      'Referencia de la versión sellada',
    ],
    widths: [30, 16, 20, 12, 20, 14, 14, 12, 38, 38],
    rows: trends.campaigns.map((campaign): XlsxCell[] => [
      text(campaign.name, 'strong'),
      text(campaignStatusText(campaign.status)),
      // Día de calendario guardado a medianoche UTC: se escribe el día, sin llevarlo a la hora local.
      /^\d{4}-\d{2}-\d{2}/.test(campaign.start_date) ? text(campaign.start_date.slice(0, 10)) : null,
      campaign.seal ? integerCell(campaign.seal.version) : text('Sin sellar', 'warn'),
      campaign.seal ? dateCell(campaign.seal.sealed_at, offset) : null,
      campaign.coverage ? integerCell(campaign.coverage.linked_members) : null,
      campaign.coverage ? integerCell(campaign.coverage.members_with_contribution) : null,
      yesNoCell(campaign.coverage?.suppressed_cells),
      refCell(campaign.campaign_ref),
      refCell(campaign.seal?.seal_ref),
    ]),
    emptyText: 'Sin campañas en el historial.',
    tabColor: '0F1D15',
  });

  return {
    bytes: buildXlsx([cover, matrix, detail, campaigns], { title: `Tendencias · ${label}`, created: exportedAt }),
    fileName: trendsXlsxFileName(type),
  };
}

export function downloadTrendsXlsx(input: TrendsXlsxInput): BuiltXlsx {
  const book = buildTrendsXlsx(input);
  saveXlsx(book.bytes, book.fileName);
  return book;
}
