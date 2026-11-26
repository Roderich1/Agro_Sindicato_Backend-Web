import axios from 'axios';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { requestSessionRevalidation } from '../../lib/axios';
import { callError } from '../../lib/joint-purchase-call-text';
import { COLLECTIVE_PATHS } from '../../lib/navigation';
import { jointPurchaseCallsService } from '../../services/joint-purchase-calls.service';
import type {
  JointPurchaseCallClosing,
  JointPurchaseCallDetail,
  JointPurchaseCallParticipants,
} from '../../types/joint-purchase-calls';
import {
  FOCUS_RECHECK_GAP_MS,
  isParticipantsForbidden,
  PARTICIPANTS_RECHECK_MS,
  withoutIdentifiedDetail,
  type DialogState,
  type Problem,
} from './call-detail.helpers';

export function useCallDetail(id: string) {
  const location = useLocation();
  const [params] = useSearchParams();
  const [call, setCall] = useState<JointPurchaseCallDetail | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [message, setMessage] = useState<string | null>(() => (location.state as { message?: string } | null)?.message ?? null);
  const [alert, setAlert] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [participants, setParticipants] = useState<JointPurchaseCallParticipants | null>(null);
  const [participantsProblem, setParticipantsProblem] = useState<string | null>(null);
  const [closing, setClosing] = useState<JointPurchaseCallClosing | null>(null);
  const [closingProblem, setClosingProblem] = useState<string | null>(null);
  /** Se tuvo el acceso al detalle identificado en esta vista y ya no (E4 §6.4). */
  const [revoked, setRevoked] = useState(false);

  const aliveRef = useRef(true);
  const seqRef = useRef(0);
  const hadPermissionRef = useRef(false);
  const shownRef = useRef(false);
  const lastFocusCheckRef = useRef(0);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  useEffect(() => {
    shownRef.current = call !== null;
  }, [call]);

  const forgetParticipants = useCallback(() => {
    setParticipants(null);
    setClosing((prev) => (prev ? withoutIdentifiedDetail(prev) : prev));
    setRevoked(true);
    setCall((prev) => (prev ? { ...prev, can_view_participants: false } : prev));
  }, []);

  const refresh = useCallback(async () => {
    const seq = ++seqRef.current;
    const current = () => aliveRef.current && seqRef.current === seq;
    let detail: JointPurchaseCallDetail;
    try {
      detail = await jointPurchaseCallsService.get(id);
    } catch (err) {
      if (!current()) return;
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      if (shownRef.current && status !== 401 && status !== 403 && status !== 404) return;
      setCall(null);
      setParticipants(null);
      setClosing(null);
      setProblem({ message: callError(err, 'No fue posible cargar la convocatoria.'), forbidden: status === 403 });
      return;
    }
    if (!current()) return;
    setProblem(null);
    if (detail.can_view_participants) {
      hadPermissionRef.current = true;
      setRevoked(false);
    } else if (hadPermissionRef.current) {
      setParticipants(null);
      setClosing((prev) => (prev ? withoutIdentifiedDetail(prev) : prev));
      setRevoked(true);
    }
    setCall(detail);

    if (detail.status === 'OPEN' || detail.status === 'CANCELLED') {
      if (!detail.can_view_participants) {
        setParticipants(null);
        return;
      }
      try {
        const list = await jointPurchaseCallsService.participants(id);
        if (!current()) return;
        setParticipants(list);
        setParticipantsProblem(null);
      } catch (err) {
        if (!current()) return;
        if (isParticipantsForbidden(err)) forgetParticipants();
        else setParticipantsProblem(callError(err, 'No fue posible cargar los participantes.'));
      }
    } else if (detail.status === 'CLOSED') {
      try {
        const snapshot = await jointPurchaseCallsService.closing(id);
        if (!current()) return;
        if (!snapshot.can_view_participants && hadPermissionRef.current) setRevoked(true);
        setClosing(snapshot.can_view_participants && detail.can_view_participants ? snapshot : withoutIdentifiedDetail(snapshot));
        setClosingProblem(null);
      } catch (err) {
        if (!current()) return;
        setClosingProblem(callError(err, 'No fue posible cargar el consolidado al cierre.'));
      }
    }
  }, [id, forgetParticipants]);

  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);

  const lastViewRef = useRef<{ id: string; canView: boolean } | null>(null);
  useEffect(() => {
    if (!call) return;
    const previous = lastViewRef.current;
    if (previous && previous.id === call.call_id && previous.canView !== call.can_view_participants) requestSessionRevalidation();
    lastViewRef.current = { id: call.call_id, canView: call.can_view_participants };
  }, [call]);

  const watching = Boolean(call?.can_view_participants && call.status !== 'DRAFT');
  useEffect(() => {
    if (!watching) return;
    const onFocus = () => {
      if (document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (now - lastFocusCheckRef.current < FOCUS_RECHECK_GAP_MS) return;
      lastFocusCheckRef.current = now;
      void refresh();
    };
    const timer = window.setInterval(() => void refresh(), PARTICIPANTS_RECHECK_MS);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [watching, refresh]);

  const done = async (text: string) => {
    setDialog(null);
    setAlert(null);
    setMessage(text);
    await refresh();
  };

  const lostPermission = async () => {
    setDialog(null);
    setMessage(null);
    setAlert('Su cuenta ya no tiene acceso para gestionar esta convocatoria.');
    await refresh();
  };

  const campaignId = call?.campaign.campaign_ref ?? params.get('campaign');
  const backTo = `${COLLECTIVE_PATHS.jointPurchaseCalls}${campaignId ? `?campaign=${encodeURIComponent(campaignId)}` : ''}`;

  return {
    call,
    problem,
    message,
    alert,
    dialog,
    setDialog,
    participants,
    participantsProblem,
    closing,
    closingProblem,
    revoked,
    backTo,
    refresh,
    done,
    lostPermission,
  };
}
