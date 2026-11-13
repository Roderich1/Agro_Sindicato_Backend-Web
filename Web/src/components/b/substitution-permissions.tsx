import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  callError,
  fmtDay,
  fmtWhen,
  ROLE_LABEL,
  SUBSTITUTION_PERMISSION_DESCRIPTION,
  SUBSTITUTION_PERMISSION_LABEL,
  SUBSTITUTION_PERMISSION_WHO,
} from '../../lib/joint-purchase-call-text';
import { jointPurchaseCallsService } from '../../services/joint-purchase-calls.service';
import type { EligibleResponsible, SubstitutionPermissions } from '../../types/joint-purchase-calls';
import { Button, buttonClassFor, Checkbox, ConfirmDialog, DataState, Dialog, ICON, Icon, Notice, Select, Textarea } from '../ui';

const MAX_REASON = 280;
const USERS_PATH = '/users';

type Revoke = { userRef: string; name: string; self: boolean };

export interface SubstitutionPermissionsPanelProps {
  /** `user.id` de la sesión: marca «(usted)» y permite renunciar al propio permiso. */
  userId: string | null;
  /**
   * `manage` (Usuarios, láminas 31 y 44): conceder y retirar, sólo si el servidor
   * responde `can_grant` (ADMINISTRADOR habilitada). `read` (Compras conjuntas):
   * sólo consulta; quien lo tiene puede renunciar al suyo. El servidor revalida todo.
   */
  mode?: 'manage' | 'read';
  /** `ink`: tarjeta oscura (lámina 31, escritorio); `surface`: tarjeta blanca (lámina 44). `plain`: sin tarjeta (dentro de un diálogo). */
  tone?: 'ink' | 'surface' | 'plain';
  /** Muestra el título «Permiso «Sustituir responsable»» (un `<h2>`); `false` dentro de un diálogo que ya lo titula. */
  showTitle?: boolean;
  /** Tras cargar o cambiar: el padre puede actualizar su resumen (p. ej. la franja de la lámina 09). */
  onChange?: (data: SubstitutionPermissions) => void;
  testId?: string;
}

/**
 * P-A A1 (§12): el permiso del sindicato «Sustituir responsable». Lo incrusta
 * la sesión C en Usuarios (modo `manage`) y Compras conjuntas lo abre en modo
 * `read` desde su franja. Quién lo tiene y su historial no llevan datos de
 * agricultores. Conceder exige persona concreta (nunca quien concede ni un rol),
 * motivo y confirmación; retirar o renunciar, confirmación y motivo opcional.
 */
