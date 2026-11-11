import axios from 'axios';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { AppShell, Modal } from '../components/app-shell';
import {
  Button,
  Collapsible,
  DataState,
  DataTable,
  inputClass,
  KpiTile,
  labelClass,
  Notice,
  PageHeader,
  Section,
  StatusChip,
} from '../components/ui';
import { fmtDateTime } from '../lib/collective-text';
import {
  CALL_EVENT_LABEL,
  CALL_STATUS_CHIP,
  CLOSE_IMPLICATION,
  CLOSE_MODE_LABEL,
  callError,
  callErrorCode,
  hiddenTotalText,
  NOT_A_PURCHASE_TEXT,
  OPEN_IMPLICATIONS,
  PARTICIPANTS_FORBIDDEN_TEXT,
  PARTICIPATION_STATUS_LABEL,
  PROVISIONAL_NOTE,
  quantityText,
  referenceText,
} from '../lib/joint-purchase-call-text';
import { COLLECTIVE_PATHS } from '../lib/navigation';
import { presentationUnit, type BaseUnit } from '../lib/quantity';
import { jointPurchaseCallsService } from '../services/joint-purchase-calls.service';
import type {
  JointPurchaseCallClosing,
  JointPurchaseCallDetail,
  JointPurchaseCallParticipant,
} from '../types/joint-purchase-calls';
import { JointPurchaseCallForm } from './joint-purchase-call-form';

type Dialog = 'edit' | 'open' | 'close' | 'cancel';
const MAX_REASON = 280;

/**
 * E2 §6: detalle de una convocatoria (`/colectivo/compras-conjuntas/:id`).
 * Acciones por estado: en Borrador, editar, abrir (confirmación) y cancelar
 * (motivo); en Abierta, cerrar (confirmación) y cancelar; en Cerrada, el
 * «Consolidado al cierre». Los participantes identificados sólo se piden con
 * el permiso del responsable (`can_view_participants`, E2-D6); el resto de la
 * Directiva ve datos, productos, estado y número de participantes (E2-D7).
 */
