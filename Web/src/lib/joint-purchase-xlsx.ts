/**
 * Exportador del borrador de «Propuesta conjunta» a Excel (`.xlsx`): el
 * borrador tal como lo entregó el servidor (`GET /collective/proposals/{id}`)
 * y la referencia de consumo estimado **fijada en ese borrador** (E3,
 * `GET /collective/proposals/{id}/estimation-link`), ambos consultados al
 * exportar. Es la única exportación del borrador: el CSV del servidor se retiró
 * el 2026-11-12 (tabla de equivalencias en
 * `docs/architecture/WEB_EXCEL_UNICO_2026-11-12.md`).
 *
 * Reglas (las mismas que la pantalla):
 * - Sólo se exporta lo que el servidor autorizó para ese borrador: una cifra va
 *   en la celda numérica únicamente si la línea está `DISCLOSED` y su valor es
 *   válido; si está oculta, falta o es dudosa, la celda numérica queda vacía y
 *   la columna «Explicación» dice por qué. Una ausencia nunca se escribe como 0.
 * - La estimación es la de la referencia **fijada** (E3-D1), nunca la más
 *   reciente (F12-EST-08): si el borrador no tiene referencia fijada, el libro
 *   lo dice y no lleva ninguna estimación. Una cifra restringida o retirada
 *   (`RESTRICTED`, o la referencia entera restringida por la política) no se
 *   escribe; una desactualizada (`OUTDATED`) se escribe rotulada así, como en
 *   la pantalla (E3 §4).
 * - No se recalcula nada: la cantidad es `quantity_presentation` del servidor
 *   (comprobada contra `quantity_base`) y la estimación es `estimate_base` con
 *   la coma desplazada tres lugares sobre el string (mL → L, g → kg). No hay
 *   totales ni diferencias propias: la diferencia y el porcentaje sólo se
 *   copian del servidor cuando éste declara comparables las cifras (E3 §5); el
 *   alcance de cada cifra (`scope`) va siempre en sus columnas.
 * - Necesidad declarada y consumo estimado van en hojas distintas: la
 *   estimación es una referencia, no la cantidad solicitada ni una compra.
 *
 * Este módulo no hace peticiones ni toca la interfaz: recibe los datos ya
 * cargados y devuelve los bytes del libro.
 */
import {
  ACTION_TEXT,
  estimateScopeText,
  hasEstimateFigure,
  MODE_TEXT,
  PREPARE_BLOCKER_TEXT,
  UPDATE_REASON_TEXT,
} from './estimation-link-text';
import { policyText } from './collective-text';
import { FAILURE_TEXT, JOB_STATUS_TEXT, REASON_TEXT, RESULT_STATUS_TEXT, STOP_TEXT, VALIDITY_REASON_TEXT, VALIDITY_TEXT } from './estimation-text';
import { decimalToPresentation, presentationUnit } from './quantity';
import {
  BOLIVIA_OFFSET,
  campaignStatusText,
  coverSheet,
  coverageText,
  dataSheet,
  dateCell,
  figure,
  integerCell,
  publishedQuantity,
  refCell,
  saveXlsx,
  sealText,
  STATUS_LABEL,
  statusCell,
  text,
  yesNoCell,
  zoneLabel,
} from './xlsx-common';
import { buildXlsx, type XlsxCell, type XlsxSheet } from './xlsx-writer';
import type { Proposal, ProposalLine, ProposalLineStatus } from '../types/collective';
import type { FailureCode, StopCode } from '../types/estimation';
import type { EstimationLinkLine, EstimationLinkView, LineEstimationState, LinkState } from '../types/estimation-link';

export { XLSX_MIME } from './xlsx-common';

export interface JointPurchaseXlsxInput {
  /** El borrador tal como lo devolvió el servidor. */
  proposal: Proposal;
  /**
   * La referencia fijada de ese mismo borrador (`GET …/estimation-link`),
   * consultada al exportar. `null` o ausente: no se pudo consultar; el libro
   * no lleva ninguna estimación y la portada lo dice (no se usa otra en su lugar).
   */
  link?: EstimationLinkView | null;
  /** Instante de la exportación; por defecto, ahora. */
  exportedAt?: Date;
  /** Desfase de la hora local respecto de UTC, en minutos. Por defecto −240 (Bolivia, UTC−4, sin horario de verano). */
  utcOffsetMinutes?: number;
}

