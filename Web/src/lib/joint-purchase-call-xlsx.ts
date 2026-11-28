/**
 * Exportador a Excel (`.xlsx`) de una convocatoria de compra conjunta (abierta o cerrada).
 *
 * Reglas de permisos y privacidad (E4):
 * - Al exportar se vuelve a consultar al servidor (`GET /calls/:id` y, según
 *   el estado, `GET /calls/:id/closing` o `GET /calls/:id/participants`): nada
 *   sale del estado en memoria de la pantalla.
 * - La hoja «Reparto por participante» (nombres y cantidades individuales
 *   autorizadas) sólo se construye cuando el servidor habilita
 *   `can_view_participants` para la Administración y entrega la lista.
 * - La Directiva recibe únicamente la portada y el consolidado permitido según
 *   la regla T, sin nombres ni cantidades por persona.
 * - Un total pendiente de autorización (`PENDING_CONSENT`) deja la celda
 *   numérica vacía y explica el motivo: nunca se escribe como 0.
 */
import {
  CALL_STATUS_LABEL,
  NOT_A_PURCHASE_TEXT,
  PARTICIPATION_STATUS_LABEL,
  PENDING_CONSENT_TOTAL_TEXT,
  pendingConsentText,
  totalState,
} from './joint-purchase-call-text';
import { presentationUnit, toPresentation } from './quantity';
import {
  BOLIVIA_OFFSET,
  buildXlsx,
  coverSheet,
  dataSheet,
  dateCell,
  figure,
  fileSlug,
  integerCell,
  saveXlsx,
  text,
  zoneLabel,
  type CoverField,
} from './xlsx-common';
import type { XlsxCell, XlsxSheet } from './xlsx-writer';
import { jointPurchaseCallsService } from '../services/joint-purchase-calls.service';
import type {
  JointPurchaseCallClosing,
  JointPurchaseCallDetail,
  JointPurchaseCallParticipants,
  JointPurchaseCallProductTotal,
  JointPurchaseParticipantLine,
  JointPurchaseParticipationStatus,
} from '../types/joint-purchase-calls';

export { XLSX_MIME } from './xlsx-common';

export interface CallXlsxInput {
  call: JointPurchaseCallDetail;
  closing?: JointPurchaseCallClosing | null;
  participants?: JointPurchaseCallParticipants | null;
  exportedAt?: Date;
  utcOffsetMinutes?: number;
}

export interface CallXlsxBook {
  bytes: Uint8Array;
  fileName: string;
  /** `true` sólo cuando el libro incluye la hoja «Reparto por participante» (Administración habilitada). */
  includesIndividual: boolean;
}

interface ConsolidatedRowInput {
  product_name: string;
  base_unit: 'ML' | 'G';
  total: JointPurchaseCallProductTotal;
}

interface IndividualParticipantInput {
  name: string;
  status?: JointPurchaseParticipationStatus;
  accepted_at: string;
  lines: JointPurchaseParticipantLine[];
}

function consolidatedRows(
  lines: ConsolidatedRowInput[],
  open: boolean,
): XlsxCell[][] {
  return lines.map((line) => {
    const unit = presentationUnit(line.base_unit);
    const state = totalState(line.total);
    const visible = line.total.visibility === 'VISIBLE' && line.total.total_quantity_base !== null;

    let amountCell: XlsxCell = null;
    let statusCell: XlsxCell;
    let noteText = state.note ?? '';

    if (visible) {
      if (open && line.total.participant_count === 0) {
        statusCell = text('Sin pedidos todavía', 'muted');
      } else {
        const pres = toPresentation(line.total.total_quantity_base!);
        const built = figure(pres, unit);
        amountCell = built.cell;
        if (built.note) noteText = [noteText, built.note].filter(Boolean).join(' ');
        statusCell = state.note ? text('Visible (regla anterior)', 'warn') : text('Visible', 'ok');
      }
    } else {
      statusCell = text(state.label ?? PENDING_CONSENT_TOTAL_TEXT, 'warn');
    }

    return [
      text(line.product_name, 'wrap'),
      amountCell,
      text(unit),
      integerCell(line.total.participant_count),
      statusCell,
      noteText ? text(noteText, 'wrap') : null,
    ];
  });
}

