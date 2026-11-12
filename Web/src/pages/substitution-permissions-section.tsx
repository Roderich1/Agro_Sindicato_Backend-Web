import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal } from '../components/app-shell';
import { Button, Collapsible, DataState, DataTable, inputClass, labelClass, Notice } from '../components/ui';
import { fmtDateTime } from '../lib/collective-text';
import {
  callError,
  ROLE_LABEL,
  SUBSTITUTION_PERMISSION_DESCRIPTION,
  SUBSTITUTION_PERMISSION_LABEL,
} from '../lib/joint-purchase-call-text';
import { jointPurchaseCallsService } from '../services/joint-purchase-calls.service';
import type { EligibleResponsible, SubstitutionPermissions } from '../types/joint-purchase-calls';

const MAX_REASON = 280;

type Dialog = { kind: 'grant' } | { kind: 'revoke'; userRef: string; name: string; self: boolean };

/**
 * P-A A1 (§12): el permiso del sindicato «Sustituir responsable». Cualquier
 * persona de la Directiva o la Administración ve quién lo tiene y su
 * historial (sin datos de agricultores). Sólo una persona Administrador
 * habilitada lo concede, a otra persona concreta y habilitada (nunca a sí
 * misma ni a un rol), con motivo y confirmación, y lo retira; quien lo tiene
 * puede renunciar. El servidor lo revalida todo.
 */
