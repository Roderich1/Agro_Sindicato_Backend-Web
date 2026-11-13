import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, DataState, Dialog, ICON, Icon, labelClass, Notice, SearchInput, SegmentedControl, Select, TextInput } from '../components/ui';
import { useAuth } from '../hooks/use-auth';
import { collectiveError, fmtDateTime } from '../lib/collective-text';
import {
  callError,
  callErrorCode,
  CREATE_AS_DRAFT_NOTE,
  DEADLINE_HELP,
  fromLocalInput,
  handOverText,
  referenceText,
  RESPONSIBLE_NOTICE,
  ROLE_LABEL,
  toLocalInput,
} from '../lib/joint-purchase-call-text';
import { normalizeName } from '../lib/product-text';
import { presentationUnit } from '../lib/quantity';
import { collectiveService } from '../services/collective.service';
import { jointPurchaseCallsService } from '../services/joint-purchase-calls.service';
import type { CatalogEntry, Proposal, ProposalSummary } from '../types/collective';
import type {
  EligibleResponsible,
  JointPurchaseCallDetail,
  JointPurchaseCallProductInput,
} from '../types/joint-purchase-calls';

type Source = 'catalog' | 'proposal';

const SOURCES: { value: Source; label: string }[] = [
  { value: 'catalog', label: 'Del catálogo' },
  { value: 'proposal', label: 'De un borrador de compra' },
];

const MAX_NAME = 120;

interface Errors {
  name?: string;
  deadline?: string;
  responsible?: string;
  products?: string;
}

/**
 * Crear o editar el borrador de una convocatoria (E2 §4.1 `POST` y `PATCH`,
 * sólo en `DRAFT`). Los productos salen del catálogo colectivo (activos,
 * principales, en L o KG) o de las líneas elegidas de un borrador de
 * propuesta de la misma campaña; la cifra de esa línea se muestra sólo como
 * referencia divulgada (E2-D14), nunca como cantidad comprometida. El
 * servidor vuelve a validar todo al guardar y al abrir.
 *
 * P-B (2026-11-12): si quien guarda nombra responsable a otra persona y con
 * eso deja de administrar el borrador (lo crea, o lo edita siendo la
 * responsable), antes de enviar se le dice qué pierde y debe confirmarlo.
 */
