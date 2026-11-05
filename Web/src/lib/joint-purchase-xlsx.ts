/**
 * Exportador de «Propuesta conjunta» a Excel (`.xlsx`): el borrador tal como lo
 * entregó el servidor (`GET /collective/proposals/{id}`) y, si se cargó, su
 * referencia de consumo (`GET /collective/proposals/{id}/estimation-reference`).
 *
 * Reglas (las mismas que la pantalla):
 * - Sólo se exporta lo que el servidor autorizó para ese borrador: una cifra va
 *   en la celda numérica únicamente si la línea está `DISCLOSED` y su valor es
 *   válido; si está oculta, falta o es dudosa, la celda numérica queda vacía y
 *   la columna «Explicación» dice por qué. Una ausencia nunca se escribe como 0.
 * - No se recalcula nada: la cantidad es `quantity_presentation` del servidor
 *   (comprobada contra `quantity_base`) y la estimación es `estimate_base` con
 *   la coma desplazada tres lugares sobre el string (mL → L, g → kg). No hay
 *   totales: cada fila conserva su unidad y no se suman productos ni unidades.
 * - Necesidad declarada y estimación del consumo van en hojas distintas: la
 *   estimación es una referencia, no la cantidad solicitada ni una compra.
 *
 * Este módulo no hace peticiones ni toca la interfaz: recibe los datos ya
 * cargados y devuelve los bytes del libro.
 */
import { REASON_TEXT, RESULT_STATUS_TEXT, VALIDITY_REASON_TEXT, VALIDITY_TEXT } from './estimation-text';
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
  saveXlsx,
  sealText,
  STATUS_LABEL,
  statusCell,
  text,
  zoneLabel,
} from './xlsx-common';
import { buildXlsx, type XlsxCell, type XlsxSheet } from './xlsx-writer';
import type { Proposal, ProposalLine, ProposalLineStatus } from '../types/collective';
import type { ProposalEstimationReference, ReferenceLine } from '../types/estimation';

export { XLSX_MIME } from './xlsx-common';

export interface JointPurchaseXlsxInput {
  /** El borrador tal como lo devolvió el servidor. */
  proposal: Proposal;
  /**
   * La referencia de consumo de ese mismo borrador, si se cargó. Sin ella (o si
   * es de otro borrador) el libro no lleva la hoja «Referencia de consumo» y la
   * portada explica por qué.
   */
  reference?: ProposalEstimationReference | null;
  /** Instante de la exportación; por defecto, ahora. */
  exportedAt?: Date;
  /** Desfase de la hora local respecto de UTC, en minutos. Por defecto −240 (Bolivia, UTC−4, sin horario de verano). */
  utcOffsetMinutes?: number;
}

export interface JointPurchaseXlsx {
  bytes: Uint8Array;
  fileName: string;
  /** Si el libro lleva la hoja «Referencia de consumo». */
  includesReference: boolean;
}

/** Mismos rótulos que el distintivo de estado de la pantalla (`collective-ui.tsx`). */
export const LINE_STATUS_LABEL: Record<ProposalLineStatus, string> = STATUS_LABEL;

const HIDDEN_NEED_TEXT =
  'La necesidad de esta fila no está divulgada. Esta es la estimación del consumo: no la sustituye ni se suma a la propuesta.';
const POLICY_PENDING_TEXT = 'Sin cifra: la política de divulgación no está aprobada.';
const NO_RESULT_TEXT = 'Sin estimación: ninguna ejecución incluye este producto para esta campaña.';

/** La línea de la referencia que acompaña a esta línea del borrador: misma posición, producto y unidad (como la pantalla). */
function referenceOf(reference: ProposalEstimationReference, line: ProposalLine): ReferenceLine | null {
  const found = reference.lines.find((r) => r.position === line.position);
  return found && found.product_ref === line.product_ref && found.base_unit === line.base_unit ? found : null;
}

/**
 * Columnas: Producto, Estimación, Unidad, Explicación, Vigencia, Motivo de la
 * vigencia, Ejecución del, Relación con el borrador, Ejecución (referencia), Nota.
 */