export function SubstitutionPermissionsSection({ userId }: { userId: string | null }) {
  const [view, setView] = useState<SubstitutionPermissions | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await jointPurchaseCallsService.substitutionPermissions();
      if (!aliveRef.current) return;
      setView(data);
      setProblem(null);
    } catch (err) {
      if (aliveRef.current) setProblem(callError(err, 'No fue posible cargar el permiso «Sustituir responsable».'));
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const changed = (data: SubstitutionPermissions, text: string) => {
    setDialog(null);
    setView(data);
    setMessage(text);
  };

  return (
    <Collapsible title={`Permiso «${SUBSTITUTION_PERMISSION_LABEL}»`} testId="substitution-permissions">
      <div className="space-y-3 px-5 py-4">
        <p className="text-sm text-slate-700">{SUBSTITUTION_PERMISSION_DESCRIPTION}</p>
        <p className="text-xs text-slate-600">
          Lo concede o lo retira una persona Administrador habilitada, a personas concretas de la Directiva o la Administración; nunca a sí misma
          ni a un rol entero. Si nadie más está habilitado, no hay una salida automática.
        </p>
        {message && <Notice kind="ok">{message}</Notice>}
        {problem ? (
          <DataState compact state="error" description={problem} onRetry={() => void load()} />
        ) : !view ? (
          <DataState compact state="loading" />
        ) : (
          <>
            {view.can_grant && (
              <Button onClick={() => setDialog({ kind: 'grant' })} data-testid="substitution-grant-button">
                Conceder el permiso
              </Button>
            )}
            {view.holders.length === 0 ? (
              <DataState compact state="empty" title="Nadie lo tiene" description="Ninguna persona tiene hoy este permiso." testId="substitution-holders-empty" />
            ) : (
              <DataTable caption="Personas con el permiso" minWidth={640}>
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Rol</th>
                    <th>Concedido</th>
                    <th>Motivo</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {view.holders.map((holder) => {
                    const self = holder.user_ref === userId;
                    return (
                      <tr key={holder.user_ref} data-testid={`substitution-holder-${holder.user_ref}`}>
                        <td className="[overflow-wrap:anywhere]">
                          {holder.name}
                          {self ? ' (usted)' : ''}
                          {!holder.eligible && <span className="block text-xs font-semibold text-amber-800">No habilitada: el permiso no se ejerce.</span>}
                        </td>
                        <td>{holder.role ? (ROLE_LABEL[holder.role] ?? holder.role) : '—'}</td>
                        <td className="text-xs">
                          {fmtDateTime(holder.granted_at)} · por {holder.granted_by.name}
                        </td>
                        <td className="text-xs [overflow-wrap:anywhere]">{holder.reason}</td>
                        <td>
                          {(view.can_grant || self) && (
                            <Button
                              size="sm"
                              variant="secondary"
                              aria-label={self ? 'Renunciar al permiso' : `Retirar el permiso a ${holder.name}`}
                              onClick={() => setDialog({ kind: 'revoke', userRef: holder.user_ref, name: holder.name, self })}
                            >
                              {self ? 'Renunciar' : 'Retirar'}
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </DataTable>
            )}
            <Collapsible title="Historial del permiso" testId="substitution-history">
              {view.history.length === 0 ? (
                <DataState compact state="empty" title="Sin cambios" description="Nadie concedió ni retiró este permiso." />
              ) : (
                <ol className="divide-y divide-slate-100" aria-label="Historial del permiso">
                  {view.history.map((entry, index) => (
                    <li key={`${entry.at}-${index}`} className="px-5 py-2 text-sm" data-testid="substitution-history-event">
                      <span className="font-semibold text-slate-900">
                        {entry.action === 'GRANTED' ? 'Concedido' : entry.user.user_ref === entry.actor.user_ref ? 'Renuncia' : 'Retirado'}
                      </span>
                      <span className="ml-2">· {entry.user.name}</span>
                      <span className="ml-2 text-xs text-slate-600">
                        · por {entry.actor.name} · {fmtDateTime(entry.at)}
                      </span>
                      {entry.reason && <p className="text-xs text-slate-700 [overflow-wrap:anywhere]">Motivo: {entry.reason}</p>}
                    </li>
                  ))}
                </ol>
              )}
            </Collapsible>
          </>
        )}
      </div>
      {dialog?.kind === 'grant' && (
        <GrantSubstitutionDialog
          userId={userId}
          holders={view?.holders.map((h) => h.user_ref) ?? []}
          onClose={() => setDialog(null)}
          onDone={(data, name) => changed(data, `Permiso «${SUBSTITUTION_PERMISSION_LABEL}» concedido a ${name}.`)}
        />
      )}
      {dialog?.kind === 'revoke' && (
        <RevokeSubstitutionDialog
          dialog={dialog}
          onClose={() => setDialog(null)}
          onDone={(data) =>
            changed(data, dialog.self ? `Renunció al permiso «${SUBSTITUTION_PERMISSION_LABEL}».` : `Permiso «${SUBSTITUTION_PERMISSION_LABEL}» retirado a ${dialog.name}.`)
          }
        />
      )}
    </Collapsible>
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

  useEffect(() => {
    void Promise.resolve().then(async () => {
      try {
        setUsers(await jointPurchaseCallsService.eligibleResponsibles());
      } catch (err) {
        setUsersError(callError(err, 'No fue posible cargar los usuarios de la Directiva y la Administración.'));
      }
    });
  }, []);

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
    <Modal title={`Conceder «${SUBSTITUTION_PERMISSION_LABEL}»`} onClose={onClose} size="lg">
      <div className="space-y-4" data-testid="substitution-grant-dialog">
        <p className="text-sm text-slate-700">{SUBSTITUTION_PERMISSION_DESCRIPTION}</p>
        {error && <Notice kind="error">{error}</Notice>}
        <div>
          <label className={labelClass} htmlFor="substitution-user">
            Persona
          </label>
          {usersError ? (
            <DataState compact state="error" description={usersError} />
          ) : users && candidates.length === 0 ? (
            <DataState compact state="empty" title="Sin personas disponibles" description="No hay otra persona activa de la Directiva o la Administración sin el permiso." />
          ) : (
            <select id="substitution-user" className={inputClass} value={userRef} disabled={!users} onChange={(event) => setUserRef(event.target.value)}>
              <option value="">{users ? 'Seleccione…' : 'Cargando…'}</option>
              {candidates.map((user) => (
                <option key={user.user_ref} value={user.user_ref}>
                  {user.name}
                  {ROLE_LABEL[user.role] ? ` · ${ROLE_LABEL[user.role]}` : ''}
                </option>
              ))}
            </select>
          )}
          <p className="mt-1 text-xs text-slate-600">Una persona concreta, distinta de usted.</p>
        </div>
        <div>
          <label className={labelClass} htmlFor="substitution-reason">
            Motivo
          </label>
          <textarea id="substitution-reason" className={inputClass} maxLength={MAX_REASON} value={reason} onChange={(event) => setReason(event.target.value)} />
          <p className="mt-1 text-xs text-slate-500">
            {reason.length} de {MAX_REASON} caracteres. Queda en el historial y en la bitácora.
          </p>
        </div>
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" className="mt-0.5 shrink-0" checked={confirmed} disabled={!chosen} onChange={(event) => setConfirmed(event.target.checked)} />
          <span className="min-w-0 [overflow-wrap:anywhere]">
            {chosen ? `Confirmo que concedo «${SUBSTITUTION_PERMISSION_LABEL}» a ${chosen.name}.` : 'Elija a la persona para confirmar.'}
          </span>
        </label>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Volver
          </Button>
          <Button onClick={() => void submit()} disabled={!ready}>
            {busy ? 'Guardando…' : 'Conceder el permiso'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function RevokeSubstitutionDialog({
  dialog,
  onClose,
  onDone,
}: {
  dialog: { userRef: string; name: string; self: boolean };
  onClose: () => void;
  onDone: (data: SubstitutionPermissions) => void;
}) {
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = confirmed && !busy;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      onDone(await jointPurchaseCallsService.revokeSubstitution(dialog.userRef, reason.trim() || null));
    } catch (err) {
      setError(callError(err, 'No fue posible retirar el permiso.'));
      setBusy(false);
    }
  };

  return (
    <Modal title={dialog.self ? 'Renunciar al permiso' : 'Retirar el permiso'} onClose={onClose} size="lg">
      <div className="space-y-4">
        {error && <Notice kind="error">{error}</Notice>}
        <div>
          <label className={labelClass} htmlFor="substitution-revoke-reason">
            Motivo (opcional)
          </label>
          <textarea id="substitution-revoke-reason" className={inputClass} maxLength={MAX_REASON} value={reason} onChange={(event) => setReason(event.target.value)} />
        </div>
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" className="mt-0.5 shrink-0" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
          <span className="min-w-0 [overflow-wrap:anywhere]">
            {dialog.self
              ? `Confirmo que renuncio al permiso «${SUBSTITUTION_PERMISSION_LABEL}».`
              : `Confirmo que retiro el permiso «${SUBSTITUTION_PERMISSION_LABEL}» a ${dialog.name}.`}
          </span>
        </label>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Volver
          </Button>
          <Button variant="danger" onClick={() => void submit()} disabled={!ready}>
            {busy ? 'Guardando…' : dialog.self ? 'Renunciar' : 'Retirar el permiso'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