export function JointPurchaseCallDetailPage() {
  const { id = '' } = useParams();
  const location = useLocation();
  const [params] = useSearchParams();
  const [call, setCall] = useState<JointPurchaseCallDetail | null>(null);
  const [problem, setProblem] = useState<{ message: string; forbidden: boolean } | null>(null);
  const [message, setMessage] = useState<string | null>(() => (location.state as { message?: string } | null)?.message ?? null);
  const [dialog, setDialog] = useState<Dialog | null>(null);

  const load = useCallback(async () => {
    try {
      setCall(await jointPurchaseCallsService.get(id));
      setProblem(null);
    } catch (err) {
      setProblem({
        message: callError(err, 'No fue posible cargar la convocatoria.'),
        forbidden: axios.isAxiosError(err) && err.response?.status === 403,
      });
    }
  }, [id]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const done = async (text: string) => {
    setDialog(null);
    setMessage(text);
    await load();
  };

  const campaignId = call?.campaign?.campaign_ref ?? params.get('campaign');
  const backTo = `${COLLECTIVE_PATHS.jointPurchaseCalls}${campaignId ? `?campaign=${encodeURIComponent(campaignId)}` : ''}`;
  const back = (
    <Link to={backTo} className="text-sm font-semibold text-brand-800 underline-offset-2 hover:underline">
      Volver a las convocatorias
    </Link>
  );

  if (problem || !call) {
    return (
      <AppShell title="Convocatoria" section="Colectivo">
        <div className="space-y-4">
          {back}
          <Section>
            {problem ? (
              <DataState
                compact
                state={problem.forbidden ? 'forbidden' : 'error'}
                description={problem.message}
                onRetry={problem.forbidden ? undefined : () => void load()}
                testId="call-error"
              />
            ) : (
              <DataState compact state="loading" testId="call-loading" />
            )}
          </Section>
        </div>
      </AppShell>
    );
  }

  const actions = (
    <div className="flex flex-wrap gap-2">
      {call.status === 'DRAFT' && (
        <>
          <Button variant="secondary" onClick={() => setDialog('edit')}>
            Editar
          </Button>
          <Button onClick={() => setDialog('open')}>Abrir</Button>
        </>
      )}
      {call.status === 'OPEN' && <Button onClick={() => setDialog('close')}>Cerrar</Button>}
      {(call.status === 'DRAFT' || call.status === 'OPEN') && (
        <Button variant="danger" onClick={() => setDialog('cancel')}>
          Cancelar convocatoria
        </Button>
      )}
    </div>
  );
  const version = `${call.status}|${call.updated_at ?? ''}`;

  return (
    <AppShell title={call.name} section="Colectivo">
      <div className="space-y-5">
        {back}
        <PageHeader
          title={call.name}
          subtitle={<StatusChip status={CALL_STATUS_CHIP[call.status] ?? call.status} testId="call-status" />}
          actions={actions}
        />
        {message && <Notice kind="ok">{message}</Notice>}

        <Section title="Datos de la convocatoria">
          <CallFacts call={call} />
        </Section>

        <Section
          title="Productos"
          note={
            call.status === 'OPEN'
              ? 'Total de cantidades solicitadas hasta ahora; puede cambiar hasta el cierre.'
              : call.source_proposal_ref
                ? 'Tomados de un borrador de propuesta: su cifra es sólo la referencia divulgada en ese borrador.'
                : undefined
          }
        >
          <ProductsTable call={call} />
        </Section>

        {(call.status === 'OPEN' || call.status === 'CANCELLED') && <ParticipantsPanel key={version} call={call} />}
        {call.status === 'CLOSED' && <ClosingPanel key={version} call={call} />}

        <Collapsible title="Historial" testId="call-history">
          {call.history.length === 0 ? (
            <DataState compact state="empty" title="Sin eventos" description="El servidor no registra eventos para esta convocatoria." />
          ) : (
            <ol className="divide-y divide-slate-100" aria-label="Historial de la convocatoria">
              {call.history.map((event, index) => (
                <li key={`${event.at}-${index}`} className="px-5 py-2 text-sm" data-testid="call-history-event">
                  <p>
                    <span className="font-semibold text-slate-900">{CALL_EVENT_LABEL[event.kind] ?? event.kind}</span>
                    <span className="ml-2 text-xs text-slate-600">{fmtDateTime(event.at)}</span>
                    <span className="ml-2 text-xs text-slate-600">· {event.actor?.name ?? 'Automático (servidor)'}</span>
                  </p>
                  {event.detail && <p className="text-xs text-slate-700 [overflow-wrap:anywhere]">{event.detail}</p>}
                </li>
              ))}
            </ol>
          )}
        </Collapsible>
      </div>

      {dialog === 'edit' && (
        <JointPurchaseCallForm
          campaignId={call.campaign.campaign_ref}
          campaignName={call.campaign.name}
          call={call}
          onClose={() => setDialog(null)}
          onSaved={({ text }) => void done(text)}
        />
      )}
      {dialog === 'open' && (
        <ConfirmDialog
          title="Abrir la convocatoria"
          actionLabel="Abrir convocatoria"
          confirmText={`Confirmo que se abre «${call.name}» con ${call.responsible?.name ?? 'el responsable elegido'} como responsable.`}
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await jointPurchaseCallsService.open(call.id);
            await done('Convocatoria abierta. Los agricultores la verán al actualizar su aplicación.');
          }}
        >
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700" data-testid="open-implications">
            {OPEN_IMPLICATIONS.map((line) => (
              <li key={line}>{line}</li>
            ))}
            <li>
              {call.responsible?.name ?? 'El responsable'} podrá ver el nombre y las cantidades de quienes participen; el resto de la
              Directiva verá sólo cuántas personas participan.
            </li>
            <li>Fecha límite: {fmtDateTime(call.deadline_at)} (hora del servidor del sindicato).</li>
          </ul>
        </ConfirmDialog>
      )}
      {dialog === 'close' && (
        <ConfirmDialog
          title="Cerrar la convocatoria"
          actionLabel="Cerrar convocatoria"
          confirmText={`Confirmo que se cierra «${call.name}».`}
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await jointPurchaseCallsService.close(call.id);
            await done('Convocatoria cerrada. El consolidado al cierre ya no cambia.');
          }}
        >
          <p className="text-sm text-slate-700" data-testid="close-implication">
            {CLOSE_IMPLICATION}
          </p>
        </ConfirmDialog>
      )}
      {dialog === 'cancel' && (
        <ConfirmDialog
          title="Cancelar la convocatoria"
          actionLabel="Cancelar convocatoria"
          variant="danger"
          withReason
          confirmText={`Confirmo que se cancela «${call.name}». No se puede deshacer.`}
          onClose={() => setDialog(null)}
          onConfirm={async (reason) => {
            await jointPurchaseCallsService.cancel(call.id, reason);
            await done('Convocatoria cancelada.');
          }}
        >
          <p className="text-sm text-slate-700">
            {call.status === 'OPEN'
              ? 'Los agricultores la verán como cancelada. Las participaciones recibidas se conservan, sin consolidado, y los productos quedan libres para otra convocatoria.'
              : 'El borrador no se podrá abrir. Los agricultores nunca lo vieron.'}
          </p>
        </ConfirmDialog>
      )}
    </AppShell>
  );
}

