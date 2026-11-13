import type { ReactNode } from 'react';
import {
  ACCESS_RULES,
  AUTO_CLOSED_EVENT_LABEL,
  CALL_EVENT_LABEL,
  fmtWhen,
  PARTICIPATION_STATUS_LABEL,
  PENDING_CONSENT_TOTAL_TEXT,
  quantityText,
  SYSTEM_ACTOR,
  totalState,
} from '../../lib/joint-purchase-call-text';
import type { BaseUnit } from '../../lib/quantity';
import type {
  JointPurchaseCallEvent,
  JointPurchaseCallProductTotal,
  JointPurchaseParticipantLine,
  JointPurchaseParticipationStatus,
  JointPurchaseResponsibleChange,
} from '../../types/joint-purchase-calls';
import { Chip, DataTable, ICON, Icon, linkClass, QuantityFigure, surfaceClass, type DataTableColumn } from '../ui';

/*
 * Piezas de presentación de «Compras conjuntas» (sesión B del rediseño v2,
 * láminas 10–20 y 05 §13). No piden datos ni calculan cifras: muestran lo que
 * la vista recibió del servidor. Oculto no es cero.
 */

/** Tarjeta blanca con `<h2>`, una nota a la derecha y su contenido (láminas 10–20). */
export function CallCard({
  title,
  note,
  children,
  testId,
  headingLevel = 2,
  className = '',
}: {
  title: ReactNode;
  note?: ReactNode;
  children: ReactNode;
  testId?: string;
  headingLevel?: 2 | 3;
  className?: string;
}) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <section className={`${surfaceClass} min-w-0 px-5 py-5 sm:px-7 sm:py-6 ${className}`} data-testid={testId}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line pb-3">
        <Heading className="min-w-0 text-xl font-bold leading-tight text-ink sm:text-2xl">{title}</Heading>
        {note && <div className="text-sm leading-relaxed text-ink-muted">{note}</div>}
      </div>
      <div className="pt-1">{children}</div>
    </section>
  );
}

