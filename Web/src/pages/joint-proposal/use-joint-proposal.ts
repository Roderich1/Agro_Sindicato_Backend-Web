import axios from 'axios';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/use-auth';
import { useSelectedCampaign } from '../../hooks/use-selected-campaign';
import { collectiveError } from '../../lib/collective-text';
import { reportDisclosureMode } from '../../lib/data-mode';
import { LINK_POLL_MS } from '../../lib/estimation-link-text';
import { prepareCallPath } from '../../lib/joint-purchase-call-text';
import { collectiveService } from '../../services/collective.service';
import type { Proposal, ProposalSummary } from '../../types/collective';
import {
  POLICY_PENDING_MESSAGE,
  type Feedback,
  type LinkLoad,
  type Problem,
  type ProposalTab,
  type SelectionLoad,
} from './joint-proposal.types';
import { useProposalActions } from './use-proposal-actions';

export function useJointProposal() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { campaigns, selected, error: campaignsError, refresh: refreshCampaigns } = useSelectedCampaign();
  const [history, setHistory] = useState<ProposalSummary[]>([]);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [link, setLink] = useState<LinkLoad | null>(null);
  const [linkFeedback, setLinkFeedback] = useState<Feedback | null>(null);
  const [selection, setSelection] = useState<SelectionLoad | null>(null);
  const [selectionFeedback, setSelectionFeedback] = useState<Feedback | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [tab, setTab] = useState<ProposalTab>('actual');
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();

  const requestedDraft = params.get('borrador');
  const wantedDraft = useRef<string | null>(requestedDraft);
  useEffect(() => {
    wantedDraft.current = requestedDraft;
  }, [requestedDraft]);

  const context = `${user?.id ?? ''}|${user?.tenantId ?? ''}|${user?.role ?? ''}|${selected ?? ''}`;
  const contextRef = useRef(context);
  const shownRef = useRef<string | null>(null);
  const linkEpochRef = useRef(0);
  useEffect(() => {
    contextRef.current = context;
  }, [context]);
  useEffect(() => {
    shownRef.current = proposal?.proposal_ref ?? null;
  }, [proposal]);

  const fail = (err: unknown, fallback: string, retry = false) => {
    const message = collectiveError(err, fallback);
    const forbidden = axios.isAxiosError(err) && err.response?.status === 403;
    if (message === 'POLICY_PENDING') setProblem({ kind: 'restricted', message: POLICY_PENDING_MESSAGE, retry: false });
    else setProblem({ kind: forbidden ? 'forbidden' : 'error', message, retry: retry && !forbidden });
  };

  /** Sólo lee la referencia fijada. `quiet`: consulta periódica, sin «Cargando…» ni borrar lo mostrado. */
  const loadLink = useCallback(async (proposalRef: string, at: string, quiet = false) => {
    if (!quiet) setLink({ status: 'loading' });
    const epoch = linkEpochRef.current;
    const current = () => contextRef.current === at && shownRef.current === proposalRef && linkEpochRef.current === epoch;
    try {
      const view = await collectiveService.estimationLink(proposalRef);
      if (current() && view.proposal_ref === proposalRef) {
        setLink({ status: 'ready', view });
        if (quiet && view.state !== 'CALCULATING') {
          setLinkFeedback(
            view.state === 'LINKED'
              ? { kind: 'ok', message: 'Cálculo terminado: la referencia quedó fijada con su resultado. Sus elecciones del borrador no cambiaron.' }
              : { kind: 'warn', message: 'El cálculo terminó sin cifras utilizables; el motivo está en la franja.' },
          );
        }
      }
    } catch (err) {
      if (!current()) return;
      if (quiet) {
        setLinkFeedback(null);
        setLink({
          status: 'error',
          message: `${collectiveError(err, 'No fue posible consultar el estado del cálculo.')} El cálculo puede seguir en curso: pulse «Reintentar» para consultarlo.`,
        });
      } else {
        setLink({ status: 'error', message: collectiveError(err, 'No fue posible cargar la referencia de consumo estimado.') });
      }
    }
  }, []);

  /** Sólo lee la selección guardada. */
  const loadSelection = useCallback(async (proposalRef: string, at: string) => {
    setSelection({ status: 'loading' });
    const current = () => contextRef.current === at && shownRef.current === proposalRef;
    try {
      const data = await collectiveService.proposalSelection(proposalRef);
      if (current() && data.proposal_ref === proposalRef) {
        setSelection({ status: 'ready', revision: data.revision, saved: data.product_refs, chosen: data.product_refs });
      }
    } catch (err) {
      if (current()) setSelection({ status: 'error', message: collectiveError(err, 'No fue posible cargar la selección de productos.') });
    }
  }, []);

  const show = useCallback(
    (shown: Proposal, at: string) => {
      if (contextRef.current !== at) return;
      shownRef.current = shown.proposal_ref;
      linkEpochRef.current += 1;
      reportDisclosureMode(shown.disclosure.mode);
      setProposal(shown);
      setLinkFeedback(null);
      setSelectionFeedback(null);
      void loadLink(shown.proposal_ref, at);
      void loadSelection(shown.proposal_ref, at);
    },
    [loadLink, loadSelection],
  );

  const open = useCallback(
    async (id: string, at: string) => {
      setBusy(true);
      setProblem(null);
      try {
        const shown = await collectiveService.proposal(id);
        if (shown) show(shown, at);
      } catch (err) {
        if (contextRef.current === at) fail(err, 'No fue posible abrir el borrador.');
      } finally {
        setBusy(false);
      }
    },
    [show],
  );

  const loadHistory = useCallback(
    async (campaignId: string, at: string) => {
      setLoadingHistory(true);
      try {
        const list = await collectiveService.proposals(campaignId);
        if (contextRef.current !== at) return;
        setHistory(list);
        setLoadingHistory(false);
        const wanted = wantedDraft.current;
        const target = wanted ? list.find((entry) => entry.proposal_ref === wanted) : undefined;
        if (wanted && !target) setDraftNotice('El borrador pedido no es de esta campaña o ya no existe: se muestra el más reciente.');
        if (shownRef.current === null && (target ?? list[0])) await open((target ?? list[0])!.proposal_ref, at);
      } catch (err) {
        if (contextRef.current !== at) return;
        setHistory([]);
        fail(err, 'No fue posible cargar el historial de propuestas.', true);
      } finally {
        if (contextRef.current === at) setLoadingHistory(false);
      }
    },
    [open],
  );

  useEffect(() => {
    if (!selected) return;
    const at = context;
    void Promise.resolve().then(() => {
      shownRef.current = null;
      linkEpochRef.current += 1;
      setProposal(null);
      setLink(null);
      setLinkFeedback(null);
      setSelection(null);
      setSelectionFeedback(null);
      setProblem(null);
      setTab('actual');
      return loadHistory(selected, at);
    });
  }, [selected, context, loadHistory]);

  const shownProposalRef = proposal?.proposal_ref ?? null;
  const calculating = link?.status === 'ready' && link.view.state === 'CALCULATING';
  const [pageVisible, setPageVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  useEffect(() => {
    const onVisibility = () => setPageVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
  useEffect(() => {
    if (!calculating || !shownProposalRef || !pageVisible) return;
    const at = context;
    const timer = setTimeout(() => void loadLink(shownProposalRef, at, true), LINK_POLL_MS);
    return () => clearTimeout(timer);
  }, [calculating, shownProposalRef, context, link, loadLink, pageVisible]);

  const setDraftParam = (proposalRef: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (proposalRef) next.set('borrador', proposalRef);
        else next.delete('borrador');
        return next;
      },
      { replace: true },
    );

  const generate = async () => {
    if (!selected) return;
    const at = context;
    setBusy(true);
    setProblem(null);
    try {
      const created = await collectiveService.generateProposal(selected);
      show(created, at);
      setTab('actual');
      setDraftNotice(null);
      setDraftParam(null);
      const list = await collectiveService.proposals(selected);
      if (contextRef.current === at) setHistory(list);
    } catch (err) {
      if (contextRef.current === at) fail(err, 'No fue posible generar el borrador.');
    } finally {
      setBusy(false);
    }
  };

  const { acting, saving, actOnLink, toggleProduct, saveSelection } = useProposalActions({
    proposal,
    context,
    contextRef,
    shownRef,
    link,
    setLink,
    setLinkFeedback,
    linkEpochRef,
    selection,
    setSelection,
    setSelectionFeedback,
    loadSelection,
  });

  const openDraft = async (proposalRef: string) => {
    setDraftNotice(null);
    setTab('actual');
    if (proposalRef === shownRef.current) return;
    setDraftParam(proposalRef === history[0]?.proposal_ref ? null : proposalRef);
    await open(proposalRef, context);
  };

  const chooseCampaign = (id: string) => {
    setDraftNotice(null);
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('campaign', id);
      next.delete('borrador');
      return next;
    });
  };

  const prepareCall = () => {
    if (!proposal || selection?.status !== 'ready' || selection.saved.length === 0) return;
    navigate(prepareCallPath(proposal.campaign.campaign_ref, proposal.proposal_ref, selection.saved));
  };

  const retry = selected ? () => void loadHistory(selected, context) : undefined;
  const latestRef = history[0]?.proposal_ref ?? null;
  const shownIsLatest = proposal !== null && proposal.proposal_ref === latestRef;
  const shownCampaign = campaigns.find((campaign) => campaign.id === selected) ?? null;
  const view = link?.status === 'ready' ? link.view : null;

  return {
    campaigns,
    selected,
    campaignsError,
    refreshCampaigns,
    history,
    proposal,
    link,
    linkFeedback,
    acting,
    selection,
    selectionFeedback,
    saving,
    problem,
    busy,
    loadingHistory,
    tab,
    setTab,
    draftNotice,
    context,
    retry,
    latestRef,
    shownIsLatest,
    shownCampaign,
    view,
    loadLink,
    loadSelection,
    generate,
    actOnLink,
    toggleProduct,
    saveSelection,
    openDraft,
    chooseCampaign,
    prepareCall,
  };
}