export function JointPurchaseCallForm({
  campaignId,
  campaignName,
  call,
  onClose,
  onSaved,
  onManageForbidden,
  preset,
}: {
  campaignId: string;
  campaignName: string;
  /** Borrador a editar; sin él, se crea uno nuevo. */
  call?: JointPurchaseCallDetail;
  onClose: () => void;
  onSaved: (saved: { id: string | null; text: string }) => void;
  /** §10.2: el servidor respondió 403 `MANAGE_FORBIDDEN` al editar; quien abrió el formulario explica y recarga. */
  onManageForbidden?: () => void;
  /**
   * «Preparar convocatoria» desde un borrador de propuesta (sólo al crear):
   * ese borrador como origen y preseleccionadas sólo las líneas de esos
   * productos. No envía nada: la persona completa el resto y confirma.
   */
  preset?: { proposalId: string; productRefs: readonly string[] };
}) {
  const editing = Boolean(call);
  const prepared = !call && preset ? preset : null;
  const [name, setName] = useState(call?.name ?? '');
  const [deadline, setDeadline] = useState(toLocalInput(call?.deadline_at));
  const [responsibleId, setResponsibleId] = useState(call?.responsible.user_ref ?? '');
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
  /** P-B: el aviso de que se deja de administrar el borrador está a la vista y espera «Confirmar». */
  const [confirmingHandOver, setConfirmingHandOver] = useState(false);
  const { user } = useAuth();
  const me = user?.id ?? null;

  const [responsibles, setResponsibles] = useState<EligibleResponsible[] | null>(null);
  const [responsiblesError, setResponsiblesError] = useState<string | null>(null);

  const loadResponsibles = useCallback(async () => {
    try {
      setResponsibles(await jointPurchaseCallsService.eligibleResponsibles());
      setResponsiblesError(null);
    } catch (err) {
      setResponsiblesError(callError(err, 'No fue posible cargar los usuarios que pueden ser responsables.'));
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadResponsibles);
  }, [loadResponsibles]);

  const validate = (): Errors => {
    const next: Errors = {};
    const trimmed = name.trim();
    if (!trimmed) next.name = 'Escriba el nombre de la convocatoria.';
    else if (trimmed.length > MAX_NAME) next.name = `El nombre admite hasta ${MAX_NAME} caracteres.`;
    const iso = fromLocalInput(deadline);
    if (!iso) next.deadline = 'Elija la fecha y hora límite.';
    else if (new Date(iso).getTime() <= Date.now()) next.deadline = 'La fecha límite debe ser posterior a este momento.';
    if (!responsibleId) next.responsible = 'Elija el responsable.';
    const count = source === 'catalog' ? catalogRefs.size : positions.size;
    if (count === 0) next.products = 'Elija al menos un producto.';
    return next;
  };

  const [proposal, setProposal] = useState<Proposal | null>(null);
  /** Productos pedidos al preparar que no son líneas del borrador: se ignoran y se avisa. */
  const [ignored, setIgnored] = useState(0);
  const presetRef = useRef(prepared);

  /** Al llegar el borrador preparado, una sola vez: sus líneas de los productos pedidos quedan elegidas. */
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
    // `CreateCallDto` sólo admite `product_ref`: el servidor guarda la línea de origen (propuesta, posición) por sí mismo.
    const refs = (proposal?.lines ?? []).filter((line) => positions.has(line.position)).map((line) => line.product_ref);
    return [...new Set(refs)].map((product_ref) => ({ product_ref }));
  };

  /**
   * Guardar deja a quien guarda sin administrar el borrador: elige a otra persona y crea el borrador, o lo edita
   * siendo hoy la responsable. Si edita sin ser la responsable (con «Administrar») o se elige a sí misma, nada cambia.
   */
  const handsOver = me !== null && responsibleId !== '' && responsibleId !== me && (!call || call.responsible.user_ref === me);
  const responsibleName =
    responsibles?.find((entry) => entry.user_ref === responsibleId)?.name ??
    (call?.responsible.user_ref === responsibleId ? call.responsible.name : null) ??
    'la persona elegida';

  const submit = async (handOverConfirmed = false) => {
    const found = validate();
    setErrors(found);
    setServerError(null);
    if (Object.keys(found).length > 0) {
      setConfirmingHandOver(false);
      return;
    }
    if (handsOver && !handOverConfirmed) {
      setConfirmingHandOver(true);
      return;
    }
    const base = {
      name: name.trim(),
      deadline_at: fromLocalInput(deadline)!,
      responsible_user_id: responsibleId,
      products: chosenProducts(),
    };
    setBusy(true);
    try {
      if (call) {
        // PATCH sólo en DRAFT: se envía el borrador completo; sin borrador de origen, `source_proposal_id: null`.
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
      setConfirmingHandOver(false);
      setBusy(false);
    }
  };

  const handOver = handOverText(responsibleName);
  const dirty =
    !confirmingHandOver &&
    (name !== (call?.name ?? '') ||
      deadline !== toLocalInput(call?.deadline_at) ||
      responsibleId !== (call?.responsible.user_ref ?? '') ||
      (!call && !prepared && (catalogRefs.size > 0 || positions.size > 0)));
  return (
    <Dialog
      title={confirmingHandOver ? 'Antes de guardar: dejará de administrar este borrador' : editing ? 'Editar la convocatoria' : 'Nueva convocatoria'}
      onClose={confirmingHandOver ? () => setConfirmingHandOver(false) : onClose}
      dirty={dirty}
      busy={busy}
      size="lg"
      hideCloseButton
      testId="call-form"
      footer={
        confirmingHandOver ? (
          <>
            <Button variant="secondary" onClick={() => setConfirmingHandOver(false)} disabled={busy}>
              Volver
            </Button>
            <Button onClick={() => void submit(true)} busy={busy}>
              Confirmar
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancelar
            </Button>
            <Button onClick={() => void submit()} busy={busy}>
              {editing ? 'Guardar cambios' : 'Crear borrador'}
            </Button>
          </>
        )
      }
    >
      {confirmingHandOver && (
        <div className="space-y-4" data-testid="handover-warning">
          <Notice kind="warn">
            <p>{handOver.lead}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {handOver.losses.map((loss) => (
                <li key={loss}>{loss}</li>
              ))}
            </ul>
            <p className="mt-2">{handOver.closing}</p>
          </Notice>
        </div>
      )}
      {/* El formulario sigue montado (sin perder lo escrito) mientras el aviso pide confirmación. */}
      <div className="space-y-5" hidden={confirmingHandOver}>
        <p className="text-base text-ink-muted">
          Campaña: <strong className="font-semibold text-ink">{campaignName}</strong>
        </p>
        {serverError && <Notice kind="error">{serverError}</Notice>}
        {prepared && (
          <Notice kind="info" compact>
            <span data-testid="prepared-notice">
              Preparada desde un borrador de compra. Complete el nombre, la fecha límite y el responsable, revise los productos y
              confirme con «Crear borrador». No se crea nada ni se inscribe a nadie hasta entonces.
            </span>
          </Notice>
        )}

        <TextInput
          id="call-name"
          label="Nombre"
          placeholder="Por ejemplo: Herbicidas de invierno"
          value={name}
          maxLength={MAX_NAME}
          autoComplete="off"
          onChange={(event) => setName(event.target.value)}
          error={errors.name}
        />

        <TextInput
          id="call-deadline"
          label="Fecha y hora límite"
          type="datetime-local"
          value={deadline}
          onChange={(event) => setDeadline(event.target.value)}
          help={DEADLINE_HELP}
          error={errors.deadline}
        />

        {responsiblesError ? (
          <div>
            <p className={labelClass}>Responsable</p>
            <DataState compact state="error" description={responsiblesError} onRetry={() => void loadResponsibles()} />
          </div>
        ) : (
          <Select
            id="call-responsible"
            label="Responsable"
            value={responsibleId}
            disabled={!responsibles}
            onChange={(event) => setResponsibleId(event.target.value)}
            error={errors.responsible}
            help={<span data-testid="responsible-notice">{RESPONSIBLE_NOTICE}</span>}
          >
            <option value="">{responsibles ? 'Seleccione…' : 'Cargando…'}</option>
            {(responsibles ?? []).map((user) => (
              <option key={user.user_ref} value={user.user_ref}>
                {user.name}
                {user.user_ref === me ? ' (usted)' : ''}
                {ROLE_LABEL[user.role] ? ` · ${ROLE_LABEL[user.role]}` : ''}
              </option>
            ))}
          </Select>
        )}

        <fieldset className="min-w-0 space-y-3" aria-describedby={errors.products ? 'call-products-error' : undefined}>
          <legend className={labelClass}>Productos</legend>
          <SegmentedControl label="Origen de los productos" hideLabel options={SOURCES} value={source} onChange={setSource} testId="call-product-source" />
          {source === 'catalog' ? (
            <CatalogPicker selected={catalogRefs} onChange={setCatalogRefs} />
          ) : (
            <ProposalPicker
              campaignId={campaignId}
              proposalId={proposalId}
              onProposalId={(id) => {
                presetRef.current = null;
                setIgnored(0);
                setProposalId(id);
                setPositions(new Set());
              }}
              proposal={proposal}
              onProposal={showProposal}
              selected={positions}
              onChange={setPositions}
            />
          )}
          {ignored > 0 && source === 'proposal' && (
            <Notice kind="warn" compact>
              <span data-testid="prepared-ignored">
                {ignored === 1
                  ? '1 producto indicado no es una línea de este borrador de compra y no se preseleccionó.'
                  : `${ignored} productos indicados no son líneas de este borrador de compra y no se preseleccionaron.`}
              </span>
            </Notice>
          )}
          <FieldError id="call-products-error" text={errors.products} />
        </fieldset>
        {!editing && <p className="text-sm text-ink-muted">{CREATE_AS_DRAFT_NOTE}</p>}
      </div>
    </Dialog>
  );
}