function referenceRow(line: ProposalLine, ref: ReferenceLine | null, offset: number): XlsxCell[] {
  const unit = presentationUnit(line.base_unit);
  const note = line.status !== 'DISCLOSED' ? text(HIDDEN_NEED_TEXT, 'muted') : null;
  const row = (value: XlsxCell, explanation: string, run: XlsxCell[] = [null, null, null, null, null]): XlsxCell[] => [
    text(line.product_name, 'strong'),
    value,
    text(unit),
    text(explanation, 'wrap'),
    ...run,
    note,
  ];
  if (!ref) return row(null, 'Sin referencia para esta fila.');
  if (ref.absence === 'POLICY_PENDING') return row(null, POLICY_PENDING_TEXT);
  const e = ref.estimation;
  if (ref.absence === 'NO_RESULT' || !e) return row(null, NO_RESULT_TEXT);

  let value: XlsxCell = null;
  let explanation: string;
  if (e.status !== 'ESTIMATED') {
    const reason = e.reason_code ? REASON_TEXT[e.reason_code] : null;
    explanation = `Sin cifra: ${RESULT_STATUS_TEXT[e.status] ?? e.status}.${reason ? ` ${reason}` : ''}`;
  } else if (e.estimate_base === null) {
    explanation = e.validity_reason === 'SOURCES_WITHDRAWN' ? 'Cifra retirada.' : 'Sin cifra.';
  } else {
    const shown = figure(decimalToPresentation(e.estimate_base), unit);
    value = shown.cell;
    explanation = shown.note ?? 'Estimado.';
  }
  return row(value, explanation, [
    text(VALIDITY_TEXT[e.validity] ?? e.validity, e.validity === 'CURRENT' ? 'ok' : 'warn'),
    e.validity_reason ? text(VALIDITY_REASON_TEXT[e.validity_reason] ?? e.validity_reason, 'wrap') : null,
    dateCell(e.generated_at, offset),
    text(e.run_relation === 'BEFORE_PROPOSAL' ? 'Anterior al borrador' : 'Posterior al borrador'),
    text(e.run_ref, 'muted'),
  ]);
}

/** Por qué la referencia no va en el libro, o `null` si va. */
function referenceAbsence(proposal: Proposal, reference: ProposalEstimationReference | null | undefined): string | null {
  if (!reference) return 'No incluida: la referencia de consumo no estaba disponible al exportar.';
  if (reference.proposal_ref !== proposal.proposal_ref) return 'No incluida: la referencia cargada no corresponde a este borrador.';
  return null;
}

export function jointPurchaseXlsxFileName(proposal: Proposal): string {
  return `propuesta-${proposal.proposal_ref}.xlsx`;
}

/**
 * Construye el libro. Hojas: «Borrador» (portada: campaña, fecha y estado),
 * «Necesidades» (producto, cantidad, unidad y estado) y, si corresponde,
 * «Referencia de consumo» (estimación con su fecha y vigencia).
 */
