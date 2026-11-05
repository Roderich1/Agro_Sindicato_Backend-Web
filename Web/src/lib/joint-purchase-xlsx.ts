/**
 * Exportador de «Compra conjunta» a Excel (`.xlsx`): el borrador tal como lo
 * entregó el servidor (`GET /collective/proposals/{id}`) y, si se cargó, su
 * referencia de consumo (`GET /collective/proposals/{id}/estimation-reference`).
 *
 * Reglas (las mismas que la pantalla «Necesidades y propuesta conjunta»):
 * - Sólo se exporta lo que el servidor autorizó para ese borrador: una cifra va
 *   en la celda numérica únicamente si la línea está `DISCLOSED` y su valor es
 *   válido; si está oculta, falta o es dudosa, la celda numérica queda vacía y
 *   la columna «Explicación» dice por qué. Una ausencia nunca se escribe como 0.
 * - No se recalcula nada: la cantidad es `quantity_presentation` del servidor
 *   (comprobada contra `quantity_base`, como hace la pantalla) y la estimación
 *   es `estimate_base` con la coma desplazada tres lugares sobre el string
 *   (mL → L, g → kg), igual que en la pantalla. No hay totales: cada fila
 *   conserva su unidad y no se suman productos ni unidades.
 * - Necesidad declarada y estimación del consumo van en hojas distintas: la
 *   estimación es una referencia, no la cantidad solicitada ni una compra.
 *
 * Este módulo no hace peticiones ni toca la interfaz: recibe los datos ya
 * cargados y devuelve los bytes del libro.
 */
import { CAMPAIGN_STATUS_TEXT, statusReason } from './collective-text';
import { REASON_TEXT, RESULT_STATUS_TEXT, VALIDITY_REASON_TEXT, VALIDITY_TEXT } from './estimation-text';
import { decimalToPresentation, presentationUnit, toPresentation } from './quantity';
import { buildXlsx, fitsExcelPrecision, type XlsxCell, type XlsxSheet } from './xlsx-writer';
import type { Proposal, ProposalLine, ProposalLineStatus } from '../types/collective';
import type { ProposalEstimationReference, ReferenceLine } from '../types/estimation';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export interface JointPurchaseXlsxInput {
  /** El borrador tal como lo devolvió el servidor. */
  proposal: Proposal;
  /**
   * La referencia de consumo de ese mismo borrador, si se cargó. Sin ella (o si
   * es de otro borrador) el libro no lleva la hoja «Referencia de consumo» y la
   * hoja «Borrador» explica por qué.
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
export const LINE_STATUS_LABEL: Record<ProposalLineStatus, string> = {
  DISCLOSED: 'Publicado',
  SUPPRESSED_UNDER_THRESHOLD: 'Oculto',
  SUPPRESSED_REVISION: 'Oculto (revisión)',
  OVERFLOW: 'Fuera de rango',
  WITHDRAWN: 'Retirado',
  SUPERSEDED: 'Sustituido',
  POLICY_PENDING: 'Política pendiente',
  WITHDRAWN_AFTER_SEAL: 'Retirado tras sellar',
};

const PENDING_CHANGES_TEXT = 'Hay cambios recibidos que aún no alcanzan el umbral: se muestra la cifra anterior.';
const INVALID_FIGURE_TEXT = 'Dato no válido recibido del servidor; no se exporta.';
const HIDDEN_NEED_TEXT =
  'La necesidad de esta fila no está divulgada. Esta es la estimación del consumo: no la sustituye ni se suma a la propuesta.';
const POLICY_PENDING_TEXT = 'Sin cifra: la política de divulgación no está aprobada.';
const NO_RESULT_TEXT = 'Sin estimación: ninguna ejecución incluye este producto para esta campaña.';

/** `"11.5"` → 1 decimal; `"250"` → 0. */
function decimalsOf(value: string): number {
  return value.split('.')[1]?.length ?? 0;
}

/** Una cifra exacta lista para Excel, o el motivo por el que no se escribe. */
function figure(value: string | null, unit: 'L' | 'KG'): { cell: XlsxCell; note: string | null } {
  if (value === null) return { cell: null, note: INVALID_FIGURE_TEXT };
  if (!fitsExcelPrecision(value)) {
    // Excel la redondearía: se deja la celda vacía y el valor exacto como texto.
    return { cell: null, note: `Cifra de más de 15 dígitos: Excel la redondearía. Valor exacto: ${value} ${unit}.` };
  }
  return { cell: { kind: 'number', value, decimals: decimalsOf(value) }, note: null };
}

function text(value: string, style?: Extract<XlsxCell, { kind: 'text' }>['style']): XlsxCell {
  return { kind: 'text', value, style };
}

function dateCell(iso: string | null, offsetMinutes: number): XlsxCell {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  // Días desde 1899-12-30, en hora local fija; redondeado al segundo para un XML estable.
  const seconds = Math.round(ms / 1000) + offsetMinutes * 60;
  return { kind: 'date', serial: Number((seconds / 86400 + 25569).toFixed(8)) };
}

function offsetLabel(minutes: number): string {
  const sign = minutes < 0 ? '−' : '+';
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
}

/** La cantidad de una línea del borrador: sólo si está publicada y es coherente. */
function needOf(line: ProposalLine): { cell: XlsxCell; explanation: string } {
  const label = LINE_STATUS_LABEL[line.status] ?? line.status;
  if (line.status !== 'DISCLOSED') {
    // Aunque llegara un número por error en una línea no publicada, no se exporta.
    return { cell: null, explanation: statusReason(line.status) ?? `Sin cifra (${label}).` };
  }
  const computed = line.quantity_base === null ? null : toPresentation(line.quantity_base);
  const coherent =
    computed !== null &&
    (line.quantity_presentation === null || line.quantity_presentation === computed) &&
    presentationUnit(line.base_unit) === line.presentation_unit;
  const { cell, note } = figure(coherent ? computed : null, line.presentation_unit);
  const notes = [note, line.pending_changes ? PENDING_CHANGES_TEXT : null].filter(Boolean);
  return { cell, explanation: notes.length ? notes.join(' ') : 'Cifra publicada.' };
}

/** La línea de referencia de esta línea del borrador: misma posición, producto y unidad (como la pantalla). */
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
  const note = line.status !== 'DISCLOSED' ? text(HIDDEN_NEED_TEXT, 'wrap') : null;
  const row = (value: XlsxCell, explanation: string, run: XlsxCell[] = [null, null, null, null, null]): XlsxCell[] => [
    text(line.product_name),
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
    text(VALIDITY_TEXT[e.validity] ?? e.validity),
    e.validity_reason ? text(VALIDITY_REASON_TEXT[e.validity_reason] ?? e.validity_reason, 'wrap') : null,
    dateCell(e.generated_at, offset),
    text(e.run_relation === 'BEFORE_PROPOSAL' ? 'Anterior al borrador' : 'Posterior al borrador'),
    text(e.run_ref),
  ]);
}