function FieldError({ id, text }: { id: string; text?: string }) {
  if (!text) return null;
  return (
    <p id={id} className="flex items-start gap-1.5 text-xs font-semibold leading-relaxed text-danger-ink" role="alert">
      <Icon d={ICON.alert} className="mt-px h-4 w-4" />
      <span>{text}</span>
    </p>
  );
}

/** «Herbicida DEMO · L» / «Urea DEMO · kg» (láminas 15.1 y 45). */
function unitShort(unit: 'L' | 'KG' | string): string {
  return unit === 'KG' ? 'kg' : unit;
}

const LIST_BOX = 'max-h-72 divide-y divide-line overflow-y-auto rounded-[18px] border border-line bg-surface px-4';
const CHECK_ROW = 'flex min-h-12 cursor-pointer items-center gap-3 py-2.5 text-base text-ink';
const CHECK_BOX = 'h-5 w-5 shrink-0 cursor-pointer rounded-[5px] accent-ink';

function toggle<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

/**
 * Catálogo colectivo: sólo productos activos, en L o KG y principales (las
 * denominaciones asociadas a otro producto se excluyen si la lista de
 * asociaciones está disponible; el servidor lo valida igualmente).
 */
function CatalogPicker({ selected, onChange }: { selected: Set<string>; onChange: (next: Set<string>) => void }) {
  const [catalog, setCatalog] = useState<CatalogEntry[] | null>(null);
  const [aliases, setAliases] = useState<Set<string> | null>(null);
  const [aliasesFailed, setAliasesFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    try {
      const [entries, associations] = await Promise.all([
        collectiveService.catalog(),
        collectiveService.associations().catch(() => null),
      ]);
      setCatalog(Array.isArray(entries) ? entries : []);
      if (associations && Array.isArray(associations.current)) {
        setAliases(new Set(associations.current.map((association) => association.product_ref)));
        setAliasesFailed(false);
      } else {
        setAliases(new Set());
        setAliasesFailed(true);
      }
      setError(null);
    } catch (err) {
      setError(collectiveError(err, 'No fue posible cargar el catálogo.'));
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const eligible = useMemo(
    () =>
      (catalog ?? []).filter(
        (entry) => entry.is_active && (entry.base_unit === 'ML' || entry.base_unit === 'G') && !aliases?.has(entry.product_ref),
      ),
    [catalog, aliases],
  );
  const wanted = normalizeName(query);
  const shown = eligible.filter((entry) => !wanted || normalizeName(entry.product_name).includes(wanted) || selected.has(entry.product_ref));

  if (error) return <DataState compact state="error" description={error} onRetry={() => void load()} />;
  if (!catalog) return <DataState compact state="loading" />;
  return (
    <div className="space-y-3">
      {aliasesFailed && (
        <Notice kind="warn" compact>
          No se pudo comprobar qué productos son denominaciones asociadas; el servidor lo valida al guardar.
        </Notice>
      )}
      {eligible.length > 6 && <SearchInput label="Buscar producto" placeholder="Buscar producto" value={query} onChange={setQuery} autoComplete="off" />}
      {eligible.length === 0 ? (
        <DataState compact state="empty" title="Sin productos disponibles" description="El catálogo no tiene productos activos en L o KG." />
      ) : (
        <ul className={LIST_BOX} aria-label="Productos del catálogo">
          {shown.map((entry) => (
            <li key={entry.product_ref}>
              <label className={CHECK_ROW}>
                <input type="checkbox" className={CHECK_BOX} checked={selected.has(entry.product_ref)} onChange={() => onChange(toggle(selected, entry.product_ref))} />
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  {entry.product_name} · {unitShort(presentationUnit(entry.base_unit!))}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-ink-muted">
        {selected.size === 1 ? '1 producto elegido' : `${selected.size} productos elegidos`}. Sólo productos activos del catálogo, en L o kg, que no sean
        nombres equivalentes de otro producto.
      </p>
    </div>
  );
}

/**
 * Líneas de un borrador de propuesta de la campaña. La cifra de cada línea es
 * la divulgada en el borrador (o ninguna): sólo una referencia (E2-D14).
 */
function ProposalPicker({
  campaignId,
  proposalId,
  onProposalId,
  proposal,
  onProposal,
  selected,
  onChange,
}: {
  campaignId: string;
  proposalId: string;
  onProposalId: (id: string) => void;
  proposal: Proposal | null;
  onProposal: (proposal: Proposal | null) => void;
  selected: Set<number>;
  onChange: (next: Set<number>) => void;
}) {
  const [drafts, setDrafts] = useState<ProposalSummary[] | null>(null);
  const [draftsError, setDraftsError] = useState<string | null>(null);
  const [linesError, setLinesError] = useState<string | null>(null);

  const loadDrafts = useCallback(async () => {
    try {
      const list = await collectiveService.proposals(campaignId);
      setDrafts(Array.isArray(list) ? list : []);
      setDraftsError(null);
    } catch (err) {
      setDraftsError(collectiveError(err, 'No fue posible cargar los borradores de compra.'));
    }
  }, [campaignId]);

  const loadProposal = useCallback(
    async (id: string) => {
      onProposal(null);
      if (!id) return;
      try {
        const shown = await collectiveService.proposal(id);
        onProposal(shown);
        setLinesError(null);
      } catch (err) {
        setLinesError(collectiveError(err, 'No fue posible abrir el borrador de compra.'));
      }
    },
    [onProposal],
  );

  useEffect(() => {
    void Promise.resolve().then(loadDrafts);
  }, [loadDrafts]);

  useEffect(() => {
    void Promise.resolve().then(() => loadProposal(proposalId));
  }, [proposalId, loadProposal]);

  if (draftsError) return <DataState compact state="error" description={draftsError} onRetry={() => void loadDrafts()} />;
  if (!drafts) return <DataState compact state="loading" />;
  if (drafts.length === 0)
    return (
      <DataState
        compact
        state="empty"
        title="Sin borradores de compra"
        description="Esta campaña no tiene borradores de compra. Genere uno en «Borrador de compra» o elija productos del catálogo."
      />
    );
  return (
    <div className="space-y-3">
      <Select id="call-proposal" label="Borrador de compra" value={proposalId} onChange={(event) => onProposalId(event.target.value)}>
        <option value="">Seleccione…</option>
        {drafts.map((draft) => (
          <option key={draft.proposal_ref} value={draft.proposal_ref}>
            Generado el {fmtDateTime(draft.generated_at)} · {draft.line_count} {draft.line_count === 1 ? 'línea' : 'líneas'}
          </option>
        ))}
      </Select>
      <p className="text-xs text-ink-muted" data-testid="proposal-reference-note">
        La cifra de cada línea es la necesidad declarada en el borrador, sólo como referencia: no es una cantidad comprometida.
      </p>
      {linesError ? (
        <DataState compact state="error" description={linesError} onRetry={() => void loadProposal(proposalId)} />
      ) : proposalId && !proposal ? (
        <DataState compact state="loading" />
      ) : proposal ? (
        proposal.lines.length === 0 ? (
          <DataState compact state="empty" title="Sin líneas" description="El borrador elegido no tiene líneas." />
        ) : (
          <ul className={LIST_BOX} aria-label="Líneas del borrador de compra">
            {proposal.lines.map((line) => (
              <li key={line.position} data-testid={`proposal-line-${line.position}`}>
                <label className={`${CHECK_ROW} items-start`}>
                  <input type="checkbox" className={`${CHECK_BOX} mt-0.5`} checked={selected.has(line.position)} onChange={() => onChange(toggle(selected, line.position))} />
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    {line.product_name} · {unitShort(line.presentation_unit)}
                    <span className="block text-xs text-ink-muted">{referenceText(line, line.base_unit)}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}