function CallFacts({ call }: { call: JointPurchaseCallDetail }) {
  const facts: [string, ReactNode][] = [
    ['Campaña', call.campaign?.name ?? '—'],
    ['Responsable', call.responsible?.name ?? '—'],
    ['Fecha límite', `${fmtDateTime(call.deadline_at)} (hora del servidor)`],
    ['Abierta el', call.opened_at ? fmtDateTime(call.opened_at) : 'Todavía no se abrió'],
  ];
  if (call.closed_at) facts.push(['Cerrada el', fmtDateTime(call.closed_at)]);
  if (call.cancelled_at) facts.push(['Cancelada el', fmtDateTime(call.cancelled_at)]);
  if (call.cancel_reason) facts.push(['Motivo de la cancelación', call.cancel_reason]);
  facts.push(['Participantes', participantsText(call.participant_count)]);
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 px-5 py-4 text-sm sm:grid-cols-2" data-testid="call-facts">
      {facts.map(([term, value]) => (
        <div key={term} className="flex min-w-0 gap-2">
          <dt className="shrink-0 text-slate-500">{term}:</dt>
          <dd className="min-w-0 text-slate-800 [overflow-wrap:anywhere]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function participantsText(count: number | null | undefined): string {
  if (count === null || count === undefined) return '—';
  return count === 1 ? '1 persona' : `${count} personas`;
}

function ProductsTable({ call }: { call: JointPurchaseCallDetail }) {
  const showTotals = call.status === 'OPEN';
  if (call.products.length === 0) return <DataState compact state="empty" title="Sin productos" description="El borrador todavía no tiene productos." />;
  return (
    <DataTable caption="Productos de la convocatoria" minWidth={showTotals ? 720 : 520}>
      <thead>
        <tr>
          <th>Producto</th>
          <th>Unidad</th>
          <th>Referencia</th>
          {showTotals && <th>Total solicitado</th>}
        </tr>
      </thead>
      <tbody>
        {call.products.map((product) => (
          <tr key={product.product_ref} data-testid={`call-product-${product.product_ref}`}>
            <td className="[overflow-wrap:anywhere]">{product.product_name}</td>
            <td>{product.unit ?? presentationUnit(product.base_unit)}</td>
            <td className="text-xs text-slate-700">{product.reference ? referenceText(product.reference, product.base_unit) : 'Del catálogo, sin referencia'}</td>
            {showTotals && (
              <td className="text-sm">
                {product.total?.total_quantity_base != null ? (
                  <>
                    <span className="tabular-nums">{quantityText(product.total.total_quantity_base, product.base_unit)}</span>
                    {product.total.participant_count != null && (
                      <span className="ml-1 text-xs text-slate-600">· {participantsText(product.total.participant_count)}</span>
                    )}
                  </>
                ) : (
                  <span className="text-xs text-slate-600" data-testid="hidden-total">
                    {hiddenTotalText(call.totals_threshold)}
                  </span>
                )}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

/** Tabla de participantes identificados: nombre, producto, cantidad solicitada, estado y hora de aceptación. Nada más. */
function ParticipantsTable({ participants, call, caption }: { participants: JointPurchaseCallParticipant[]; call: JointPurchaseCallDetail; caption: string }) {
  const unitOf = (ref: string, fallback: BaseUnit) => call.products.find((product) => product.product_ref === ref)?.base_unit ?? fallback;
  const nameOf = (ref: string, fallback?: string) => fallback ?? call.products.find((product) => product.product_ref === ref)?.product_name ?? '—';
  return (
    <DataTable caption={caption} minWidth={720}>
      <thead>
        <tr>
          <th>Nombre</th>
          <th>Producto</th>
          <th className="ui-num">Cantidad solicitada</th>
          <th>Estado</th>
          <th>Aceptada el</th>
        </tr>
      </thead>
      <tbody>
        {participants.flatMap((participant) => {
          const lines = participant.lines.length > 0 ? participant.lines : [null];
          return lines.map((line, index) => (
            <tr key={`${participant.participation_ref}-${line?.product_ref ?? 'none'}`} data-testid="participant-row">
              <td className="[overflow-wrap:anywhere]">{index === 0 ? participant.name : ''}</td>
              <td className="[overflow-wrap:anywhere]">{line ? nameOf(line.product_ref, line.product_name) : 'Sin productos'}</td>
              <td className="ui-num">{line ? quantityText(line.quantity_base, unitOf(line.product_ref, line.base_unit)) : '—'}</td>
              <td>{PARTICIPATION_STATUS_LABEL[participant.status] ?? participant.status}</td>
              <td>{fmtDateTime(participant.accepted_at)}</td>
            </tr>
          ));
        })}
      </tbody>
    </DataTable>
  );
}

/** Sólo con `can_view_participants` se piden los participantes; un 403 se explica con el mismo texto. */
function ParticipantsPanel({ call }: { call: JointPurchaseCallDetail }) {
  const allowed = call.can_view_participants === true;
  const [participants, setParticipants] = useState<JointPurchaseCallParticipant[] | null>(null);
  const [problem, setProblem] = useState<{ message: string; forbidden: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      setParticipants(await jointPurchaseCallsService.participants(call.id));
      setProblem(null);
    } catch (err) {
      const forbidden = (axios.isAxiosError(err) && err.response?.status === 403) || callErrorCode(err) === 'PARTICIPANTS_FORBIDDEN';
      setProblem({ message: forbidden ? PARTICIPANTS_FORBIDDEN_TEXT : callError(err, 'No fue posible cargar los participantes.'), forbidden });
    }
  }, [call.id]);

  useEffect(() => {
    if (allowed) void Promise.resolve().then(load);
  }, [allowed, load]);

  const open = call.status === 'OPEN';
  const title = open ? 'Participantes (lista provisional)' : 'Participantes (convocatoria cancelada, sin consolidado)';
  if (!allowed || problem?.forbidden) {
    return (
      <Section title="Participantes" testId="participants-panel">
        <div className="px-5 py-4">
          <Notice kind="info" compact>
            <span data-testid="participants-forbidden">{PARTICIPANTS_FORBIDDEN_TEXT}</span>
          </Notice>
          <p className="mt-2 text-xs text-slate-600">Número de participantes: {participantsText(call.participant_count)}.</p>
        </div>
      </Section>
    );
  }
  return (
    <Section title={title} note={open ? <span data-testid="provisional-note">{PROVISIONAL_NOTE}</span> : undefined} testId="participants-panel">
      {problem ? (
        <DataState compact state="error" description={problem.message} onRetry={() => void load()} />
      ) : !participants ? (
        <DataState compact state="loading" />
      ) : participants.length === 0 ? (
        <DataState compact state="empty" title="Sin participantes" description="Todavía nadie confirmó su participación." />
      ) : (
        <ParticipantsTable participants={participants} call={call} caption="Participantes de la convocatoria" />
      )}
    </Section>
  );
}

/** «Consolidado al cierre» (E2-D13): cantidades solicitadas hasta el corte; detalle por persona sólo con permiso. */
function ClosingPanel({ call }: { call: JointPurchaseCallDetail }) {
  const [closing, setClosing] = useState<JointPurchaseCallClosing | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setClosing(await jointPurchaseCallsService.closing(call.id));
      setProblem(null);
    } catch (err) {
      setProblem(callError(err, 'No fue posible cargar el consolidado al cierre.'));
    }
  }, [call.id]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  return (
    <Section
      title="Consolidado al cierre"
      note="Cantidades solicitadas hasta el corte, con la hora del servidor. No cambia después del cierre."
      testId="closing-panel"
    >
      {problem ? (
        <DataState compact state="error" description={problem} onRetry={() => void load()} />
      ) : !closing ? (
        <DataState compact state="loading" />
      ) : (
        <div className="space-y-4 px-5 py-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <KpiTile label="Corte" value={fmtDateTime(closing.cutoff_at)} note={`Cerrada el ${fmtDateTime(closing.closed_at)}`} testId="closing-cutoff" />
            <KpiTile
              label="Modo de cierre"
              value={CLOSE_MODE_LABEL[closing.mode] ?? closing.mode}
              note={closing.closed_by ? `Por ${closing.closed_by.name}` : 'Por el servidor'}
              testId="closing-mode"
            />
            <KpiTile label="Participantes" value={participantsText(closing.participant_count)} note="Cada persona cuenta una vez." testId="closing-participants" />
          </div>
          <p className="text-sm text-slate-700" data-testid="not-a-purchase">
            {NOT_A_PURCHASE_TEXT}
          </p>
          {closing.lines.length === 0 ? (
            <DataState compact state="empty" title="Sin cantidades solicitadas" description="Nadie tenía una participación vigente al corte." />
          ) : (
            <DataTable caption="Cantidades solicitadas por producto" minWidth={560}>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th className="ui-num">Cantidad solicitada (total)</th>
                  <th className="ui-num">Personas</th>
                </tr>
              </thead>
              <tbody>
                {closing.lines.map((line) => (
                  <tr key={line.product_ref} data-testid={`closing-line-${line.product_ref}`}>
                    <td className="[overflow-wrap:anywhere]">{line.product_name}</td>
                    <td className="ui-num">
                      {line.total_quantity_base != null ? (
                        quantityText(line.total_quantity_base, line.base_unit)
                      ) : (
                        <span className="text-xs text-slate-600">{hiddenTotalText(call.totals_threshold)}</span>
                      )}
                    </td>
                    <td className="ui-num">{line.participant_count ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
          {Array.isArray(closing.participants) ? (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-900">Detalle por participante</h3>
              {closing.participants.length === 0 ? (
                <DataState compact state="empty" title="Sin participantes" description="Nadie tenía una participación vigente al corte." />
              ) : (
                <ParticipantsTable participants={closing.participants} call={call} caption="Detalle por participante al cierre" />
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-600" data-testid="closing-detail-hidden">
              El detalle por participante sólo lo ve el responsable de esta convocatoria.
            </p>
          )}
        </div>
      )}
    </Section>
  );
}

/** Confirmación (y motivo, si aplica) antes de una acción de estado; el error del servidor se muestra aquí mismo. */
function ConfirmDialog({
  title,
  actionLabel,
  confirmText,
  variant = 'primary',
  withReason = false,
  children,
  onClose,
  onConfirm,
}: {
  title: string;
  actionLabel: string;
  confirmText: string;
  variant?: 'primary' | 'danger';
  withReason?: boolean;
  children: ReactNode;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = confirmed && (!withReason || reason.trim().length > 0) && !busy;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
    } catch (err) {
      setError(callError(err, 'No fue posible completar la acción.'));
      setBusy(false);
    }
  };

  return (
    <Modal title={title} onClose={onClose} size="lg">
      <div className="space-y-4">
        {children}
        {error && <Notice kind="error">{error}</Notice>}
        {withReason && (
          <div>
            <label className={labelClass} htmlFor="call-reason">
              Motivo
            </label>
            <textarea
              id="call-reason"
              className={inputClass}
              maxLength={MAX_REASON}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              aria-describedby="call-reason-count"
            />
            <p id="call-reason-count" className="mt-1 text-xs text-slate-500">
              {reason.length} de {MAX_REASON} caracteres. Queda en el historial y en la bitácora.
            </p>
          </div>
        )}
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" className="mt-0.5 shrink-0" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
          <span className="min-w-0 [overflow-wrap:anywhere]">{confirmText}</span>
        </label>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Volver
          </Button>
          <Button variant={variant} onClick={() => void submit()} disabled={!ready}>
            {busy ? 'Guardando…' : actionLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