export function buildJointPurchaseXlsx(input: JointPurchaseXlsxInput): JointPurchaseXlsx {
  const { proposal } = input;
  const exportedAt = input.exportedAt ?? new Date();
  const offset = input.utcOffsetMinutes ?? BOLIVIA_OFFSET;
  const zone = zoneLabel(offset);
  const absence = referenceAbsence(proposal, input.reference);
  const reference = absence ? null : input.reference!;

  // --- Portada «Borrador» ---
  const sheets: XlsxSheet[] = [
    coverSheet({
      name: 'Borrador',
      title: `Propuesta conjunta · ${proposal.campaign.name}`,
      subtitle: 'Borrador para revisión humana basado en las necesidades declaradas. No es una compra: no resta stock, no es necesidad neta y no crea compras, lotes, movimientos, deudas ni pagos.',
      fields: [
        { label: 'Campaña', value: text(proposal.campaign.name, 'strong') },
        { label: 'Estado de la campaña', value: text(campaignStatusText(proposal.campaign.status)) },
        { label: 'Estado del borrador', value: text(proposal.status === 'DRAFT' ? 'Borrador' : proposal.status, 'warn') },
        { label: 'Base', value: text('Necesidad declarada por los agricultores') },
        { label: `Generado el (${zone})`, value: dateCell(proposal.generated_at, offset) },
        { label: 'Generado por', value: text(proposal.generated_by.name) },
        { label: 'Versión sellada', value: text(proposal.seal ? sealText(proposal.seal) : 'Sin versión sellada: usa la necesidad declarada vigente al generar el borrador.', 'wrap') },
        ...(proposal.seal ? [{ label: `Sellada el (${zone})`, value: dateCell(proposal.seal.sealed_at, offset) }] : []),
        { label: 'Cobertura', value: text(coverageText(proposal.coverage, 'draft'), 'wrap') },
        ...(proposal.disclosure.mode === 'POLICY_PENDING'
          ? [{ label: 'Cifras', value: text('La política de divulgación no está aprobada: no se exporta ninguna cifra.', 'warn') }]
          : []),
        { label: 'Aviso del servidor', value: text(proposal.notice, 'wrap') },
        { label: 'Referencia del borrador', value: text(proposal.proposal_ref, 'muted') },
        { label: 'Huella de las entradas', value: text(proposal.inputs_fingerprint ?? 'Sin huella: alguna cifra del borrador ya no se publica.', 'muted') },
        { label: `Exportado el (${zone})`, value: dateCell(exportedAt.toISOString(), offset) },
        { label: 'Referencia de consumo', value: text(absence ?? 'En la hoja «Referencia de consumo»: no se suma a la necesidad declarada.', 'wrap') },
      ],
      howToRead: [
        'Una celda vacía en «Cantidad» o en «Estimación» significa que la cifra no está disponible, no cero; la columna «Explicación» dice por qué.',
        'Las filas no se suman: cada una conserva su producto y su unidad.',
      ],
    }),
  ];

  // --- Hoja «Necesidades» ---
  const needHeader = ['Producto', 'Cantidad', 'Unidad', 'Estado', 'Explicación', 'Aportantes', `Datos hasta (${zone})`];
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
    ];
  });
  sheets.push(
    dataSheet({
      name: 'Necesidades',
      title: `Necesidad declarada · ${proposal.campaign.name}`,
      note: 'Lo que declararon los agricultores, tal como lo publicó el servidor. No es consumo, ni estimación, ni cantidad comprada.',
      headers: needHeader,
      widths: [30, 14, 8, 22, 60, 12, 20],
      rows: needRows,
      emptyText: 'Sin necesidades declaradas publicadas. Ausencia de declaración = desconocido, no cero.',
    }),
  );

  // --- Hoja «Referencia de consumo» ---
  if (reference) {
    const refHeader = [
      'Producto',
      'Estimación',
      'Unidad',
      'Explicación',
      'Vigencia',
      'Motivo de la vigencia',
      `Ejecución del (${zone})`,
      'Relación con el borrador',
      'Ejecución (referencia)',
      'Nota',
    ];
    const refRows = proposal.lines.map((line) => referenceRow(line, referenceOf(reference, line), offset));
    const sheet = dataSheet({
      name: 'Referencia de consumo',
      title: 'Estimación del consumo (referencia)',
      note: `${reference.notice} Temporada: ${reference.season ? reference.season.key : 'sin temporada'}. Fechas en ${zone}.`,
      headers: refHeader,
      widths: [30, 18, 8, 48, 16, 44, 20, 22, 38, 48],
      rows: refRows,
      emptyText: 'Sin líneas.',
      tabColor: '0EA5E9',
    });
    // Fila 4 (libre en la hoja de datos): fecha en que se evaluó la vigencia.
    sheet.rows[3] = [text('Vigencia evaluada el', 'label'), dateCell(reference.evaluated_at, offset)];
    sheets.push(sheet);
  }

  return {
    bytes: buildXlsx(sheets, { title: `Propuesta conjunta · ${proposal.campaign.name}`, created: exportedAt }),
    fileName: jointPurchaseXlsxFileName(proposal),
    includesReference: reference !== null,
  };
}

/**
 * Descarga el libro en el navegador (mismo mecanismo que «Exportar CSV»).
 * Devuelve lo construido, por si la pantalla quiere avisar de que la
 * referencia no se incluyó.
 */
export function downloadJointPurchaseXlsx(input: JointPurchaseXlsxInput): JointPurchaseXlsx {
  const book = buildJointPurchaseXlsx(input);
  saveXlsx(book.bytes, book.fileName);
  return book;
}