/** Por qué la referencia no va en el libro, o `null` si va. */
function referenceAbsence(proposal: Proposal, reference: ProposalEstimationReference | null | undefined): string | null {
  if (!reference) return 'No incluida: la referencia de consumo no estaba cargada al exportar.';
  if (reference.proposal_ref !== proposal.proposal_ref) return 'No incluida: la referencia cargada no corresponde a este borrador.';
  return null;
}

export function jointPurchaseXlsxFileName(proposal: Proposal): string {
  return `propuesta-${proposal.proposal_ref}.xlsx`;
}

/**
 * Construye el libro. Hojas: «Borrador» (campaña, fecha y estado), «Necesidades»
 * (producto, cantidad, unidad y estado) y, si corresponde, «Referencia de
 * consumo» (estimación con su fecha y vigencia).
 */
export function buildJointPurchaseXlsx(input: JointPurchaseXlsxInput): JointPurchaseXlsx {
  const { proposal } = input;
  const exportedAt = input.exportedAt ?? new Date();
  const offset = input.utcOffsetMinutes ?? -240;
  const zone = offset === -240 ? 'hora de Bolivia, UTC−4' : `hora local, ${offsetLabel(offset)}`;
  const absence = referenceAbsence(proposal, input.reference);
  const reference = absence ? null : input.reference!;

  // --- Hoja «Borrador» ---
  const coverage = proposal.coverage;
  const coverageText = coverage
    ? coverage.basis === 'ALL_CONTRIBUTORS'
      ? `${coverage.members_with_contribution} de ${coverage.linked_members} agricultores vinculados habían aportado datos al generar el borrador.`
      : `${coverage.members_with_contribution} de ${coverage.linked_members} agricultores vinculados con cifras publicadas al generar el borrador.`
    : 'Sin dato de cobertura en este borrador.';
  const seal = proposal.seal
    ? `Versión ${proposal.seal.version}, sellada por ${proposal.seal.sealed_by.name}.`
    : 'Sin versión sellada: usa la necesidad declarada vigente al generar el borrador.';
  const summary: XlsxCell[][] = [
    [text('Compra conjunta: borrador para revisión humana', 'title')],
    [text('No es una compra: no resta stock, no es necesidad neta y no crea compras, lotes, movimientos, deudas ni pagos.', 'note')],
    [],
    [text('Campaña', 'label'), text(proposal.campaign.name)],
    [text('Estado de la campaña', 'label'), text(CAMPAIGN_STATUS_TEXT[proposal.campaign.status] ?? proposal.campaign.status)],
    [text('Estado del borrador', 'label'), text(proposal.status === 'DRAFT' ? 'Borrador' : proposal.status)],
    [text('Base', 'label'), text('Necesidad declarada por los agricultores')],
    [text(`Generado el (${zone})`, 'label'), dateCell(proposal.generated_at, offset)],
    [text('Generado por', 'label'), text(proposal.generated_by.name)],
    [text('Versión sellada', 'label'), text(seal, 'wrap')],
    ...(proposal.seal ? [[text(`Sellada el (${zone})`, 'label'), dateCell(proposal.seal.sealed_at, offset)]] : []),
    [text('Cobertura', 'label'), text(coverageText, 'wrap')],
    ...(proposal.disclosure.mode === 'POLICY_PENDING'
      ? [[text('Cifras', 'label'), text('La política de divulgación no está aprobada: no se exporta ninguna cifra.', 'wrap')]]
      : []),
    [text('Aviso del servidor', 'label'), text(proposal.notice, 'wrap')],
    [text('Referencia del borrador', 'label'), text(proposal.proposal_ref)],
    [
      text('Huella de las entradas', 'label'),
      text(proposal.inputs_fingerprint ?? 'Sin huella: alguna cifra del borrador ya no se publica.', 'wrap'),
    ],
    [text(`Exportado el (${zone})`, 'label'), dateCell(exportedAt.toISOString(), offset)],
    [
      text('Referencia de consumo', 'label'),
      text(absence ?? 'En la hoja «Referencia de consumo»: no se suma a la necesidad declarada.', 'wrap'),
    ],
    [
      text('Cómo leer las cifras', 'label'),
      text(
        'Una celda vacía en «Cantidad» o en «Estimación» significa que la cifra no está disponible, no cero; la columna «Explicación» dice por qué. Las filas no se suman: cada una conserva su producto y su unidad.',
        'wrap',
      ),
    ],
  ];
  const sheets: XlsxSheet[] = [{ name: 'Borrador', widths: [30, 90], rows: summary }];

  // --- Hoja «Necesidades» ---
  const needHeader = ['Producto', 'Cantidad', 'Unidad', 'Estado', 'Explicación', 'Aportantes', `Datos hasta (${zone})`];
  const needRows = proposal.lines.map((line): XlsxCell[] => {
    const need = needOf(line);
    const disclosed = line.status === 'DISCLOSED';
    return [
      text(line.product_name),
      need.cell,
      text(line.presentation_unit),
      text(LINE_STATUS_LABEL[line.status] ?? line.status),
      text(need.explanation, 'wrap'),
      disclosed && line.contributors !== null && Number.isSafeInteger(line.contributors)
        ? { kind: 'number', value: String(line.contributors), decimals: 0, style: 'integer' }
        : null,
      disclosed ? dateCell(line.data_as_of, offset) : null,
    ];
  });
  const needTop: XlsxCell[][] = [
    [text(`Necesidad declarada · ${proposal.campaign.name}`, 'title')],
    [text('Lo que declararon los agricultores, tal como lo publicó el servidor. No es consumo, ni estimación, ni cantidad comprada.', 'note')],
    [],
  ];
  sheets.push({
    name: 'Necesidades',
    widths: [30, 14, 8, 18, 60, 12, 20],
    rows: [
      ...needTop,
      needHeader.map((h) => text(h, 'header')),
      ...(needRows.length ? needRows : [[text('Sin necesidades declaradas publicadas. Ausencia de declaración = desconocido, no cero.', 'note')]]),
    ],
    freezeRows: needTop.length + 1,
    filter: { headerRow: needTop.length + 1, lastRow: needTop.length + 1 + needRows.length, columns: needHeader.length },
  });

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
    const refTop: XlsxCell[][] = [
      [text('Estimación del consumo (referencia)', 'title')],
      [text(`Vigencia evaluada el (${zone})`, 'label'), dateCell(reference.evaluated_at, offset)],
      [text('Temporada', 'label'), text(reference.season ? reference.season.key : 'Sin temporada')],
      [text(reference.notice, 'note')],
      [],
    ];
    sheets.push({
      name: 'Referencia de consumo',
      // «Estimación» también aloja la fecha de evaluación (B2): 18 caracteres para «aaaa-mm-dd hh:mm».
      widths: [30, 18, 8, 48, 16, 44, 20, 22, 38, 48],
      rows: [...refTop, refHeader.map((h) => text(h, 'header')), ...refRows],
      freezeRows: refTop.length + 1,
      filter: { headerRow: refTop.length + 1, lastRow: refTop.length + 1 + refRows.length, columns: refHeader.length },
    });
  }

  return {
    bytes: buildXlsx(sheets, { title: `Compra conjunta · ${proposal.campaign.name}`, created: exportedAt }),
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
  const url = URL.createObjectURL(new Blob([book.bytes as BlobPart], { type: XLSX_MIME }));
  const link = document.createElement('a');
  link.href = url;
  link.download = book.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revocar después: algunos navegadores leen el blob tras el clic.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return book;
}