export function SubstitutionPermissionsPanel({ userId, mode = 'manage', tone = 'surface', showTitle = true, onChange, testId = 'substitution-permissions' }: SubstitutionPermissionsPanelProps) {
  const [view, setView] = useState<SubstitutionPermissions | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [granting, setGranting] = useState(false);
  const [revoke, setRevoke] = useState<Revoke | null>(null);
  const [busy, setBusy] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const aliveRef = useRef(true);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const show = useCallback((data: SubstitutionPermissions) => {
    setView(data);
    onChangeRef.current?.(data);
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await jointPurchaseCallsService.substitutionPermissions();
      if (!aliveRef.current) return;
      show(data);
      setProblem(null);
    } catch (err) {
      if (aliveRef.current) setProblem(callError(err, 'No fue posible cargar el permiso «Sustituir responsable».'));
    }
  }, [show]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const manage = mode === 'manage' && view?.can_grant === true;
  const dark = tone === 'ink';
  const muted = dark ? 'text-on-ink-muted' : 'text-ink-muted';
  const strong = dark ? 'text-white' : 'text-ink';
  const shell =
    tone === 'ink' ? 'ui-on-ink rounded-card bg-ink px-5 py-6 text-white sm:px-7' : tone === 'surface' ? 'rounded-card border border-line bg-surface px-5 py-6 shadow-card sm:px-7' : '';

  const confirmRevoke = async (reason: string) => {
    if (!revoke) return;
    setBusy(true);
    setRevokeError(null);
    try {
      const data = await jointPurchaseCallsService.revokeSubstitution(revoke.userRef, reason || null);
      show(data);
      setMessage(revoke.self ? `Renunció al permiso «${SUBSTITUTION_PERMISSION_LABEL}».` : `Permiso «${SUBSTITUTION_PERMISSION_LABEL}» retirado a ${revoke.name}.`);
      setRevoke(null);
    } catch (err) {
      setRevokeError(callError(err, 'No fue posible retirar el permiso.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`min-w-0 ${shell}`} data-testid={testId} aria-label={showTitle ? undefined : `Permiso «${SUBSTITUTION_PERMISSION_LABEL}»`} aria-labelledby={showTitle ? `${testId}-title` : undefined}>
      {showTitle && (
        <h2 id={`${testId}-title`} className={`text-xl font-bold leading-tight sm:text-2xl ${strong}`}>
          Permiso «{SUBSTITUTION_PERMISSION_LABEL}»
        </h2>
      )}
      <p className={`${showTitle ? 'mt-2' : ''} text-sm leading-relaxed ${muted}`}>{SUBSTITUTION_PERMISSION_DESCRIPTION}</p>
      {message && (
        <div className="mt-3">
          <Notice kind="ok" compact>
            {message}
          </Notice>
        </div>
      )}
      {problem ? (
        <div className="mt-3">
          <DataState compact state="error" description={problem} onRetry={() => void load()} />
        </div>
      ) : !view ? (
        <div className="mt-3">
          <DataState compact state="loading" />
        </div>
      ) : (
        <>
          {view.holders.length === 0 ? (
            <p className={`mt-4 border-t pt-4 text-sm ${dark ? 'border-ink-raised' : 'border-line'} ${muted}`} data-testid="substitution-holders-empty">
              Ninguna persona tiene hoy este permiso.
            </p>
          ) : (
            <ul className={`mt-4 divide-y border-t ${dark ? 'divide-ink-raised border-ink-raised' : 'divide-line border-line'}`} aria-label="Personas con el permiso">
              {view.holders.map((holder) => {
                const self = holder.user_ref === userId;
                const canRevoke = manage || self;
                return (
                  <li key={holder.user_ref} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-3" data-testid={`substitution-holder-${holder.user_ref}`}>
                    <div className="min-w-0 flex-1">
                      <p className={`font-semibold [overflow-wrap:anywhere] ${strong}`}>
                        {holder.name}
                        {self ? ' (usted)' : ''}
                        {holder.role && <span className={`font-normal ${muted}`}> · {ROLE_LABEL[holder.role] ?? holder.role}</span>}
                      </p>
                      <p className={`text-xs ${muted}`}>
                        Concedido el {fmtDay(holder.granted_at)} por {holder.granted_by.name}
                      </p>
                      {holder.reason && <p className={`text-xs [overflow-wrap:anywhere] ${muted}`}>Motivo: {holder.reason}</p>}
                      {!holder.eligible && (
                        <p className={`mt-1 text-xs font-semibold ${dark ? 'text-lime' : 'text-caution'}`}>No habilitada: el permiso no se ejerce.</p>
                      )}
                    </div>
                    {canRevoke && (
                      <Button
                        size="sm"
                        variant={dark ? 'on-dark' : 'secondary'}
                        aria-label={self ? 'Renunciar al permiso' : `Retirar el permiso a ${holder.name}`}
                        onClick={() => {
                          setRevokeError(null);
                          setRevoke({ userRef: holder.user_ref, name: holder.name, self });
                        }}
                      >
                        {self ? 'Renunciar' : 'Retirar'}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {manage && (
            <div className="mt-3">
              <Button variant={dark ? 'accent' : 'secondary'} block onClick={() => setGranting(true)} data-testid="substitution-grant-button">
                Conceder el permiso
              </Button>
            </div>
          )}
          {mode === 'read' && view.can_grant && (
            <p className={`mt-3 text-sm ${muted}`}>
              Usted puede concederlo o retirarlo en{' '}
              <Link to={USERS_PATH} className="font-semibold text-link underline underline-offset-2">
                Usuarios
              </Link>
              .
            </p>
          )}
          <p className={`mt-3 text-xs leading-relaxed ${muted}`}>{SUBSTITUTION_PERMISSION_WHO}</p>
          <details className="group mt-2" data-testid="substitution-history">
            <summary
              className={`inline-flex min-h-11 cursor-pointer list-none items-center gap-1 text-sm font-semibold underline underline-offset-2 [&::-webkit-details-marker]:hidden ${dark ? 'text-lime' : 'text-link'}`}
            >
              <span className="group-open:hidden">Ver el historial del permiso</span>
              <span className="hidden group-open:inline">Ocultar el historial del permiso</span>
            </summary>
            {view.history.length === 0 ? (
              <p className={`py-2 text-sm ${muted}`}>Nadie concedió ni retiró este permiso.</p>
            ) : (
              <ol className="space-y-2 py-2" aria-label="Historial del permiso">
                {view.history.map((entry, index) => (
                  <li key={`${entry.at}-${index}`} className="text-sm" data-testid="substitution-history-event">
                    <span className={`font-semibold ${strong}`}>
                      {entry.action === 'GRANTED' ? 'Concedido' : entry.user.user_ref === entry.actor.user_ref ? 'Renuncia' : 'Retirado'}
                    </span>
                    <span className={strong}> · {entry.user.name}</span>
                    <span className={`text-xs ${muted}`}>
                      {' '}
                      · por {entry.actor.name} · {fmtWhen(entry.at, 'always')}
                    </span>
                    {entry.reason && <p className={`text-xs [overflow-wrap:anywhere] ${muted}`}>Motivo: {entry.reason}</p>}
                  </li>
                ))}
              </ol>
            )}
          </details>
        </>
      )}
      {granting && view && (
        <GrantSubstitutionDialog
          userId={userId}
          holders={view.holders.map((holder) => holder.user_ref)}
          onClose={() => setGranting(false)}
          onDone={(data, name) => {
            setGranting(false);
            show(data);
            setMessage(`Permiso «${SUBSTITUTION_PERMISSION_LABEL}» concedido a ${name}.`);
          }}
        />
      )}
      {revoke && (
        <ConfirmDialog
          tone="danger"
          title={revoke.self ? 'Renunciar al permiso' : 'Retirar el permiso'}
          confirmLabel={revoke.self ? 'Renunciar' : 'Retirar el permiso'}
          reason={{ required: false, maxLength: MAX_REASON, help: 'Opcional. Queda en el historial y en la bitácora.' }}
          acknowledgement={
            revoke.self
              ? `Confirmo que renuncio al permiso «${SUBSTITUTION_PERMISSION_LABEL}».`
              : `Confirmo que retiro el permiso «${SUBSTITUTION_PERMISSION_LABEL}» a ${revoke.name}.`
          }
          busy={busy}
          error={revokeError}
          onConfirm={(reason) => void confirmRevoke(reason)}
          onCancel={() => setRevoke(null)}
          testId="substitution-revoke-dialog"
        >
          <p>
            {revoke.self ? 'Dejará de poder' : `${revoke.name} dejará de poder`} nombrar a otra responsable en las convocatorias cuya responsable ya no está
            habilitada. Lo hecho antes no cambia.
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}

function GrantSubstitutionDialog({
  userId,
  holders,
  onClose,
  onDone,
}: {
  userId: string | null;
  holders: string[];
  onClose: () => void;
  onDone: (data: SubstitutionPermissions, name: string) => void;
}) {
  const [users, setUsers] = useState<EligibleResponsible[] | null>(null);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [userRef, setUserRef] = useState('');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    try {
      setUsers(await jointPurchaseCallsService.eligibleResponsibles());
      setUsersError(null);
    } catch (err) {
      setUsersError(callError(err, 'No fue posible cargar los usuarios de la Directiva y la Administración.'));
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadUsers);
  }, [loadUsers]);

  // Nunca quien concede ni quien ya lo tiene (el servidor responde 422 GRANTEE_NOT_ELIGIBLE).
  const candidates = (users ?? []).filter((user) => user.user_ref !== userId && !holders.includes(user.user_ref));
  const chosen = candidates.find((user) => user.user_ref === userRef) ?? null;
  const ready = chosen !== null && reason.trim().length > 0 && confirmed && !busy;

  const submit = async () => {
    if (!ready || !chosen) return;
    setBusy(true);
    setError(null);
    try {
      onDone(await jointPurchaseCallsService.grantSubstitution(chosen.user_ref, reason.trim()), chosen.name);
    } catch (err) {
      setError(callError(err, 'No fue posible conceder el permiso.'));
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={`Conceder «${SUBSTITUTION_PERMISSION_LABEL}»`}
      onClose={onClose}
      dirty={reason.length > 0 || userRef !== ''}
      busy={busy}
      hideCloseButton
      testId="substitution-grant-dialog"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Volver
          </Button>
          <Button onClick={() => void submit()} disabled={!ready} busy={busy}>
            Conceder el permiso
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-ink-muted">{SUBSTITUTION_PERMISSION_DESCRIPTION}</p>
        {usersError ? (
          <DataState compact state="error" description={usersError} onRetry={() => void loadUsers()} />
        ) : users && candidates.length === 0 ? (
          <DataState compact state="empty" title="Sin personas disponibles" description="No hay otra persona activa de la Directiva o la Administración sin el permiso." />
        ) : (
          <Select
            label="Persona"
            help="Una persona concreta, distinta de usted."
            value={userRef}
            disabled={!users}
            onChange={(event) => {
              setUserRef(event.target.value);
              setConfirmed(false);
            }}
          >
            <option value="">{users ? 'Seleccione…' : 'Cargando…'}</option>
            {candidates.map((user) => (
              <option key={user.user_ref} value={user.user_ref}>
                {user.name}
                {ROLE_LABEL[user.role] ? ` · ${ROLE_LABEL[user.role]}` : ''}
              </option>
            ))}
          </Select>
        )}
        <Textarea
          label="Motivo"
          help="Obligatorio. Queda en el historial y en la bitácora."
          maxLength={MAX_REASON}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          disabled={busy}
        />
        <Checkbox
          label={chosen ? `Confirmo que concedo «${SUBSTITUTION_PERMISSION_LABEL}» a ${chosen.name}.` : 'Elija a la persona para confirmar.'}
          checked={confirmed}
          disabled={!chosen || busy}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        {error && <Notice kind="error">{error}</Notice>}
      </div>
    </Dialog>
  );
}

/**
 * Franja de la lámina 09: cuántas personas tienen «Sustituir responsable» y
 * «Ver quién lo tiene», que despliega debajo la consulta (modo `read`). La
 * Directiva no entra a Usuarios: aquí es donde lo consulta (U.4, H-26). Se
 * despliega en la página y no en un diálogo, para que «Renunciar» abra su
 * confirmación sin diálogos anidados.
 */
export function SubstitutionPermissionsStrip({ userId }: { userId: string | null }) {
  const [view, setView] = useState<SubstitutionPermissions | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    void Promise.resolve().then(async () => {
      try {
        const data = await jointPurchaseCallsService.substitutionPermissions();
        if (alive) setView(data);
      } catch {
        if (alive) setFailed(true);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const count = view?.holders.length ?? null;
  const summary =
    count === null
      ? failed
        ? 'No se pudo cargar quién lo tiene.'
        : 'Cargando…'
      : count === 0
        ? 'Nadie lo tiene hoy. Permite nombrar a otra responsable cuando la actual ya no está habilitada.'
        : `${count === 1 ? '1 persona puede' : `${count} personas pueden`} nombrar a otra responsable cuando la actual ya no está habilitada.`;

  return (
    <section className="rounded-card bg-sunken px-5 py-4 sm:px-7" data-testid="substitution-strip" aria-label={`Permiso «${SUBSTITUTION_PERMISSION_LABEL}»`}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-1 basis-64 items-start gap-3">
          <Icon d={ICON.users} className="mt-0.5 h-6 w-6 text-ink" />
          <div className="min-w-0">
            <p className="font-semibold text-ink">Permiso «{SUBSTITUTION_PERMISSION_LABEL}»</p>
            <p className="text-sm text-ink-muted">{summary}</p>
          </div>
        </div>
        <button
          type="button"
          className={`${buttonClassFor('ghost')} -mr-2`}
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="substitution-strip-panel"
        >
          {open ? 'Ocultar' : 'Ver quién lo tiene'}
          <Icon d={open ? ICON.chevronUp : ICON.chevronRight} className="h-5 w-5" />
        </button>
      </div>
      <div id="substitution-strip-panel" hidden={!open} className="mt-4 rounded-card bg-surface px-5 py-5 sm:px-7">
        {open && <SubstitutionPermissionsPanel userId={userId} mode="read" tone="plain" showTitle={false} onChange={setView} />}
      </div>
    </section>
  );
}