export interface JointPurchaseXlsx {
  bytes: Uint8Array;
  fileName: string;
  /** Si el libro lleva la hoja «Consumo estimado» (hay una referencia fijada de este borrador). */
  includesReference: boolean;
  /** Estado de la referencia fijada al exportar, o `null` si no se pudo consultar o no era de este borrador. */
  referenceState: LinkState | null;
}

/** Mismos rótulos que el distintivo de estado de la pantalla (`collective-ui.tsx`). */
export const LINE_STATUS_LABEL: Record<ProposalLineStatus, string> = STATUS_LABEL;

/** Estado de la referencia fijada (E3 §4), como en la franja de la pantalla. */
export const LINK_STATE_LABEL: Record<LinkState, string> = {
  NONE: 'Sin referencia fijada',
  CALCULATING: 'Calculando',
  LINKED: 'Referencia fijada',
  UNAVAILABLE: 'El cálculo no se completó',
  RESTRICTED: 'Restringida',
};

/** Estado de la estimación de una línea (E3 §4, «Estado por línea»), como en la celda de la pantalla. */
export const LINE_ESTIMATION_LABEL: Record<LineEstimationState, string> = {
  NONE: 'Sin referencia',
  CALCULATING: 'Calculando',
  AVAILABLE: 'Vigente',
  OUTDATED: 'Desactualizada',
  INSUFFICIENT_DATA: 'Datos insuficientes',
  ERROR: 'Error: sin cifra',
  NO_RESULT: 'Sin resultado',
  RESTRICTED: 'Restringida',
};

const HIDDEN_NEED_TEXT =
  'La necesidad de esta fila no está divulgada. Esta es la estimación del consumo: no la sustituye ni se suma a la propuesta.';
const RESTRICTED_TEXT = 'Restringida: la política de divulgación no está aprobada. No se exporta ninguna cifra de la referencia.';
const NOT_COMPARABLE_TEXT = 'El servidor no declara comparables la necesidad y la estimación: no se calcula ninguna diferencia.';
const OUTDATED_NOT_COMPARED_TEXT = 'Desactualizada: se conserva la cifra de la referencia fijada, pero no se compara con la necesidad.';

/** La línea de la referencia que acompaña a esta línea del borrador: misma posición, producto y unidad (como la pantalla). */
function linkLineOf(view: EstimationLinkView, line: ProposalLine): EstimationLinkLine | null {
  const found = view.lines.find((l) => l.position === line.position);
  return found && found.product.product_ref === line.product_ref && found.base_unit === line.base_unit ? found : null;
}

/** Por qué el cálculo de la referencia no se completó (como `unavailableText` de la pantalla). */
function unavailableText(view: EstimationLinkView): string {
  const stop = view.link?.stop_code;
  const failure = view.link?.failure_code ?? view.run?.failure_code;
  if (stop && stop in STOP_TEXT) return STOP_TEXT[stop as StopCode];
  if (failure && failure in FAILURE_TEXT) return FAILURE_TEXT[failure as FailureCode];
  return 'El cálculo no produjo cifras.';
}

/** Explicación de la estimación de una línea sin cifra exportable. */
function lineExplanation(ref: EstimationLinkLine): string {
  const e = ref.estimation;
  const reason = e.reason_code ? REASON_TEXT[e.reason_code] : null;
  switch (e.state) {
    case 'NONE':
      return 'Sin referencia fijada para esta fila.';
    case 'CALCULATING':
      return 'El cálculo de la referencia está en curso: todavía no hay cifra.';
    case 'INSUFFICIENT_DATA':
      return `${e.status ? (RESULT_STATUS_TEXT[e.status] ?? e.status) : 'Datos insuficientes'}.${reason ? ` ${reason}` : ''}`;
    case 'ERROR':
      return reason ?? 'El cálculo no se completó (el motivo está en la portada).';
    case 'NO_RESULT':
      return 'La ejecución fijada no incluye este producto y unidad.';
    case 'RESTRICTED':
      return e.validity_reason === 'SOURCES_WITHDRAWN'
        ? `${VALIDITY_REASON_TEXT.SOURCES_WITHDRAWN} No se exporta la cifra.`
        : 'La política de divulgación no está aprobada: no se exporta la cifra.';
    case 'AVAILABLE':
    case 'OUTDATED':
      return 'Sin cifra.';
  }
}