/** Línea con candado o icono de información, como en «Quién pidió» (láminas 10, 13, 16–20). */
export function LockLine({ children, icon = 'lock', testId }: { children: ReactNode; icon?: 'lock' | 'info'; testId?: string }) {
  return (
    <div className="flex items-start gap-3 pt-3 text-base leading-relaxed text-ink-muted" data-testid={testId}>
      <Icon d={icon === 'lock' ? ICON.lock : ICON.info} className="mt-1 h-5 w-5 text-ink" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/**
 * Total de un producto (05 §13 con la regla T de E4 §5.2): la cifra sólo con
 * `VISIBLE`, con cualquier número de personas; con `PREVIOUS_POLICY_K3`, una
 * línea dice que es la regla anterior. Con `PENDING_CONSENT`, el chip punteado
 * «Pendiente de autorización» y su motivo, nunca un 0. El total no depende de
 * quién consulta en vivo; el servidor decide en cada consulta.
 */
export function CallTotal({
  total,
  baseUnit,
  open = false,
}: {
  total: JointPurchaseCallProductTotal;
  baseUnit: BaseUnit;
  /** Convocatoria abierta: sin personas todavía se dice «Sin pedidos todavía». */
  open?: boolean;
}) {
  const state = totalState(total);
  if (total.visibility === 'VISIBLE' && total.total_quantity_base !== null) {
    if (open && total.participant_count === 0)
      return (
        <Chip tone="hidden" size="md" testId="no-requests">
          Sin pedidos todavía
        </Chip>
      );
    const figure = <QuantityFigure text={quantityText(total.total_quantity_base, baseUnit)} className="sm:text-4xl" />;
    if (!state.note) return figure;
    return (
      <span className="inline-flex max-w-full flex-col items-end gap-1 text-right">
        {figure}
        <span className="text-xs text-ink-muted" data-testid="total-basis-note">
          {state.note}
        </span>
      </span>
    );
  }
  return (
    <span className="inline-flex max-w-full flex-col items-end gap-1 text-right">
      <Chip tone="hidden" icon={ICON.lock} size="md">
        <span data-testid="hidden-total">{state.label ?? PENDING_CONSENT_TOTAL_TEXT}</span>
      </Chip>
      {state.note && <span className="text-xs text-ink-muted">{state.note}</span>}
    </span>
  );
}

export interface ProductLine {
  key: string;
  testId: string;
  name: string;
  /** «En litros · 3 personas». */
  sub: ReactNode;
  /** Lo de la derecha: cifra, chip o referencia; `null` sin columna. */
  value?: ReactNode;
}

/**
 * Productos de una convocatoria (láminas 10–13 y 16–20): tabla con encabezados
 * para lectores de pantalla; en teléfono el valor pasa debajo del nombre.
 */
export function ProductLines({ caption, valueHeader, lines }: { caption: string; valueHeader?: string; lines: ProductLine[] }) {
  return (
    <table role="table" className="block w-full sm:table" aria-label={caption}>
      <thead role="rowgroup" className="sr-only">
        <tr role="row">
          <th role="columnheader" scope="col">
            Producto
          </th>
          {valueHeader && (
            <th role="columnheader" scope="col">
              {valueHeader}
            </th>
          )}
        </tr>
      </thead>
      <tbody role="rowgroup" className="block sm:table-row-group">
        {lines.map((line) => (
          <tr
            key={line.key}
            role="row"
            className="flex flex-col gap-2 border-b border-line py-4 last:border-b-0 sm:table-row"
            data-testid={line.testId}
          >
            <th role="rowheader" scope="row" className="block text-left align-top font-normal sm:table-cell sm:py-4 sm:pr-4">
              <span className="block text-base font-semibold text-ink [overflow-wrap:anywhere]">{line.name}</span>
              <span className="mt-0.5 block text-sm text-ink-muted">{line.sub}</span>
            </th>
            {valueHeader && (
              <td role="cell" className="block text-right align-middle sm:table-cell sm:py-4">
                {line.value}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export interface ParticipantEntry {
  participation_ref: string;
  name: string;
  status?: JointPurchaseParticipationStatus;
  accepted_at: string;
  lines: JointPurchaseParticipantLine[];
}

type ParticipantRow = { participant: ParticipantEntry; line: JointPurchaseParticipantLine | null };

/**
 * Nombres y cantidades por persona (láminas 11, 12 y 38): sólo para la
 * Administración, con lo que envía el servidor (E4 §2). Una fila por producto pedido (el nombre se repite, como en la
 * lámina 12); en teléfono, `DataTable` apila cada fila con sus encabezados.
 * Nada de correo ni otros datos: sólo lo que envía `/participants` o `/closing`.
 */
export function ParticipantsTable({ caption, participants, productName }: { caption: string; participants: ParticipantEntry[]; productName: (ref: string, fallback: string) => string }) {
  const showStatus = participants.some((participant) => participant.status !== undefined);
  const rows: ParticipantRow[] = participants.flatMap((participant) =>
    (participant.lines.length > 0 ? participant.lines : [null]).map((line) => ({ participant, line })),
  );
  const columns: DataTableColumn<ParticipantRow>[] = [
    { key: 'name', header: 'Participante', rowHeader: true, cell: (row) => <span className="font-semibold [overflow-wrap:anywhere]">{row.participant.name}</span> },
    { key: 'product', header: 'Producto', cell: (row) => <span className="[overflow-wrap:anywhere]">{row.line ? productName(row.line.product_ref, row.line.product_name) : 'Sin productos'}</span> },
    {
      key: 'quantity',
      header: 'Cantidad',
      numeric: true,
      cell: (row) => (row.line ? <QuantityFigure text={quantityText(row.line.quantity_base, row.line.base_unit)} size="md" /> : '—'),
    },
    ...(showStatus
      ? [{ key: 'status', header: 'Estado', cell: (row: ParticipantRow) => (row.participant.status ? (PARTICIPATION_STATUS_LABEL[row.participant.status] ?? row.participant.status) : '') }]
      : []),
    { key: 'received', header: 'Recibido', numeric: true, cell: (row) => fmtWhen(row.participant.accepted_at) },
  ];
  return (
    <div className="mt-3">
      <DataTable
        caption={caption}
        columns={columns}
        rows={rows}
        rowKey={(row) => `${row.participant.participation_ref}-${row.line?.product_ref ?? 'none'}`}
        rowTestId={() => 'participant-row'}
      />
    </div>
  );
}

/** «Cómo funciona el acceso» (láminas 10–20, E4 §2): texto fijo y plegable, sin animación. */
export function AccessRules() {
  return (
    <details className="group border-t border-line pt-1" data-testid="access-rules">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-2 text-base font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden">
        Cómo funciona el acceso
        <Icon d={ICON.chevronDown} className="h-5 w-5 group-open:hidden" />
        <Icon d={ICON.chevronUp} className="hidden h-5 w-5 group-open:block" />
      </summary>
      <ul className="list-disc space-y-2 pb-2 pl-5 text-sm leading-relaxed text-ink">
        {ACCESS_RULES.map((rule) => (
          <li key={rule.term}>
            <strong>{rule.term}</strong>: {rule.text}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Eventos cuyo detalle repite el título («Borrador creado.», «Convocatoria abierta…»). */
const QUIET_DETAIL = new Set<JointPurchaseCallEvent['kind']>(['CREATED', 'OPENED', 'CLOSED']);

interface ActivityItem {
  key: string;
  title: string;
  meta: string;
  detail: string | null;
}

/**
 * Agrupa concesiones seguidas del mismo actor en el mismo minuto (lámina 20,
 * «Permisos concedidos (2)»); cada detalle se conserva. Una decisión de presentación.
 */
function activityItems(history: JointPurchaseCallEvent[], changes: JointPurchaseResponsibleChange[]): ActivityItem[] {
  const items: ActivityItem[] = [];
  const minute = (iso: string) => iso.slice(0, 16);
  let previous: { event: JointPurchaseCallEvent; item: ActivityItem; count: number } | null = null;
  [...history].reverse().forEach((event, index) => {
    const actor = event.actor?.name ?? SYSTEM_ACTOR;
    if (
      previous &&
      event.kind === 'ACCESS_GRANTED' &&
      previous.event.kind === 'ACCESS_GRANTED' &&
      previous.event.actor?.user_ref === event.actor?.user_ref &&
      minute(previous.event.at) === minute(event.at)
    ) {
      previous.count += 1;
      previous.item.title = `Permisos concedidos (${previous.count})`;
      // Se recorre del más reciente al más antiguo: el detalle anterior va delante.
      previous.item.detail = [event.detail, previous.item.detail].filter(Boolean).join(' ');
      return;
    }
    let title = CALL_EVENT_LABEL[event.kind] ?? event.kind;
    if (event.kind === 'CLOSED' && event.actor === null) title = AUTO_CLOSED_EVENT_LABEL;
    let meta = `${fmtWhen(event.at)} · ${actor}`;
    // El detalle del servidor sólo se muestra cuando añade algo al título (a quién, qué cambió, por qué).
    let detail = QUIET_DETAIL.has(event.kind) ? null : event.detail;
    if (event.kind === 'RESPONSIBLE_REPLACED') {
      // P-A: el motivo de la sustitución viene en `responsible_changes`; con él, quién sustituyó a quién.
      const change = changes.find((entry) => entry.at === event.at) ?? null;
      if (change) {
        meta = `${meta} · «${change.reason}»`;
        detail = `${change.previous.name} → ${change.next.name}`;
      }
    }
    const item: ActivityItem = { key: `${event.at}-${index}`, title, meta, detail };
    items.push(item);
    previous = { event, item, count: 1 };
  });
  return items;
}

/** «Actividad» (láminas 10–20): eventos del servidor, el más reciente arriba; «Sistema» si no hay actor. */
export function ActivityTimeline({ history, changes = [] }: { history: JointPurchaseCallEvent[]; changes?: JointPurchaseResponsibleChange[] }) {
  const items = activityItems(history, changes);
  return (
    <section className={`${surfaceClass} px-5 py-5 sm:px-7 sm:py-6`} data-testid="call-history" aria-labelledby="call-activity-title">
      <h2 id="call-activity-title" className="text-xl font-bold leading-tight text-ink sm:text-2xl">
        Actividad
      </h2>
      {items.length === 0 ? (
        <p className="pt-3 text-sm text-ink-muted">El servidor no registra eventos para esta convocatoria.</p>
      ) : (
        <ol className="mt-4" aria-label="Historial de la convocatoria">
          {items.map((item, index) => (
            <li key={item.key} className="relative pb-5 pl-8 last:pb-0" data-testid="call-history-event">
              {index < items.length - 1 && <span className="absolute bottom-0 left-[5px] top-4 w-px bg-line" aria-hidden="true" />}
              <span className="absolute left-0 top-1.5 h-3 w-3 rounded-full bg-ink" aria-hidden="true" />
              <p className="font-semibold leading-snug text-ink">{item.title}</p>
              <p className="mt-0.5 text-sm text-ink-muted [overflow-wrap:anywhere]">{item.meta}</p>
              {item.detail && <p className="mt-0.5 text-xs text-ink-muted [overflow-wrap:anywhere]">{item.detail}</p>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** Enlace de texto que abre un `<details>` («Ver historial de permisos», lámina 12). */
export function DisclosureLink({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  return (
    <details className="group" data-testid={testId}>
      <summary className={`${linkClass} inline-flex min-h-11 cursor-pointer list-none items-center [&::-webkit-details-marker]:hidden`}>
        <span className="group-open:hidden">{label}</span>
        <span className="hidden group-open:inline">Ocultar el historial</span>
      </summary>
      {children}
    </details>
  );
}
