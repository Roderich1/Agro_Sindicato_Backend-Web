import { useState, type ReactNode } from 'react';
import { Button, Checkbox, Chip, DataState, SearchInput, Select, Textarea } from '../../components/ui';
import { identificationError, MATCHED_ON_LABEL, SIMILARITY_LABEL } from '../../lib/identification-text';
import { normalizeName } from '../../lib/product-text';
import { identificationService } from '../../services/identification.service';
import type { CatalogEntry } from '../../types/collective';
import type { IdentificationCandidate } from '../../types/identification';
import { MAX_TEXT, unchanged, unitWord, type ActionProps } from './identification.constants';

/** Motivo (o nota) y casilla de confirmación, obligatorios en las tres decisiones; el botón espera a los dos (H-16). */
export function ReasonConfirmSubmit({
  id,
  label,
  text,
  onText,
  confirmed,
  onConfirmed,
  confirmText,
  submitLabel,
  ready,
  busy,
  onSubmit,
  onCancel,
}: {
  id: string;
  label: string;
  text: string;
  onText: (value: string) => void;
  confirmed: boolean;
  onConfirmed: (value: boolean) => void;
  confirmText: ReactNode;
  submitLabel: string;
  ready: boolean;
  busy: boolean;
  onSubmit: () => void;
  onCancel?: () => void;
}) {
  return (
    <>
      <Textarea
        id={id}
        label={label}
        maxLength={MAX_TEXT}
        value={text}
        onChange={(event) => onText(event.target.value)}
        help={`Obligatorio. Queda en el historial y en la bitácora. ${text.length} de ${MAX_TEXT} caracteres.`}
        disabled={busy}
      />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Checkbox label={confirmText} checked={confirmed} onChange={(event) => onConfirmed(event.target.checked)} disabled={busy} className="min-w-0" />
        <div className="flex flex-col-reverse gap-2 sm:shrink-0 sm:flex-row">
          {onCancel && (
            <Button variant="secondary" onClick={onCancel} disabled={busy}>
              Cancelar
            </Button>
          )}
          <Button size="lg" onClick={onSubmit} disabled={!ready} busy={busy}>
            {submitLabel}
          </Button>
        </div>
      </div>
    </>
  );
}

export function LinkPanel({
  request,
  candidates,
  candidatesError,
  onRetryCandidates,
  catalog,
  catalogLoaded,
  catalogError,
  onRetryCatalog,
  target,
  targetName,
  onTarget,
  onError,
  onDone,
}: ActionProps & {
  candidates: IdentificationCandidate[] | null;
  candidatesError: string | null;
  onRetryCandidates: () => void;
  /** Catálogo activo de la misma dimensión. */
  catalog: CatalogEntry[];
  catalogLoaded: boolean;
  catalogError: string | null;
  onRetryCatalog: () => void;
  target: string;
  targetName: string | null;
  onTarget: (ref: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const wanted = normalizeName(query);
  const shown = catalog.filter((entry) => !wanted || normalizeName(entry.product_name).includes(wanted) || entry.product_ref === target);
  const ready = Boolean(target && targetName) && reason.trim().length > 0 && confirmed && !busy;

  const submit = async () => {
    if (!ready || !targetName) return;
    setBusy(true);
    onError(null);
    try {
      const result = await identificationService.link(request.id, { product_ref: target, reason: reason.trim(), confirmed: true });
      onDone(
        unchanged(result)
          ? `“${request.local_name}” ya estaba vinculado con “${targetName}”; no cambió nada.`
          : `“${request.local_name}” vinculado con “${targetName}”. La decisión queda en la bitácora.`,
      );
    } catch (err) {
      onError(identificationError(err, 'No fue posible guardar el vínculo.'));
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold text-ink">Parecidos en el catálogo</legend>
        <p className="mb-2 text-sm text-ink-muted" data-testid="candidates-disclaimer">
          Sugerencias por parecido del nombre; la decisión es suya.
        </p>
        {candidatesError ? (
          <DataState compact state="error" description={candidatesError} onRetry={onRetryCandidates} />
        ) : !candidates ? (
          <DataState compact state="loading" />
        ) : candidates.length === 0 ? (
          <DataState compact state="empty" title="Sin sugerencias" description="El servidor no encontró productos parecidos de la misma dimensión. Puede buscar en el catálogo." />
        ) : (
          <ul className="space-y-2.5">
            {candidates.map((candidate) => {
              const checked = target === candidate.product_ref;
              return (
                <li key={candidate.product_ref} data-testid={`candidate-${candidate.product_ref}`}>
                  <label
                    className={`flex items-start gap-3 rounded-[18px] bg-surface px-4 py-3 ${checked ? 'border-2 border-ink' : 'border border-line'} ${
                      candidate.is_active ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
                    }`}
                  >
                    <input
                      type="radio"
                      name={`identification-candidate-${request.id}`}
                      className="mt-1 h-5 w-5 shrink-0 accent-ink"
                      value={candidate.product_ref}
                      checked={checked}
                      disabled={!candidate.is_active || busy}
                      onChange={() => onTarget(candidate.product_ref)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-base font-semibold text-ink [overflow-wrap:anywhere]">{candidate.product_name}</span>
                        <span data-similarity={candidate.similarity}>
                          <Chip tone={candidate.similarity === 'ALTA' ? 'positive' : 'neutral'}>{SIMILARITY_LABEL[candidate.similarity] ?? candidate.similarity}</Chip>
                        </span>
                      </span>
                      <span className="mt-0.5 block text-sm text-ink-muted">
                        {unitWord(candidate.unit)}
                        {candidate.matched_on.length > 0 && ` · Coincide en ${candidate.matched_on.map((field) => MATCHED_ON_LABEL[field] ?? field).join(' y ')}.`}
                        {candidate.is_alias && ' Es una denominación asociada a otro producto.'}
                        {!candidate.is_active && ' Producto inactivo: no se puede vincular.'}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>

      <div className="space-y-3">
        <SearchInput
          id={`identification-search-${request.id}`}
          label={`Buscar en el catálogo (${request.unit === 'KG' ? 'masa' : 'volumen'})`}
          value={query}
          onChange={setQuery}
          placeholder="Buscar otro producto del catálogo"
          autoComplete="off"
          className="bg-field"
        />
        {catalogError ? (
          <DataState compact state="error" description={catalogError} onRetry={onRetryCatalog} />
        ) : (
          <Select
            id={`identification-product-${request.id}`}
            label="Producto del catálogo"
            value={shown.some((entry) => entry.product_ref === target) ? target : ''}
            disabled={!catalogLoaded || busy}
            onChange={(event) => onTarget(event.target.value)}
            help={`Sólo aparecen productos activos en ${unitWord(request.unit)}.`}
          >
            <option value="">{catalogLoaded ? 'Seleccione…' : 'Cargando…'}</option>
            {shown.map((entry) => (
              <option key={entry.product_ref} value={entry.product_ref}>
                {entry.product_name} ({entry.unit})
              </option>
            ))}
          </Select>
        )}
      </div>

      <ReasonConfirmSubmit
        id={`identification-link-reason-${request.id}`}
        label="Motivo"
        text={reason}
        onText={setReason}
        confirmed={confirmed}
        onConfirmed={setConfirmed}
        confirmText={targetName ? `Confirmo que «${request.local_name}» es «${targetName}».` : 'Confirmo que es el mismo producto.'}
        submitLabel="Confirmar identificación"
        ready={ready}
        busy={busy}
        onSubmit={() => void submit()}
      />
    </div>
  );
}