/** El porcentaje que calculó el servidor (4 decimales), tal cual, con coma decimal. */
function serverPercent(percent: string | null, undefinedReason: 'ESTIMATE_ZERO' | null): string {
  if (undefinedReason === 'ESTIMATE_ZERO' || percent === null) return 'No definido: la estimación es cero.';
  return `${percent.replace('.', ',')} %`;
}

/**
 * Columnas: Producto, Consumo estimado, Unidad, Estado, Explicación, Vigencia,
 * Motivo de la vigencia, Alcance de la estimación, Campañas del tramo,
 * Aportantes por cifra (mín.), (máx.), Aportantes de la necesidad, Comparable,
 * Motivo de no comparar, Diferencia (del servidor), Diferencia porcentual (del
 * servidor), Nota, Referencia del producto.
 */
function estimateRow(line: ProposalLine, ref: EstimationLinkLine | null, restricted: boolean): XlsxCell[] {
  const unit = presentationUnit(line.base_unit);
  const note = line.status !== 'DISCLOSED' ? text(HIDDEN_NEED_TEXT, 'muted') : null;
  const product = text(line.product_name, 'strong');
  if (!ref) {
    return [product, null, text(unit), null, text('Sin referencia para esta fila.', 'wrap'), ...Array<XlsxCell>(11).fill(null), note, refCell(line.product_ref)];
  }
  const e = ref.estimation;
  // Una referencia restringida (política pendiente) no exporta ninguna cifra, aunque llegara por error.
  const state: LineEstimationState = restricted ? 'RESTRICTED' : e.state;
  const withFigure = !restricted && hasEstimateFigure(ref);

  let value: XlsxCell = null;
  let explanation: string;
  if (withFigure) {
    const shown = figure(decimalToPresentation(e.estimate_base!), unit);
    value = shown.cell;
    explanation =
      shown.note ??
      (state === 'AVAILABLE'
        ? 'Estimación vigente de la ejecución fijada.'
        : `Desactualizada${e.validity_reason ? `: ${VALIDITY_REASON_TEXT[e.validity_reason]}` : '.'} No se compara con la necesidad.`);
  } else {
    explanation = restricted ? RESTRICTED_TEXT : lineExplanation(ref);
  }

  const scope = withFigure ? ref.scope.estimate : null;
  const needContributors = line.status === 'DISCLOSED' && ref.need.status === 'DISCLOSED' ? ref.scope.need_contributors : null;
  const comparison = ref.comparison;
  // La diferencia sólo se copia del servidor si él declara comparables las cifras, la estimación se
  // exporta y está vigente: una desactualizada se incluye rotulada, pero incluirla no habilita
  // ninguna diferencia ni porcentaje (decisión del autor del 2026-11-12, P-A §7).
  const outdated = state === 'OUTDATED';
  const difference = withFigure && !outdated && comparison.comparable && comparison.difference ? comparison.difference : null;
  return [
    product,
    value,
    text(unit),
    text(LINE_ESTIMATION_LABEL[state] ?? state, state === 'AVAILABLE' ? 'ok' : 'warn'),
    text(explanation, 'wrap'),
    !restricted && e.validity ? text(VALIDITY_TEXT[e.validity] ?? e.validity, e.validity === 'CURRENT' ? 'ok' : 'warn') : null,
    !restricted && e.validity_reason ? text(VALIDITY_REASON_TEXT[e.validity_reason] ?? e.validity_reason, 'wrap') : null,
    scope ? text(estimateScopeText(scope), 'wrap') : null,
    scope ? integerCell(scope.span_campaigns) : null,
    scope ? integerCell(scope.contributors_min) : null,
    scope ? integerCell(scope.contributors_max) : null,
    integerCell(needContributors),
    yesNoCell(difference !== null),
    difference ? null : text(outdated && withFigure ? OUTDATED_NOT_COMPARED_TEXT : (comparison.message ?? NOT_COMPARABLE_TEXT), 'wrap'),
    difference ? text(difference.observation, 'wrap') : null,
    difference ? text(serverPercent(difference.difference_percent, difference.percent_undefined)) : null,
    note,
    refCell(line.product_ref),
  ];
}

/** Por qué la referencia fijada no va en el libro, o `null` si va. */
function linkAbsence(proposal: Proposal, link: EstimationLinkView | null | undefined): string | null {
  if (!link) return 'No incluida: la referencia fijada no se pudo consultar al exportar. No se usa ninguna otra estimación en su lugar.';
  if (link.proposal_ref !== proposal.proposal_ref) return 'No incluida: la referencia consultada no corresponde a este borrador.';
  return null;
}

