import { useCallback, useEffect, useMemo, useState } from 'react';
import { DataState, ICON, Icon, Notice, SearchInput, Select } from '../../components/ui';
import { collectiveError, fmtDateTime } from '../../lib/collective-text';
import { referenceText } from '../../lib/joint-purchase-call-text';
import { normalizeName } from '../../lib/product-text';
import { presentationUnit } from '../../lib/quantity';
import { collectiveService } from '../../services/collective.service';
import type { CatalogEntry, Proposal, ProposalSummary } from '../../types/collective';

export function FieldError({ id, text }: { id: string; text?: string }) {
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

/** Catálogo colectivo: sólo productos activos, en L o KG y principales. */
export function CatalogPicker({ selected, onChange }: { selected: Set<string>; onChange: (next: Set<string>) => void }) {
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

/** Líneas de un borrador de propuesta de la campaña. */
export function ProposalPicker({
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
  const [proposalAttempt, setProposalAttempt] = useState(0);

  const loadDrafts = useCallback(async () => {
    try {
      const list = await collectiveService.proposals(campaignId);
      setDrafts(Array.isArray(list) ? list : []);
      setDraftsError(null);
    } catch (err) {
      setDraftsError(collectiveError(err, 'No fue posible cargar los borradores de compra.'));
    }
  }, [campaignId]);

  useEffect(() => {
    let current = true;
    async function loadProposal() {
      if (!current) return;
      onProposal(null);
      setLinesError(null);
      if (!proposalId) return;
      try {
        const shown = await collectiveService.proposal(proposalId);
        if (current) onProposal(shown);
      } catch (err) {
        if (current) setLinesError(collectiveError(err, 'No fue posible abrir el borrador de compra.'));
      }
    }
    void Promise.resolve().then(loadProposal);
    return () => { current = false; };
  }, [campaignId, proposalId, onProposal, proposalAttempt]);

  useEffect(() => {
    void Promise.resolve().then(loadDrafts);
  }, [loadDrafts]);

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
        <DataState compact state="error" description={linesError} onRetry={() => setProposalAttempt((attempt) => attempt + 1)} />
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
