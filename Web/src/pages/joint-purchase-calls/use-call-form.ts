import { useCallback, useRef, useState } from 'react';
import { callError, callErrorCode, fromLocalInput, toLocalInput } from '../../lib/joint-purchase-call-text';
import { jointPurchaseCallsService } from '../../services/joint-purchase-calls.service';
import type { Proposal } from '../../types/collective';
import type {
  JointPurchaseCallDetail,
  JointPurchaseCallProductInput,
} from '../../types/joint-purchase-calls';

export type Source = 'catalog' | 'proposal';

export const SOURCES: { value: Source; label: string }[] = [
  { value: 'catalog', label: 'Del catálogo' },
  { value: 'proposal', label: 'De un borrador de compra' },
];

export const MAX_NAME = 120;

export interface Errors {
  name?: string;
  deadline?: string;
  products?: string;
}

export function useCallForm({
  campaignId,
  call,
  preset,
  onSaved,
  onManageForbidden,
}: {
  campaignId: string;
  call?: JointPurchaseCallDetail;
  preset?: { proposalId: string; productRefs: readonly string[] };
  onSaved: (saved: { id: string | null; text: string }) => void;
  onManageForbidden?: () => void;
}) {
  const editing = Boolean(call);
  const prepared = !call && preset ? preset : null;
  const [name, setName] = useState(call?.name ?? '');
  const [deadline, setDeadline] = useState(toLocalInput(call?.deadline_at));
  const [source, setSource] = useState<Source>(call?.source_proposal_ref || prepared ? 'proposal' : 'catalog');
  const [catalogRefs, setCatalogRefs] = useState<Set<string>>(
    () => new Set(call && !call.source_proposal_ref ? call.products.map((product) => product.product_ref) : []),
  );
  const [proposalId, setProposalId] = useState(call?.source_proposal_ref ?? prepared?.proposalId ?? '');
  const [positions, setPositions] = useState<Set<number>>(
    () =>
      new Set(
        call?.source_proposal_ref
          ? call.products.map((product) => product.reference?.position).filter((value): value is number => typeof value === 'number')
          : [],
      ),
  );
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const validate = (): Errors => {
    const next: Errors = {};
    const trimmed = name.trim();
    if (!trimmed) next.name = 'Escriba el nombre de la convocatoria.';
    else if (trimmed.length > MAX_NAME) next.name = `El nombre admite hasta ${MAX_NAME} caracteres.`;
    const iso = fromLocalInput(deadline);
    if (!iso) next.deadline = 'Elija la fecha y hora límite.';
    else if (new Date(iso).getTime() <= Date.now()) next.deadline = 'La fecha límite debe ser posterior a este momento.';
    const count = source === 'catalog' ? catalogRefs.size : positions.size;
    if (count === 0) next.products = 'Elija al menos un producto.';
    return next;
  };

  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [ignored, setIgnored] = useState(0);
  const presetRef = useRef(prepared);

  const showProposal = useCallback((shown: Proposal | null) => {
    setProposal(shown);
    const pending = presetRef.current;
    if (!shown || !pending || shown.proposal_ref !== pending.proposalId) return;
    presetRef.current = null;
    const wanted = new Set(pending.productRefs);
    const lines = shown.lines.filter((line) => wanted.has(line.product_ref));
    const found = new Set(lines.map((line) => line.product_ref));
    setPositions(new Set(lines.map((line) => line.position)));
    setIgnored([...wanted].filter((ref) => !found.has(ref)).length);
  }, []);

  const chosenProducts = (): JointPurchaseCallProductInput[] => {
    if (source === 'catalog') return [...catalogRefs].map((product_ref) => ({ product_ref }));
    const refs = (proposal?.lines ?? []).filter((line) => positions.has(line.position)).map((line) => line.product_ref);
    return [...new Set(refs)].map((product_ref) => ({ product_ref }));
  };

  const submit = async () => {
    const found = validate();
    setErrors(found);
    setServerError(null);
    if (Object.keys(found).length > 0) return;
    const base = {
      name: name.trim(),
      deadline_at: fromLocalInput(deadline)!,
      products: chosenProducts(),
    };
    setBusy(true);
    try {
      if (call) {
        await jointPurchaseCallsService.update(call.call_id, { ...base, source_proposal_id: source === 'proposal' ? proposalId : null });
        onSaved({ id: call.call_id, text: 'Borrador guardado.' });
      } else {
        const created = await jointPurchaseCallsService.create({
          campaign_id: campaignId,
          ...base,
          ...(source === 'proposal' ? { source_proposal_id: proposalId } : {}),
        });
        onSaved({ id: created?.call_id ?? null, text: `Borrador «${base.name}» creado. Los agricultores todavía no lo ven: ábralo cuando esté listo.` });
      }
    } catch (err) {
      if (call && onManageForbidden && callErrorCode(err) === 'MANAGE_FORBIDDEN') {
        onManageForbidden();
        return;
      }
      setServerError(callError(err, 'No fue posible guardar el borrador.'));
      setBusy(false);
    }
  };

  const selectProposalId = (id: string) => {
    presetRef.current = null;
    setIgnored(0);
    setProposalId(id);
    setPositions(new Set());
  };

  const dirty =
    (name !== (call?.name ?? '') ||
      deadline !== toLocalInput(call?.deadline_at) ||
      (!call && !prepared && (catalogRefs.size > 0 || positions.size > 0)));

  return {
    editing,
    prepared,
    name,
    setName,
    deadline,
    setDeadline,
    source,
    setSource,
    catalogRefs,
    setCatalogRefs,
    proposalId,
    selectProposalId,
    positions,
    setPositions,
    errors,
    serverError,
    busy,
    proposal,
    showProposal,
    ignored,
    submit,
    dirty,
  };
}