/** Qué dice la portada de la referencia fijada, según su estado. */
function linkSummary(view: EstimationLinkView): string {
  switch (view.state) {
    case 'NONE':
      return `Este borrador no tiene una referencia de consumo estimado fijada: el libro no incluye ninguna estimación (no se usa la más reciente en su lugar).${
        view.prepare_blocker ? ` ${PREPARE_BLOCKER_TEXT[view.prepare_blocker]}` : ''
      }`;
    case 'CALCULATING':
      return `Calculando: la referencia fijada todavía no tiene cifras${view.link?.job_status ? ` (${JOB_STATUS_TEXT[view.link.job_status].toLowerCase()})` : ''}. Hoja «Consumo estimado».`;
    case 'LINKED':
      return 'La referencia fijada en este borrador, en la hoja «Consumo estimado». No se suma a la necesidad declarada ni cambia el borrador.';
    case 'UNAVAILABLE':
      return `El cálculo de la referencia fijada no se completó: sin cifras. ${unavailableText(view)}`;
    case 'RESTRICTED':
      return 'Restringida: la política de divulgación no está aprobada. Se conserva el vínculo (ejecución, fecha y método) pero no se exporta ninguna cifra.';
  }
}

export function jointPurchaseXlsxFileName(proposal: Proposal): string {
  return `propuesta-${proposal.proposal_ref}.xlsx`;
}

/**
 * Construye el libro. Hojas: «Borrador» (portada: identificación del borrador,
 * campaña, estado y la referencia fijada con su versión, fecha y estado),
 * «Necesidades» (producto, cantidad, unidad y estado), y, si el borrador tiene
 * una referencia fijada, «Consumo estimado» (la estimación por línea con su
 * estado, vigencia, alcance y comparabilidad) e «Historial de la referencia».
 */
