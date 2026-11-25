import { AccessRules, CallCard, DisclosureLink } from '../../components/b/call-ui';
import { Avatar, Button, Chip, DataState } from '../../components/ui';
import { fmtWhen, GRANT_LABEL, RETIRED_GRANTS_NOTE, RETIRED_GRANTS_TITLE, ROLE_LABEL } from '../../lib/joint-purchase-call-text';
import type {
  JointPurchaseCallCollaboratorGrant,
  JointPurchaseCallCollaborators,
  JointPurchaseCallDetail,
  JointPurchaseCallGrant,
  JointPurchaseCallUserRef,
} from '../../types/joint-purchase-calls';
import { accessActionText, type RevokedGrant } from './call-detail.helpers';

function grantLine(grant: JointPurchaseCallCollaboratorGrant, userId: string | null): string {
  if (grant.status === 'PENDING_REVIEW' || grant.status === 'SUSPENDED') return `Lo concedió ${grant.granted_by.name} el ${fmtWhen(grant.granted_at)}`;
  return grant.granted_by.user_ref === userId ? `Usted lo concedió el ${fmtWhen(grant.granted_at)}` : `Concedido por ${grant.granted_by.name} el ${fmtWhen(grant.granted_at)}`;
}

/** Quién más puede administrar la convocatoria (E4 §2: sólo `MANAGE`). */
export function CollaboratorsSection({
  call,
  view,
  problem,
  userId,
  revokedGrants,
  userName,
  onRetry,
  onGrant,
  onRevoke,
  onReview,
}: {
  call: JointPurchaseCallDetail;
  view: JointPurchaseCallCollaborators | null;
  problem: string | null;
  userId: string | null;
  revokedGrants: RevokedGrant[];
  userName: string;
  onRetry: () => void;
  onGrant: () => void;
  onRevoke: (user: JointPurchaseCallUserRef, grant: JointPurchaseCallGrant) => void;
  onReview: (user: JointPurchaseCallUserRef, grant: JointPurchaseCallGrant, decision: 'CONFIRM' | 'RETIRE') => void;
}) {
  const canGrant = view?.can_grant === true;
  const canReview = view?.can_review === true;
  const grantable = canGrant && call.status !== 'CANCELLED';
  const people = [...(view?.collaborators ?? [])].sort((a, b) => Number(b.user_ref === userId) - Number(a.user_ref === userId));
  const allGrants = people.flatMap((person) => person.grants);
  const pending = allGrants.filter((grant) => grant.status === 'PENDING_REVIEW').length;
  const suspended = allGrants.filter((grant) => grant.status === 'SUSPENDED').length;
  const retired = view?.retired_grants ?? [];
  const mine = people.some((person) => person.user_ref === userId) || revokedGrants.length > 0;
  const final = call.status === 'CLOSED' || call.status === 'CANCELLED';
  if (view && final && !call.is_responsible && people.length === 0 && revokedGrants.length === 0 && !problem) return null;

  const title =
    call.delegations_suspended && suspended > 0
      ? `Permisos suspendidos · ${suspended}`
      : canReview && pending > 0
        ? `Permisos por revisar · ${pending}`
        : !call.is_responsible && mine
          ? 'Su acceso'
          : 'Quién más puede administrarla';
  const pendingReviews = call.is_responsible ? call.pending_delegation_reviews : 0;
  const emptyText = call.is_responsible
    ? final
      ? 'Nadie más puede administrarla.'
      : 'Solo usted.'
    : mine
      ? 'No hay permisos vigentes en esta convocatoria.'
      : 'Sólo la persona responsable la administra.';

  return (
    <CallCard title={title} testId="collaborators-panel">
      {problem ? (
        <div className="pt-3">
          <DataState compact state="error" description={problem} onRetry={onRetry} />
        </div>
      ) : !view ? (
        <div className="pt-3">
          <DataState compact state="loading" />
        </div>
      ) : (
        <div className="space-y-1">
          {pendingReviews > 0 && (
            <p className="pt-3 text-sm text-ink-muted" data-testid="pending-delegation-reviews">
              {pendingReviews === 1
                ? '1 permiso concedido por la responsable anterior espera su revisión: confírmelo o retírelo. Mientras tanto no se ejerce.'
                : `${pendingReviews} permisos concedidos por la responsable anterior esperan su revisión: confírmelos o retírelos. Mientras tanto no se ejercen.`}
            </p>
          )}
          {people.length === 0 ? (
            revokedGrants.length === 0 && (
              <p className="flex items-center gap-2 pt-3 text-base text-ink-muted" data-testid="collaborators-empty">
                {emptyText}
              </p>
            )
          ) : (
            <ul className="divide-y divide-line" aria-label="Personas que pueden administrar esta convocatoria">
              {people.map((person) => {
                const self = person.user_ref === userId;
                return (
                  <li key={person.user_ref} className="flex gap-3 py-4" data-testid={`collaborator-${person.user_ref}`}>
                    <Avatar name={person.name} tone="soft" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-ink [overflow-wrap:anywhere]">
                        {person.name}
                        {self ? ' (usted)' : ''}
                        {person.role && <span className="font-normal text-ink-muted"> · {ROLE_LABEL[person.role] ?? person.role}</span>}
                      </p>
                      <ul className="mt-2 space-y-3">
                        {person.grants.map((grant) => (
                          <li key={grant.grant} className="space-y-1.5" data-testid={`collaborator-grant-${person.user_ref}-${grant.grant}`}>
                            <Chip tone={grant.status === 'PENDING_REVIEW' ? 'attention' : grant.status === 'SUSPENDED' ? 'neutral' : 'positive'} size="md">
                              {GRANT_LABEL[grant.grant] ?? grant.label}
                            </Chip>
                            <p className="text-xs text-ink-muted">{grantLine(grant, userId)}</p>
                            {grant.status !== 'IN_FORCE' && (
                              <p className="text-xs font-semibold text-caution" data-testid={`grant-status-${person.user_ref}-${grant.grant}`}>
                                {grant.status === 'PENDING_REVIEW'
                                  ? 'Suspendido: espera la revisión de la actual responsable.'
                                  : 'Suspendido: la responsable no está habilitada.'}
                              </p>
                            )}
                            {grant.status === 'PENDING_REVIEW' && canReview ? (
                              <div className="flex flex-wrap gap-2 pt-1">
                                <Button
                                  size="sm"
                                  aria-label={`Confirmar «${GRANT_LABEL[grant.grant]}» de ${person.name}`}
                                  onClick={() => onReview({ user_ref: person.user_ref, name: person.name }, grant.grant, 'CONFIRM')}
                                >
                                  Confirmar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  aria-label={`Retirar «${GRANT_LABEL[grant.grant]}» a ${person.name}`}
                                  onClick={() => onReview({ user_ref: person.user_ref, name: person.name }, grant.grant, 'RETIRE')}
                                >
                                  Retirar
                                </Button>
                              </div>
                            ) : self ? (
                              <div className="pt-1">
                                <Button size="sm" variant="secondary" aria-label="Renunciar a este permiso" onClick={() => onRevoke({ user_ref: person.user_ref, name: person.name }, grant.grant)}>
                                  Renunciar
                                </Button>
                              </div>
                            ) : (
                              canGrant && (
                                <div className="pt-1">
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    aria-label={`Retirar «${GRANT_LABEL[grant.grant]}» a ${person.name}`}
                                    onClick={() => onRevoke({ user_ref: person.user_ref, name: person.name }, grant.grant)}
                                  >
                                    Retirar
                                  </Button>
                                </div>
                              )
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {revokedGrants.length > 0 && (
            <ul className={people.length > 0 ? 'divide-y divide-line border-t border-line' : 'divide-y divide-line'} aria-label="Sus permisos retirados">
              {revokedGrants.map((entry) => (
                <li key={entry.grant} className="flex gap-3 py-4" data-testid={`my-revoked-${entry.grant}`}>
                  <Avatar name={userName || 'Usted'} tone="soft" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="font-semibold text-ink [overflow-wrap:anywhere]">{userName ? `${userName} (usted)` : 'Usted'}</p>
                    <Chip size="md">{GRANT_LABEL[entry.grant]}</Chip>
                    <p className="text-xs text-ink-muted">{entry.self ? `Renunció el ${fmtWhen(entry.at)}` : `Retirado por ${entry.actor.name} el ${fmtWhen(entry.at)}`}</p>
                  </div>
                </li>
              ))}
              {people.length === 0 && (
                <li className="sr-only" data-testid="collaborators-empty">
                  {emptyText}
                </li>
              )}
            </ul>
          )}
          {grantable && (
            <div className="pt-2">
              <Button variant="secondary" block onClick={onGrant}>
                Conceder «{GRANT_LABEL.MANAGE}»
              </Button>
            </div>
          )}
          {canGrant && call.status === 'CANCELLED' && <p className="pt-2 text-xs text-ink-muted">Una convocatoria cancelada no admite permisos nuevos; los vigentes se pueden retirar.</p>}
          {retired.length > 0 && (
            <DisclosureLink label={`Ver ${RETIRED_GRANTS_TITLE.toLowerCase()} (${retired.length})`} testId="retired-grants">
              <div className="space-y-2 pb-2">
                <p className="text-sm text-ink-muted">{RETIRED_GRANTS_NOTE}</p>
                <ol className="space-y-2" aria-label={RETIRED_GRANTS_TITLE}>
                  {retired.map((entry, index) => (
                    <li key={`${entry.user.user_ref}-${entry.granted_at}-${index}`} className="text-sm" data-testid="retired-grant">
                      <span className="font-semibold text-ink">«{entry.label || GRANT_LABEL.PARTICIPANTS}»</span>
                      <span className="text-ink"> · {entry.user.name}</span>
                      <span className="text-xs text-ink-muted">
                        {' '}
                        · {entry.granted_by ? `concedido por ${entry.granted_by.name}` : 'concedido por el sistema a la responsable'} · {fmtWhen(entry.granted_at, 'always')}
                      </span>
                      <p className="text-xs text-ink-muted">{entry.notice}</p>
                    </li>
                  ))}
                </ol>
              </div>
            </DisclosureLink>
          )}
          <DisclosureLink label="Ver historial de permisos" testId="access-history">
            {view.history.length === 0 ? (
              <p className="pb-2 text-sm text-ink-muted">Nadie concedió ni retiró permisos en esta convocatoria.</p>
            ) : (
              <ol className="space-y-2 pb-2" aria-label="Historial de permisos">
                {view.history.map((entry, index) => (
                  <li key={`${entry.at}-${index}`} className="text-sm" data-testid="access-history-event">
                    <span className="font-semibold text-ink">{accessActionText(entry.action, entry.user.user_ref === entry.actor.user_ref)}</span>
                    <span className="text-ink">
                      {' '}
                      «{GRANT_LABEL[entry.grant] ?? entry.grant}» · {entry.user.name}
                    </span>
                    <span className="text-xs text-ink-muted">
                      {' '}
                      · por {entry.actor.name} · {fmtWhen(entry.at, 'always')}
                    </span>
                    {entry.retired && (
                      <p className="text-xs text-ink-muted" data-testid="access-history-retired">
                        {entry.notice ?? RETIRED_GRANTS_NOTE}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </DisclosureLink>
          <AccessRules />
        </div>
      )}
    </CallCard>
  );
}
