import { CallCard, CallTotal, LockLine, ParticipantsTable, ProductLines, type ParticipantEntry } from '../../components/b/call-ui';
import { DataState, Notice } from '../../components/ui';
import {
  fmtWhen,
  NOT_A_PURCHASE_TEXT,
  PARTICIPANTS_FORBIDDEN_TEXT,
  PARTICIPANTS_REVOKED_TEXT,
  participantsCountText,
  PENDING_CONSENT_HOW,
  pendingConsentDetailText,
  pendingConsentText,
  peopleText,
  unitText,
  WHY_VISIBLE_TEXT,
} from '../../lib/joint-purchase-call-text';
import type { JointPurchaseCallClosing, JointPurchaseCallDetail, JointPurchaseCallParticipants } from '../../types/joint-purchase-calls';

/** Recuento de participaciones con una autorización anterior, junto a los totales. Nunca nombres. */
export function PendingConsentLine({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <LockLine>
      <span data-testid="pending-consent-count">{pendingConsentText(count)}</span> <span className="text-sm">{PENDING_CONSENT_HOW}</span>
    </LockLine>
  );
}

function PendingConsentNotice({ count, notice }: { count: number; notice: string | null }) {
  if (count <= 0) return null;
  return (
    <div className="pt-3">
      <Notice kind="warn" compact>
        <span data-testid="pending-consent-notice">{notice ?? pendingConsentDetailText(count)}</span> <span>{PENDING_CONSENT_HOW}</span>
      </Notice>
    </div>
  );
}

/** El acceso se perdió mientras la página mostraba participantes (E4 §6.4). */
function RevokedNotice() {
  return (
    <div className="pt-3">
      <Notice kind="warn" compact>
        <span data-testid="participants-revoked">{PARTICIPANTS_REVOKED_TEXT}</span>
      </Notice>
    </div>
  );
}

function rowsFooter(participants: ParticipantEntry[]): string {
  const lines = participants.reduce((sum, participant) => sum + Math.max(participant.lines.length, 1), 0);
  const people = peopleText(participants.length);
  const head = `${lines === 1 ? '1 pedido' : `${lines} pedidos`} de ${people}.`;
  return lines > participants.length ? `${head} Una persona puede aparecer en varias filas.` : head;
}

/**
 * «Quién pidió» de una convocatoria abierta o cancelada (láminas 11, 13, 14, 16,
 * 17, 20). La Directiva ve sólo cuántas personas participan; la
 * Administración (`can_view_participants`) ve nombres y cantidades de quienes
 * lo autorizaron y el aviso de las que esperan la autorización nueva.
 */
export function ParticipantsPanel({
  call,
  data,
  problem,
  revoked,
  onRetry,
}: {
  call: JointPurchaseCallDetail;
  data: JointPurchaseCallParticipants | null;
  problem: string | null;
  revoked: boolean;
  onRetry: () => void;
}) {
  const allowed = call.can_view_participants;
  const open = call.status === 'OPEN';
  const productName = (ref: string, fallback: string) => fallback || call.products.find((product) => product.product_ref === ref)?.name || '—';
  if (revoked || !allowed) {
    return (
      <CallCard title="Quién pidió" testId="participants-panel">
        {revoked ? (
          <RevokedNotice />
        ) : !open ? (
          <LockLine icon="info" testId="participants-cancelled">
            No hay consolidado: la convocatoria se canceló antes del cierre.
          </LockLine>
        ) : (
          <LockLine>
            <span className="text-ink" data-testid="participants-forbidden">
              {PARTICIPANTS_FORBIDDEN_TEXT}
            </span>
          </LockLine>
        )}
        {open && (
          <p className="pt-2 text-sm text-ink-muted" data-testid="participants-count">
            {participantsCountText(call.participant_count)}
          </p>
        )}
      </CallCard>
    );
  }
  const notice = data?.notice ?? null;
  const pending = data?.pending_consent_count ?? 0;
  return (
    <CallCard
      title="Quién pidió"
      note={notice ? <span data-testid="provisional-note">{notice}</span> : open ? undefined : 'Sin efecto: se canceló antes del cierre'}
      testId="participants-panel"
    >
      {problem ? (
        <div className="pt-3">
          <DataState compact state="error" description={problem} onRetry={onRetry} />
        </div>
      ) : !data ? (
        <div className="pt-3">
          <DataState compact state="loading" />
        </div>
      ) : (
        <>
          {data.participants.length > 0 && <LockLine>{WHY_VISIBLE_TEXT}</LockLine>}
          <PendingConsentNotice count={pending} notice={data.pending_consent_notice} />
          {data.participants.length === 0 ? (
            pending > 0 ? null : <LockLine icon="info">Todavía nadie confirmó su participación.</LockLine>
          ) : (
            <>
              <ParticipantsTable caption="Participantes de la convocatoria" participants={data.participants} productName={productName} />
              <p className="border-t border-line pt-3 text-sm text-ink-muted">{rowsFooter(data.participants)}</p>
            </>
          )}
        </>
      )}
    </CallCard>
  );
}

