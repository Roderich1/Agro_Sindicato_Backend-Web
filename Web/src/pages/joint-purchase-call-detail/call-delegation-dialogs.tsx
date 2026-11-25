import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Checkbox, DataState, Dialog, Notice, Select, Textarea } from '../../components/ui';
import {
  callError,
  callErrorCode,
  GRANT_DESCRIPTION,
  GRANT_LABEL,
  ROLE_LABEL,
  SELF_SUBSTITUTION_TEXT,
  SUBSTITUTION_IMPLICATIONS,
  SUBSTITUTION_NO_CANDIDATES_TEXT,
  SUBSTITUTION_ONLY_SELF_TEXT,
  SUBSTITUTION_WHO_TEXT,
} from '../../lib/joint-purchase-call-text';
import { jointPurchaseCallsService } from '../../services/joint-purchase-calls.service';
import type {
  EligibleResponsible,
  JointPurchaseCallCollaborators,
  JointPurchaseCallDetail,
} from '../../types/joint-purchase-calls';
import { MANAGE, MAX_REASON } from './call-detail.helpers';

/** Sustituir a una responsable que ya no está habilitada (P-A B1 / E4 §6.3). */
export function SubstituteDialog({
  call,
  userId,
  onClose,
  onDone,
  onChanged,
}: {
  call: JointPurchaseCallDetail;
  userId: string | null;
  onClose: () => void;
  onDone: (text: string) => void;
  onChanged: (text: string) => void;
}) {
  const [requestId] = useState(() => crypto.randomUUID());
  const introRef = useRef<HTMLParagraphElement>(null);
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

  const candidates = (users ?? []).filter((user) => user.user_ref !== call.responsible.user_ref && user.user_ref !== userId);
  const selfEligible = (users ?? []).some((user) => user.user_ref === userId && user.user_ref !== call.responsible.user_ref);
  const chosen = candidates.find((user) => user.user_ref === userRef) ?? null;
  const ready = chosen !== null && reason.trim().length > 0 && confirmed && !busy;

  const submit = async () => {
    if (!ready || !chosen) return;
    setBusy(true);
    setError(null);
    try {
      await jointPurchaseCallsService.substituteResponsible(call.call_id, {
        requestId,
        expectedVersion: call.responsible.version,
        newResponsibleRef: chosen.user_ref,
        reason: reason.trim(),
      });
      onDone(`${chosen.name} es ahora la persona responsable. Los permisos «${GRANT_LABEL.MANAGE}» anteriores quedan suspendidos hasta su revisión.`);
    } catch (err) {
      const code = callErrorCode(err);
      if (code === 'RESPONSIBLE_CHANGED' || code === 'RESPONSIBLE_STILL_ELIGIBLE' || code === 'SUBSTITUTION_FORBIDDEN') {
        onChanged(callError(err, 'La situación de la convocatoria cambió.'));
        return;
      }
      setError(callError(err, 'No fue posible sustituir a la persona responsable.'));
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="Sustituir a la responsable"
      description={<span className="[overflow-wrap:anywhere]">«{call.name}»</span>}
      onClose={onClose}
      dirty={reason.length > 0 || userRef !== ''}
      busy={busy}
      size="lg"
      hideCloseButton
      testId="substitute-dialog"
      fullScreenOnPhone
      initialFocusRef={introRef}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Volver
          </Button>
          <Button onClick={() => void submit()} disabled={!ready} busy={busy}>
            Sustituir responsable
          </Button>
        </>
      }
    >
      <div className="space-y-5 text-base leading-relaxed text-ink">
        <p ref={introRef} tabIndex={-1} style={{ outline: 'none' }}>
          <strong className="[overflow-wrap:anywhere]">{call.responsible.name}</strong> <span className="text-ink-muted">ya no está habilitada.</span>
        </p>
        <ul className="list-disc space-y-1.5 pl-5" data-testid="substitute-implications">
          {SUBSTITUTION_IMPLICATIONS.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="text-sm text-ink-muted" data-testid="substitute-who">
          {SUBSTITUTION_WHO_TEXT}
        </p>
        {usersError ? (
          <DataState compact state="error" description={usersError} onRetry={() => void loadUsers()} />
        ) : users && candidates.length === 0 ? (
          <DataState
            compact
            state="empty"
            title="Sin personas disponibles"
            description={selfEligible ? SUBSTITUTION_ONLY_SELF_TEXT : SUBSTITUTION_NO_CANDIDATES_TEXT}
            testId="substitute-no-candidates"
          />
        ) : (
          <Select
            id="substitute-user"
            label="Nueva persona responsable"
            value={userRef}
            onChange={(event) => {
              setUserRef(event.target.value);
              setConfirmed(false);
            }}
            help={
              selfEligible && candidates.length > 0 ? (
                <span data-testid="substitute-self-note">{SELF_SUBSTITUTION_TEXT}</span>
              ) : (
                'Otra persona activa de la Directiva o la Administración, distinta de usted y de la responsable actual.'
              )
            }
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
          id="substitute-reason"
          label="Motivo"
          help="Obligatorio. Queda en el historial y en la bitácora."
          maxLength={MAX_REASON}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          disabled={busy}
        />
        <Checkbox
          label={
            chosen
              ? `Confirmo que ${chosen.name} sustituye a ${call.responsible.name} como persona responsable de «${call.name}».`
              : 'Elija a la nueva persona responsable para confirmar.'
          }
          checked={confirmed}
          disabled={!chosen || busy}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        {error && <Notice kind="error">{error}</Notice>}
      </div>
    </Dialog>
  );
}

/** Conceder «Administrar la convocatoria» (lámina 15.5, E4 §2). */
export function GrantDialog({
  call,
  userId,
  onClose,
  onGranted,
  onForbidden,
}: {
  call: JointPurchaseCallDetail;
  userId: string | null;
  onClose: () => void;
  onGranted: (view: JointPurchaseCallCollaborators, text: string) => void;
  onForbidden: () => void;
}) {
  const [users, setUsers] = useState<EligibleResponsible[] | null>(null);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [userRef, setUserRef] = useState('');
  const grant = MANAGE;
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

  const candidates = (users ?? []).filter((user) => user.user_ref !== call.responsible.user_ref && user.user_ref !== userId);
  const chosen = candidates.find((user) => user.user_ref === userRef) ?? null;
  const ready = chosen !== null && confirmed && !busy;

  const submit = async () => {
    if (!ready || !chosen) return;
    setBusy(true);
    setError(null);
    try {
      const view = await jointPurchaseCallsService.grant(call.call_id, chosen.user_ref, grant);
      onGranted(view, `Permiso «${GRANT_LABEL[grant]}» concedido a ${chosen.name}.`);
    } catch (err) {
      if (callErrorCode(err) === 'COLLABORATORS_FORBIDDEN') {
        onForbidden();
        return;
      }
      setError(callError(err, 'No fue posible conceder el permiso.'));
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={`Conceder «${GRANT_LABEL.MANAGE}»`}
      onClose={onClose}
      dirty={userRef !== ''}
      busy={busy}
      hideCloseButton
      testId="grant-dialog"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Volver
          </Button>
          <Button onClick={() => void submit()} disabled={!ready} busy={busy}>
            Conceder permiso
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {usersError ? (
          <DataState compact state="error" description={usersError} onRetry={() => void loadUsers()} />
        ) : users && candidates.length === 0 ? (
          <DataState compact state="empty" title="Sin personas disponibles" description="No hay otros usuarios activos de la Directiva o la Administración a quienes conceder permisos." />
        ) : (
          <Select
            id="grant-user"
            label="Persona"
            help="Otra persona de la Directiva o la Administración, distinta de usted y de la persona responsable."
            value={userRef}
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
        <p className="text-sm leading-relaxed text-ink-muted" data-testid="grant-description">
          {GRANT_DESCRIPTION[grant]}
        </p>
        <Checkbox
          label={chosen ? `Confirmo que concedo «${GRANT_LABEL[grant]}» a ${chosen.name} en «${call.name}».` : 'Elija a la persona para confirmar.'}
          checked={confirmed}
          disabled={!chosen || busy}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        {error && <Notice kind="error">{error}</Notice>}
      </div>
    </Dialog>
  );
}