export function buildJointPurchaseXlsx(input: JointPurchaseXlsxInput): JointPurchaseXlsx {
  const { proposal } = input;
  const exportedAt = input.exportedAt ?? new Date();
  const offset = input.utcOffsetMinutes ?? BOLIVIA_OFFSET;
  const zone = zoneLabel(offset);
  const absence = linkAbsence(proposal, input.link);
  const view = absence ? null : input.link!;
  // Hoja de la estimación sólo si hay un vínculo vigente (fijado, calculando, no disponible o restringido).
  const withSheet = view !== null && view.state !== 'NONE' && view.link !== null;
  const restricted = view?.state === 'RESTRICTED';
  const link = view?.link ?? null;
  const run = view?.run ?? null;
  // Líneas cuya cifra fijada se exporta rotulada «Desactualizada» (nunca si la referencia está restringida).
  const outdatedCount = view && !restricted ? view.lines.filter((l) => l.estimation.state === 'OUTDATED' && hasEstimateFigure(l)).length : 0;

  const referenceFields = view
    ? [
        { label: 'Consumo estimado', value: text(linkSummary(view), view.state === 'LINKED' ? 'wrap' : 'warn') },
        { label: 'Estado de la referencia', value: text(LINK_STATE_LABEL[view.state] ?? view.state, view.state === 'LINKED' ? 'ok' : 'warn') },
        ...(link
          ? [
              {
                label: 'Versión de la referencia',
                value: text(`N.º ${link.sequence}: ${MODE_TEXT[link.mode] ?? link.mode} (${ACTION_TEXT[link.action] ?? link.action}) por ${link.created_by.name}`, 'wrap'),
              },
              { label: `Referencia fijada el (${zone})`, value: dateCell(link.created_at, offset) },
            ]
          : []),
        ...(run
          ? [
              { label: `Ejecución fijada del (${zone})`, value: dateCell(run.generated_at, offset) },
              { label: 'Método', value: text(`${run.method} ${run.method_version}`) },
              { label: 'Temporada', value: text(`${run.season.key}: ${run.season.definition}`, 'wrap') },
              { label: 'Ejecución (referencia)', value: refCell(run.run_ref) },
            ]
          : []),
        ...(link
          ? [
              {
                label: 'Actualización',
                value: text(
                  view.update.available
                    ? `Disponible${view.update.reason ? `: ${UPDATE_REASON_TEXT[view.update.reason]}` : '.'} Este libro conserva la referencia fijada; no la sustituye.`
                    : 'No hay una actualización disponible.',
                  'wrap',
                ),
              },
            ]
          : []),
        ...(outdatedCount > 0
          ? [
              {
                label: 'Cifras desactualizadas',
                value: text(
                  `${outdatedCount === 1 ? '1 línea' : `${outdatedCount} líneas`} con la cifra de la referencia fijada rotulada «Desactualizada» (hoja «Consumo estimado», con su motivo). No se sustituyen por una estimación nueva ni se comparan con la necesidad.`,
                  'warnText',
                ),
              },
            ]
          : []),
        { label: `Vigencia evaluada el (${zone})`, value: dateCell(view.evaluated_at, offset) },
        { label: 'Aviso del servidor (referencia)', value: text(view.notice, 'wrap') },
      ]
    : [{ label: 'Consumo estimado', value: text(absence!, 'warn') }];

  // --- Portada «Borrador» ---
  const sheets: XlsxSheet[] = [
    coverSheet({
      name: 'Borrador',
      title: `Propuesta conjunta · ${proposal.campaign.name}`,
      subtitle: 'Borrador para revisión humana basado en las necesidades declaradas. No es una compra: no resta stock, no es necesidad neta y no crea compras, lotes, movimientos, deudas ni pagos.',
      fields: [
        { label: 'Campaña', value: text(proposal.campaign.name, 'strong') },
        { label: 'Referencia de la campaña', value: refCell(proposal.campaign.campaign_ref) },
        { label: 'Estado de la campaña', value: text(campaignStatusText(proposal.campaign.status)) },
        { label: 'Estado del borrador', value: text(proposal.status === 'DRAFT' ? 'Borrador' : proposal.status, 'warn') },
        { label: 'Referencia del borrador', value: refCell(proposal.proposal_ref) },
        { label: 'Base', value: text('Necesidad declarada por los agricultores') },
        { label: `Generado el (${zone})`, value: dateCell(proposal.generated_at, offset) },
        { label: 'Generado por', value: text(proposal.generated_by.name) },
        { label: 'Versión sellada', value: text(proposal.seal ? sealText(proposal.seal) : 'Sin versión sellada: usa la necesidad declarada vigente al generar el borrador.', 'wrap') },
        ...(proposal.seal
          ? [
              { label: `Sellada el (${zone})`, value: dateCell(proposal.seal.sealed_at, offset) },
              { label: 'Referencia de la versión sellada', value: refCell(proposal.seal.seal_ref) },
            ]
          : []),
        { label: 'Cobertura', value: text(coverageText(proposal.coverage, 'draft'), 'wrap') },
        // E4 §4.4: el borrador conserva la política con que se generó.
        { label: 'Política aplicada', value: text(policyText(proposal.disclosure.policy), 'wrap') },
        ...(proposal.disclosure.mode === 'POLICY_PENDING'
          ? [{ label: 'Cifras', value: text('La política de divulgación no está aprobada: no se exporta ninguna cifra.', 'warn') }]
          : []),
        { label: 'Aviso del servidor', value: text(proposal.notice, 'wrap') },
        { label: 'Huella de las entradas', value: text(proposal.inputs_fingerprint ?? 'Sin huella: alguna cifra del borrador ya no se publica.', 'muted') },
        { label: `Exportado el (${zone})`, value: dateCell(exportedAt.toISOString(), offset) },
        ...referenceFields,
      ],
      howToRead: [
        'Una celda vacía en «Cantidad» o en «Consumo estimado» significa que la cifra no está disponible, no cero; la columna «Explicación» dice por qué.',
        'Las filas no se suman: cada una conserva su producto y su unidad. Necesidad declarada y consumo estimado no se suman ni se restan.',
      ],
    }),
  ];

  // --- Hoja «Necesidades» ---
  const needHeader = [
    'Producto',
    'Cantidad',
    'Unidad',
    'Estado',
    'Explicación',
    'Aportantes',
    `Datos hasta (${zone})`,
    'Cambios pendientes',
    `Publicado el (${zone})`,
    'N.º de línea',
    'Referencia del producto',
  ];
  const needRows = proposal.lines.map((line): XlsxCell[] => {
    const need = publishedQuantity({
      status: line.status,
      base: line.quantity_base,
      presentation: line.quantity_presentation,
      baseUnit: line.base_unit,
      presentationUnit: line.presentation_unit,
      pending: line.pending_changes,
    });
    const disclosed = line.status === 'DISCLOSED';
    return [
      text(line.product_name, 'strong'),
      need.cell,
      text(line.presentation_unit),
      statusCell(line.status),
      text(need.explanation, 'wrap'),
      disclosed ? integerCell(line.contributors) : null,
      disclosed ? dateCell(line.data_as_of, offset) : null,
      yesNoCell(line.pending_changes),
      disclosed ? dateCell(line.released_at, offset) : null,
      integerCell(line.position),
      refCell(line.product_ref),
    ];
  });
  sheets.push(
    dataSheet({
      name: 'Necesidades',
      title: `Necesidad declarada · ${proposal.campaign.name}`,
      note: 'Lo que declararon los agricultores, tal como lo publicó el servidor. No es consumo, ni estimación, ni cantidad comprada.',
      headers: needHeader,
      widths: [30, 14, 8, 22, 60, 12, 20, 12, 20, 10, 38],
      rows: needRows,
      emptyText: 'Sin necesidades declaradas publicadas. Ausencia de declaración = desconocido, no cero.',
    }),
  );

  // --- Hoja «Consumo estimado»: la referencia fijada ---
  if (withSheet && view) {
    const header = [
      'Producto',
      'Consumo estimado',
      'Unidad',
      'Estado',
      'Explicación',
      'Vigencia',
      'Motivo de la vigencia',
      'Alcance de la estimación',
      'Campañas del tramo',
      'Aportantes por cifra (mín.)',
      'Aportantes por cifra (máx.)',
      'Aportantes de la necesidad',
      'Comparable',
      'Motivo de no comparar',
      'Diferencia (del servidor)',
      'Diferencia porcentual (del servidor)',
      'Nota',
      'Referencia del producto',
    ];
    const rows = proposal.lines.map((line) => estimateRow(line, linkLineOf(view, line), restricted));
    const sheet = dataSheet({
      name: 'Consumo estimado',
      title: `Consumo estimado · referencia fijada N.º ${link!.sequence}`,
      note: `${view.notice} ${run ? `Ejecución fijada: ${run.method} ${run.method_version}, temporada ${run.season.key} (fechas en la portada, ${zone}). ` : ''}Las diferencias sólo se escriben si el servidor declara comparables las cifras.`,
      headers: header,
      widths: [30, 18, 8, 18, 56, 16, 44, 36, 12, 14, 14, 14, 12, 56, 48, 22, 48, 38],
      rows,
      emptyText: 'Sin líneas.',
      tabColor: '0EA5E9',
    });
    // Fila 4 (libre en la hoja de datos): fecha en que se evaluó la vigencia.
    sheet.rows[3] = [text('Vigencia evaluada el', 'label'), dateCell(view.evaluated_at, offset)];
    sheets.push(sheet);

    // --- Hoja «Historial de la referencia»: cada vínculo, inmutable ---
    sheets.push(
      dataSheet({
        name: 'Historial de la referencia',
        title: 'Historial de la referencia de consumo estimado',
        note: 'Cada vez que se obtuvo, actualizó o quitó la referencia de este borrador. La vigente es la de mayor número; las anteriores no cambian el libro.',
        headers: ['N.º', 'Acción', 'Detalle', `Fecha (${zone})`, 'Por', 'Ejecución (referencia)', 'Trabajo', 'Vigente'],
        widths: [8, 14, 32, 20, 30, 38, 18, 10],
        rows: view.history.map((entry): XlsxCell[] => [
          integerCell(entry.sequence),
          text(MODE_TEXT[entry.mode] ?? entry.mode),
          text(ACTION_TEXT[entry.action] ?? entry.action),
          dateCell(entry.created_at, offset),
          text(entry.created_by.name),
          refCell(entry.run_ref),
          entry.job_status ? text(JOB_STATUS_TEXT[entry.job_status] ?? entry.job_status) : null,
          yesNoCell(entry.current),
        ]),
        emptyText: 'Sin historial.',
        tabColor: '0F1D15',
      }),
    );
  }

  return {
    bytes: buildXlsx(sheets, { title: `Propuesta conjunta · ${proposal.campaign.name}`, created: exportedAt }),
    fileName: jointPurchaseXlsxFileName(proposal),
    includesReference: withSheet,
    referenceState: view?.state ?? null,
  };
}

/**
 * Descarga el libro en el navegador. Devuelve lo construido, por si la
 * pantalla quiere avisar de que la referencia no se incluyó.
 */
export function downloadJointPurchaseXlsx(input: JointPurchaseXlsxInput): JointPurchaseXlsx {
  const book = buildJointPurchaseXlsx(input);
  saveXlsx(book.bytes, book.fileName);
  return book;
}