function individualRows(
  participants: IndividualParticipantInput[],
  productName: (ref: string, fallback: string) => string,
  includeStatus: boolean,
  offset: number,
): XlsxCell[][] {
  const rows: XlsxCell[][] = [];
  for (const participant of participants) {
    const entries: (JointPurchaseParticipantLine | null)[] = participant.lines.length > 0 ? participant.lines : [null];
    for (const line of entries) {
      const unit = line ? presentationUnit(line.base_unit) : '';
      const pres = line ? toPresentation(line.quantity_base) : null;
      const built = line ? figure(pres, unit, false) : { cell: null, note: null };
      const row: XlsxCell[] = [
        text(participant.name, 'wrap'),
        text(line ? productName(line.product_ref, line.product_name) : 'Sin productos', 'wrap'),
        built.cell,
        unit ? text(unit) : null,
      ];
      if (includeStatus) {
        row.push(participant.status ? text(PARTICIPATION_STATUS_LABEL[participant.status] ?? participant.status) : null);
      }
      row.push(dateCell(participant.accepted_at, offset));
      rows.push(row);
    }
  }
  return rows;
}

/** Construye el libro `.xlsx` de la convocatoria a partir de las respuestas del servidor. */
export function buildCallXlsx(input: CallXlsxInput): CallXlsxBook {
  const { call, closing = null, participants = null } = input;
  const exportedAt = input.exportedAt ?? new Date();
  const offset = input.utcOffsetMinutes ?? BOLIVIA_OFFSET;
  const zone = zoneLabel(offset);
  const closed = call.status === 'CLOSED';
  const open = call.status === 'OPEN';

  const canIncludeIndividual = closed
    ? call.can_view_participants === true && closing?.can_view_participants === true && Array.isArray(closing.participants)
    : open
      ? call.can_view_participants === true && participants !== null && Array.isArray(participants.participants)
      : false;

  const participantCount = closed && closing ? closing.participant_count : call.participant_count;
  const pendingCount = closed && closing
    ? closing.pending_consent_count
    : participants?.pending_consent_count ?? call.pending_consent_count;
  const pendingNotice = closed && closing
    ? closing.pending_consent_notice
    : participants?.pending_consent_notice ?? null;

  const fields: CoverField[] = [
    { label: 'Campaña', value: text(call.campaign.name) },
    { label: 'Estado', value: text(CALL_STATUS_LABEL[call.status] ?? call.status) },
    { label: `Fecha límite (${zone})`, value: dateCell(call.deadline_at, offset) },
  ];

  if (closed && closing) {
    fields.push(
      { label: `Corte de pedidos (${zone})`, value: dateCell(closing.cutoff_at, offset) },
      { label: 'Modo de cierre', value: text(closing.mode === 'AUTOMATIC' ? 'Automático, al vencer el plazo' : 'Manual') },
    );
  }

  fields.push({ label: 'Participantes vigentes', value: integerCell(participantCount) });

  if (pendingCount > 0) {
    fields.push({
      label: 'Pendientes de autorización',
      value: text(pendingNotice ?? pendingConsentText(pendingCount), 'warnText'),
    });
  }

  fields.push(
    {
      label: 'Detalle para reparto',
      value: canIncludeIndividual
        ? text('Incluido en «Reparto por participante» (sólo pedidos con autorización vigente para Administración).', 'ok')
        : text('No incluido: sólo la Administración habilitada recibe nombres y cantidades individuales.', 'warnText'),
    },
    { label: `Exportado el (${zone})`, value: dateCell(exportedAt.toISOString(), offset) },
  );

  const sheets: XlsxSheet[] = [
    coverSheet({
      name: 'Convocatoria',
      title: call.name,
      subtitle: closed ? 'Consolidado al cierre · Compra conjunta' : 'Consolidado provisional · Convocatoria abierta',
      fields,
      howToRead: [
        NOT_A_PURCHASE_TEXT,
        'Un total pendiente de autorización deja la celda numérica vacía y explica el motivo: nunca se escribe como 0.',
      ],
    }),
  ];

  const sourceLines: ConsolidatedRowInput[] = closed && closing
    ? closing.lines.map((line) => ({ product_name: line.product_name, base_unit: line.base_unit, total: line }))
    : call.products.map((product) => ({ product_name: product.name, base_unit: product.base_unit, total: product.totals }));

  sheets.push(
    dataSheet({
      name: 'Consolidado',
      title: closed ? 'Consolidado al cierre' : 'Pedido provisional por producto',
      note: closed
        ? 'Cantidades solicitadas hasta el corte, fijadas al cierre. Cada fila conserva su unidad.'
        : 'Totales provisionales mientras la convocatoria sigue abierta; pueden cambiar hasta el cierre.',
      headers: ['Producto', 'Cantidad solicitada', 'Unidad', 'Participantes', 'Estado del total', 'Observación'],
      widths: [36, 20, 12, 16, 26, 48],
      rows: consolidatedRows(sourceLines, open),
      emptyText: 'Sin productos en esta convocatoria.',
    }),
  );

  if (canIncludeIndividual) {
    const list: IndividualParticipantInput[] = closed ? closing!.participants! : participants!.participants;
    const productName = (ref: string, fallback: string) => fallback || call.products.find((p) => p.product_ref === ref)?.name || '—';
    const includeStatus = open && list.some((p) => p.status !== undefined);
    const headers = includeStatus
      ? ['Participante', 'Producto', 'Cantidad', 'Unidad', 'Estado', `Recibido (${zone})`]
      : ['Participante', 'Producto', 'Cantidad', 'Unidad', `Recibido (${zone})`];
    const widths = includeStatus ? [32, 34, 16, 12, 16, 22] : [32, 34, 16, 12, 22];

    sheets.push(
      dataSheet({
        name: 'Reparto por participante',
        title: closed ? 'Reparto por participante (al cierre)' : 'Reparto por participante (provisional)',
        note: closed
          ? 'Sólo pedidos con autorización vigente para la Administración al corte. Una persona puede figurar en varias filas.'
          : 'Lista provisional de pedidos con autorización vigente para la Administración; puede cambiar hasta el cierre.',
        headers,
        widths,
        rows: individualRows(list, productName, includeStatus, offset),
        emptyText: pendingCount > 0
          ? 'No hay pedidos con autorización vigente para mostrar; los demás figuran como pendientes en la portada.'
          : 'Todavía no hay pedidos registrados.',
        tabColor: '1D4ED8',
      }),
    );
  }

  const slug = fileSlug(call.name) || call.call_id;
  const suffix = closed ? 'cierre' : 'provisional';
  return {
    bytes: buildXlsx(sheets, { title: `Compra conjunta · ${call.name}`, created: exportedAt }),
    fileName: `convocatoria-${slug}-${suffix}.xlsx`,
    includesIndividual: canIncludeIndividual,
  };
}

/**
 * Consulta de nuevo la convocatoria en el servidor y descarga su libro Excel.
 * La Directiva nunca solicita `/participants`; la Administración habilitada
 * obtiene el reparto autorizado según los permisos vigentes en el servidor.
 */
export async function downloadCallExcel(callId: string): Promise<CallXlsxBook> {
  const call = await jointPurchaseCallsService.get(callId);
  if (call.call_id !== callId) throw new Error('El servidor devolvió otra convocatoria: no se exporta.');
  if (call.status !== 'OPEN' && call.status !== 'CLOSED') {
    throw new Error('Sólo se pueden exportar convocatorias abiertas o cerradas.');
  }

  let closing: JointPurchaseCallClosing | null = null;
  let participants: JointPurchaseCallParticipants | null = null;

  if (call.status === 'CLOSED') {
    closing = await jointPurchaseCallsService.closing(callId);
  } else if (call.can_view_participants) {
    participants = await jointPurchaseCallsService.participants(callId);
  }

  const book = buildCallXlsx({ call, closing, participants });
  saveXlsx(book.bytes, book.fileName);
  return book;
}
