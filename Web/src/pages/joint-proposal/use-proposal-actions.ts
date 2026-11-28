import { useRef, useState } from 'react';
import { collectiveError } from '../../lib/collective-text';
import { linkErrorOf, linkErrorText, outcomeText, staleSelectionOf } from '../../lib/estimation-link-text';
import { newRequestId } from '../../lib/estimation-text';
import { collectiveService } from '../../services/collective.service';
import type { Proposal } from '../../types/collective';
import { productOrder, type Feedback, type LinkIntent, type LinkLoad, type SelectionLoad } from './joint-proposal.types';

interface UseProposalActionsParams {
  proposal: Proposal | null;
  context: string;
  contextRef: React.MutableRefObject<string>;
  shownRef: React.MutableRefObject<string | null>;
  link: LinkLoad | null;
  setLink: React.Dispatch<React.SetStateAction<LinkLoad | null>>;
  setLinkFeedback: React.Dispatch<React.SetStateAction<Feedback | null>>;
  linkEpochRef: React.MutableRefObject<number>;
  selection: SelectionLoad | null;
  setSelection: React.Dispatch<React.SetStateAction<SelectionLoad | null>>;
  setSelectionFeedback: React.Dispatch<React.SetStateAction<Feedback | null>>;
  loadSelection: (proposalRef: string, at: string) => Promise<void>;
}

export function useProposalActions({
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
}: UseProposalActionsParams) {
  const [acting, setActing] = useState<LinkIntent | null>(null);
  const [saving, setSaving] = useState(false);
  const actingRef = useRef(false);
  const savingRef = useRef(false);

  const actOnLink = async (intent: LinkIntent) => {
    if (!proposal || link?.status !== 'ready' || actingRef.current) return;
    const seen = link.view.link?.link_ref ?? null;
    if (intent !== 'INITIAL' && seen === null) return;
    const proposalRef = proposal.proposal_ref;
    const at = context;
    const current = () => contextRef.current === at && shownRef.current === proposalRef;
    actingRef.current = true;
    linkEpochRef.current += 1;
    setActing(intent);
    setLinkFeedback(null);
    try {
      const requestId = newRequestId();
      const result =
        intent === 'CLEAR'
          ? await collectiveService.clearEstimationLink(proposalRef, { request_id: requestId, expected_link_ref: seen! })
          : await collectiveService.prepareEstimationLink(
              proposalRef,
              intent === 'UPDATE' ? { request_id: requestId, mode: 'UPDATE', expected_link_ref: seen } : { request_id: requestId, mode: 'INITIAL' },
            );
      if (!current()) return;
      linkEpochRef.current += 1;
      if (result.view.proposal_ref === proposalRef) setLink({ status: 'ready', view: result.view });
      setLinkFeedback({ kind: result.outcome === 'NOT_CALCULABLE' ? 'warn' : 'ok', message: outcomeText(result.outcome, result.reason) });
    } catch (err) {
      if (!current()) return;
      linkEpochRef.current += 1;
      const body = linkErrorOf(err);
      if (body?.view && body.view.proposal_ref === proposalRef) setLink({ status: 'ready', view: body.view });
      const text = body ? linkErrorText(body.errorCode) : null;
      setLinkFeedback({
        kind: body?.errorCode === 'REFERENCE_CHANGED' || body?.errorCode === 'REFERENCE_UP_TO_DATE' ? 'warn' : 'error',
        message: text ?? collectiveError(err, 'No fue posible completar la acción sobre la referencia. El borrador no cambia.'),
      });
    } finally {
      actingRef.current = false;
      setActing(null);
    }
  };

  const toggleProduct = (productRef: string) => {
    if (!proposal) return;
    const order = productOrder(proposal);
    setSelection((state) => {
      if (state?.status !== 'ready') return state;
      const chosen = new Set(state.chosen);
      if (chosen.has(productRef)) chosen.delete(productRef);
      else chosen.add(productRef);
      return { ...state, chosen: order.filter((ref) => chosen.has(ref)) };
    });
    setSelectionFeedback(null);
  };

  const selectProducts = (productRefs: readonly string[]) => {
    if (!proposal || productRefs.length === 0) return;
    const order = productOrder(proposal);
    setSelection((state) => {
      if (state?.status !== 'ready') return state;
      const chosen = new Set(state.chosen);
      for (const ref of productRefs) chosen.add(ref);
      return { ...state, chosen: order.filter((ref) => chosen.has(ref)) };
    });
    setSelectionFeedback(null);
  };

  const deselectProducts = (productRefs: readonly string[]) => {
    if (!proposal || productRefs.length === 0) return;
    const order = productOrder(proposal);
    const toRemove = new Set(productRefs);
    setSelection((state) => {
      if (state?.status !== 'ready') return state;
      const chosen = new Set(state.chosen.filter((ref) => !toRemove.has(ref)));
      return { ...state, chosen: order.filter((ref) => chosen.has(ref)) };
    });
    setSelectionFeedback(null);
  };

  const saveSelection = async () => {
    if (!proposal || selection?.status !== 'ready' || savingRef.current) return;
    const proposalRef = proposal.proposal_ref;
    const at = context;
    const current = () => contextRef.current === at && shownRef.current === proposalRef;
    savingRef.current = true;
    setSaving(true);
    setSelectionFeedback(null);
    try {
      const saved = await collectiveService.saveProposalSelection(proposalRef, {
        expected_revision: selection.revision,
        product_refs: selection.chosen,
      });
      if (!current()) return;
      setSelection({ status: 'ready', revision: saved.revision, saved: saved.product_refs, chosen: saved.product_refs });
      setSelectionFeedback({ kind: 'ok', message: 'Selección guardada. No inscribe a nadie ni asigna cantidades.' });
    } catch (err) {
      if (!current()) return;
      const stale = staleSelectionOf(err);
      const body = linkErrorOf(err);
      if (stale) {
        setSelection({ status: 'ready', revision: stale.revision, saved: stale.product_refs, chosen: stale.product_refs });
      } else if (body?.errorCode === 'SELECTION_STALE') {
        void loadSelection(proposalRef, at);
      }
      const text = body ? linkErrorText(body.errorCode) : null;
      setSelectionFeedback({
        kind: body?.errorCode === 'SELECTION_STALE' ? 'warn' : 'error',
        message: text ?? collectiveError(err, 'No fue posible guardar la selección.'),
      });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return { acting, saving, actOnLink, toggleProduct, selectProducts, deselectProducts, saveSelection };
}