/**
 * «Consolidado al cierre» (E2-D13) y «Detalle por participante» (láminas 12, 18
 * y 19): cantidades solicitadas hasta el corte, fijadas al cierre. Los totales
 * siguen la regla T; el detalle por persona sólo para la Administración.
 */
export function ClosingPanel({
  call,
  data,
  problem,
  revoked,
  onRetry,
}: {
  call: JointPurchaseCallDetail;
  data: JointPurchaseCallClosing | null;
  problem: string | null;
  revoked: boolean;
  onRetry: () => void;
}) {
  const closing = data;
  const productName = (ref: string, fallback: string) => fallback || call.products.find((product) => product.product_ref === ref)?.name || '—';
  const full = call.can_view_participants && closing?.can_view_participants === true && Array.isArray(closing.participants);
  return (
    <div className="space-y-5" data-testid="closing-panel">
      <CallCard
        title="Consolidado al cierre"
        note={
          closing ? (
            <>
              <span data-testid="closing-fixed">Fijado al cierre · </span>
              <span data-testid="closing-cutoff">Pedidos recibidos hasta el {fmtWhen(closing.cutoff_at, 'always')}</span>
            </>
          ) : undefined
        }
      >
        {problem ? (
          <div className="pt-3">
            <DataState compact state="error" description={problem} onRetry={onRetry} />
          </div>
        ) : !closing ? (
          <div className="space-y-3 pt-3">
            {revoked && <RevokedNotice />}
            <DataState compact state="loading" />
          </div>
        ) : (
          <>
            {closing.lines.length === 0 ? (
              <div className="pt-3">
                <DataState compact state="empty" title="Sin cantidades solicitadas" description="Nadie tenía una participación vigente al corte." />
              </div>
            ) : (
              <ProductLines
                caption="Cantidades solicitadas por producto"
                valueHeader="Cantidad solicitada (total)"
                lines={closing.lines.map((line) => ({
                  key: line.product_ref,
                  testId: `closing-line-${line.product_ref}`,
                  name: line.product_name,
                  sub: line.participant_count > 0 ? `${unitText(line.base_unit)} · ${peopleText(line.participant_count)}` : `${unitText(line.base_unit)} · Nadie lo pidió`,
                  value: <CallTotal total={line} baseUnit={line.base_unit} />,
                }))}
              />
            )}
            <PendingConsentLine count={closing.pending_consent_count} />
            <p className="border-t border-line pt-3 text-sm text-ink-muted">
              <span className="sr-only">
                <span data-testid="closing-label">{closing.label}</span>.{' '}
              </span>
              <span data-testid="not-a-purchase">{NOT_A_PURCHASE_TEXT}</span>
            </p>
          </>
        )}
      </CallCard>
      {closing && (
        <CallCard title="Detalle por participante" testId="closing-detail">
          {revoked ? (
            <RevokedNotice />
          ) : full && closing.participants ? (
            <>
              {closing.participants.length > 0 && <LockLine>{WHY_VISIBLE_TEXT}</LockLine>}
              <PendingConsentNotice count={closing.pending_consent_count} notice={closing.pending_consent_notice} />
              {closing.participants.length === 0 ? (
                closing.pending_consent_count > 0 ? null : <LockLine icon="info">Nadie tenía una participación vigente al corte.</LockLine>
              ) : (
                <>
                  <ParticipantsTable caption="Detalle por participante al cierre" participants={closing.participants} productName={productName} />
                  <p className="border-t border-line pt-3 text-sm text-ink-muted">{rowsFooter(closing.participants)}</p>
                </>
              )}
            </>
          ) : (
            <LockLine testId="closing-detail-hidden">
              <span className="text-ink">{PARTICIPANTS_FORBIDDEN_TEXT}</span> No se muestran nombres ni cantidades de cada persona.
            </LockLine>
          )}
        </CallCard>
      )}
    </div>
  );
}
