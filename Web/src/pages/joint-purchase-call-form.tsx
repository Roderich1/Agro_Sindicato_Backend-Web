import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from '../components/app-shell';
import { Button, DataState, inputClass, labelClass, Notice, SegmentedControl } from '../components/ui';
import { collectiveError, fmtDateTime } from '../lib/collective-text';
import {
  callError,
  fromLocalInput,
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
  { value: 'proposal', label: 'Tomar productos de un borrador de propuesta' },
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
 */
export function JointPurchaseCallForm({
  campaignId,
  campaignName,
  call,
  onClose,
  onSaved,
}: {
  campaignId: string;
  campaignName: string;
  /** Borrador a editar; sin él, se crea uno nuevo. */
  call?: JointPurchaseCallDetail;
  onClose: () => void;
  onSaved: (saved: { id: string | null; text: string }) => void;
}) {
  const editing = Boolean(call);
  const [name, setName] = useState(call?.name ?? '');
  const [deadline, setDeadline] = useState(toLocalInput(call?.deadline_at));
  const [responsibleId, setResponsibleId] = useState(call?.responsible.user_ref ?? '');
  const [source, setSource] = useState<Source>(call?.source_proposal_ref ? 'proposal' : 'catalog');
  const [catalogRefs, setCatalogRefs] = useState<Set<string>>(
    () => new Set(call && !call.source_proposal_ref ? call.products.map((product) => product.product_ref) : []),
  );
  const [proposalId, setProposalId] = useState(call?.source_proposal_ref ?? '');
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

  const chosenProducts = (): JointPurchaseCallProductInput[] => {
    if (source === 'catalog') return [...catalogRefs].map((product_ref) => ({ product_ref }));
    // `CreateCallDto` sólo admite `product_ref`: el servidor guarda la línea de origen (propuesta, posición) por sí mismo.
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
      setServerError(callError(err, 'No fue posible guardar el borrador.'));
      setBusy(false);
    }
  };

  return (
    <Modal title={editing ? 'Editar borrador de convocatoria' : 'Nueva convocatoria'} onClose={onClose} size="lg">
      <div className="space-y-4">
        <p className="text-sm text-slate-700">
          Campaña: <span className="font-semibold">{campaignName}</span>
        </p>
        {serverError && <Notice kind="error">{serverError}</Notice>}

        <div>
          <label className={labelClass} htmlFor="call-name">
            Nombre
          </label>
          <input
            id="call-name"
            className={inputClass}
            value={name}
            maxLength={MAX_NAME}
            autoComplete="off"
            onChange={(event) => setName(event.target.value)}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? 'call-name-error' : undefined}
          />
          <FieldError id="call-name-error" text={errors.name} />
        </div>

        <div>
          <label className={labelClass} htmlFor="call-deadline">
            Fecha y hora límite
          </label>
          <input
            id="call-deadline"
            type="datetime-local"
            className={inputClass}
            value={deadline}
            onChange={(event) => setDeadline(event.target.value)}
            aria-invalid={errors.deadline ? true : undefined}
            aria-describedby="call-deadline-note"
          />
          <p id="call-deadline-note" className="mt-1 text-xs text-slate-600">
            Hora del servidor del sindicato: el plazo se cumple según su reloj, no según el de este equipo.
          </p>
          <FieldError id="call-deadline-error" text={errors.deadline} />
        </div>

        <div>
          <label className={labelClass} htmlFor="call-responsible">
            Responsable
          </label>
          {responsiblesError ? (
            <DataState compact state="error" description={responsiblesError} onRetry={() => void loadResponsibles()} />
          ) : (
            <select
              id="call-responsible"
              className={inputClass}
              value={responsibleId}
              disabled={!responsibles}
              onChange={(event) => setResponsibleId(event.target.value)}
              aria-invalid={errors.responsible ? true : undefined}
              aria-describedby="call-responsible-note"
            >
              <option value="">{responsibles ? 'Seleccione…' : 'Cargando…'}</option>
              {(responsibles ?? []).map((user) => (
                <option key={user.user_ref} value={user.user_ref}>
                  {user.name}
                  {ROLE_LABEL[user.role] ? ` · ${ROLE_LABEL[user.role]}` : ''}
                </option>
              ))}
            </select>
          )}
          <p id="call-responsible-note" className="mt-1 text-xs text-slate-600" data-testid="responsible-notice">
            {RESPONSIBLE_NOTICE}
          </p>
          <FieldError id="call-responsible-error" text={errors.responsible} />
        </div>

        <fieldset className="space-y-3">
          <legend className={labelClass}>Productos</legend>
          <SegmentedControl label="Origen de los productos" options={SOURCES} value={source} onChange={setSource} testId="call-product-source" />
          {source === 'catalog' ? (
            <CatalogPicker selected={catalogRefs} onChange={setCatalogRefs} />
          ) : (
            <ProposalPicker
              campaignId={campaignId}
              proposalId={proposalId}
              onProposalId={(id) => {
                setProposalId(id);
                setPositions(new Set());
              }}
              proposal={proposal}
              onProposal={setProposal}
              selected={positions}
              onChange={setPositions}
            />
          )}
          <FieldError id="call-products-error" text={errors.products} />
        </fieldset>

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {busy ? 'Guardando…' : editing ? 'Guardar borrador' : 'Crear borrador'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function FieldError({ id, text }: { id: string; text?: string }) {
  if (!text) return null;
  return (
    <p id={id} className="mt-1 text-xs font-semibold text-red-700" role="alert">
      {text}
    </p>
  );
}

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
    <div className="space-y-2">
      <p className="text-xs text-slate-600">
        Sólo productos activos del catálogo del sindicato, en L o KG, que no sean denominaciones asociadas a otro producto.
      </p>
      {aliasesFailed && (
        <Notice kind="warn" compact>
          No se pudo comprobar qué productos son denominaciones asociadas; el servidor lo valida al guardar.
        </Notice>
      )}
      <label className="sr-only" htmlFor="call-catalog-search">
        Buscar producto
      </label>
      <input
        id="call-catalog-search"
        type="search"
        autoComplete="off"
        className={inputClass}
        placeholder="Buscar producto"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {eligible.length === 0 ? (
        <DataState compact state="empty" title="Sin productos disponibles" description="El catálogo no tiene productos activos en L o KG." />
      ) : (
        <ul className="max-h-64 space-y-1 overflow-y-auto" aria-label="Productos del catálogo">
          {shown.map((entry) => (
            <li key={entry.product_ref}>
              <label className="flex items-center gap-2 rounded-control px-2 py-1.5 text-sm hover:bg-slate-50">
                <input
                  type="checkbox"
                  className="shrink-0"
                  checked={selected.has(entry.product_ref)}
                  onChange={() => onChange(toggle(selected, entry.product_ref))}
                />
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  {entry.product_name} <span className="text-xs text-slate-500">({presentationUnit(entry.base_unit!)})</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-slate-600">{selected.size === 1 ? '1 producto elegido.' : `${selected.size} productos elegidos.`}</p>
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
      setDraftsError(collectiveError(err, 'No fue posible cargar los borradores de propuesta.'));
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
        setLinesError(collectiveError(err, 'No fue posible abrir el borrador de propuesta.'));
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
        title="Sin borradores de propuesta"
        description="Esta campaña no tiene borradores de propuesta. Genere uno en «Necesidades y propuestas» o elija productos del catálogo."
      />
    );
  return (
    <div className="space-y-2">
      <label className={labelClass} htmlFor="call-proposal">
        Borrador de propuesta
      </label>
      <select id="call-proposal" className={inputClass} value={proposalId} onChange={(event) => onProposalId(event.target.value)}>
        <option value="">Seleccione…</option>
        {drafts.map((draft) => (
          <option key={draft.proposal_ref} value={draft.proposal_ref}>
            Generado el {fmtDateTime(draft.generated_at)} · {draft.line_count} {draft.line_count === 1 ? 'línea' : 'líneas'}
          </option>
        ))}
      </select>
      <p className="text-xs text-slate-600" data-testid="proposal-reference-note">
        La cifra de cada línea es la divulgada en el borrador, sólo como referencia: no es una cantidad comprometida.
      </p>
      {linesError ? (
        <DataState compact state="error" description={linesError} onRetry={() => void loadProposal(proposalId)} />
      ) : proposalId && !proposal ? (
        <DataState compact state="loading" />
      ) : proposal ? (
        proposal.lines.length === 0 ? (
          <DataState compact state="empty" title="Sin líneas" description="El borrador elegido no tiene líneas." />
        ) : (
          <ul className="max-h-64 space-y-1 overflow-y-auto" aria-label="Líneas del borrador de propuesta">
            {proposal.lines.map((line) => (
              <li key={line.position} data-testid={`proposal-line-${line.position}`}>
                <label className="flex items-start gap-2 rounded-control px-2 py-1.5 text-sm hover:bg-slate-50">
                  <input
                    type="checkbox"
                    className="mt-0.5 shrink-0"
                    checked={selected.has(line.position)}
                    onChange={() => onChange(toggle(selected, line.position))}
                  />
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    {line.product_name} <span className="text-xs text-slate-500">({line.presentation_unit})</span>
                    <span className="block text-xs text-slate-600">{referenceText(line, line.base_unit)}</span>
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
