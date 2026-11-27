import { useCallback, useEffect, useState } from 'react';
import { Facts } from '../../components/c/bits';
import { Button, Checkbox, DataState, Icon, ICON, Notice, Select, Textarea, TextInput } from '../../components/ui';
import { collectiveError } from '../../lib/collective-text';
import { identificationError, identificationErrorCode } from '../../lib/identification-text';
import { normalizeName } from '../../lib/product-text';
import { collectiveService } from '../../services/collective.service';
import { identificationService } from '../../services/identification.service';
import type { CatalogEntry } from '../../types/collective';
import type { IdentificationRequest } from '../../types/identification';
import { MAX_TEXT, unchanged, unitTitle, unitWord, type ActionProps } from './identification.constants';
import { Clarifications, History } from './identification-list';
import { ReasonConfirmSubmit } from './identification-link-panel';

/**
 * Crear el producto colectivo e identificar, en una sola operación del
 * servidor (`create-product`). No usa `ProductForm`: ése crea con
 * `/inventory/products` sin vincular, y el contrato pide crear y vincular a la
 * vez, con motivo y confirmación. Unidad fija: la de la solicitud.
 */
export function CreatePanel({
  request,
  catalog,
  onUseExisting,
  onNameTaken,
  onError,
  onDone,
}: ActionProps & {
  catalog: CatalogEntry[];
  onUseExisting: (entry: CatalogEntry) => void;
  onNameTaken: (name: string) => void;
}) {
  const [name, setName] = useState(request.local_name);
  const [ingredient, setIngredient] = useState(request.active_ingredient ?? '');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const trimmed = name.trim();
  const clash = trimmed ? catalog.find((entry) => normalizeName(entry.product_name) === normalizeName(trimmed)) ?? null : null;
  const linkable = clash !== null && clash.is_active && clash.base_unit === request.base_unit;
  const ready = trimmed.length >= 2 && trimmed.length <= 160 && !clash && reason.trim().length > 0 && confirmed && !busy;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    onError(null);
    try {
      await identificationService.createProduct(request.id, {
        name: trimmed,
        active_ingredient: ingredient.trim() || null,
        reason: reason.trim(),
        confirmed: true,
      });
      onDone(`Se creó el producto colectivo “${trimmed}” y “${request.local_name}” quedó vinculado con él. La decisión queda en la bitácora.`);
    } catch (err) {
      setBusy(false);
      if (identificationErrorCode(err) === 'PRODUCT_NAME_TAKEN') onNameTaken(trimmed);
      else onError(identificationError(err, 'No fue posible crear el producto colectivo.'));
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <TextInput
        id={`identification-new-name-${request.id}`}
        label="Nombre del producto colectivo"
        value={name}
        maxLength={160}
        autoComplete="off"
        onChange={(event) => setName(event.target.value)}
        disabled={busy}
        error={
          clash ? (
            <span role="alert">
              Ya existe “{clash.product_name}”{clash.is_active ? '' : ' (inactivo)'} en el catálogo del sindicato.{' '}
              {linkable ? (
                <button type="button" className="font-semibold text-link underline underline-offset-2" onClick={() => onUseExisting(clash)}>
                  Vincular con “{clash.product_name}”
                </button>
              ) : (
                'Elija otro nombre.'
              )}
            </span>
          ) : undefined
        }
      />
      <TextInput
        id={`identification-new-ingredient-${request.id}`}
        label="Ingrediente activo"
        optional
        value={ingredient}
        maxLength={120}
        autoComplete="off"
        onChange={(event) => setIngredient(event.target.value)}
        disabled={busy}
      />
      <p className="flex flex-wrap items-center gap-2 text-sm text-ink" data-testid="identification-unit-locked">
        <Icon d={ICON.lock} className="h-4 w-4" />
        Unidad: <span className="font-semibold">{request.unit}</span>
        <span className="text-ink-muted">({unitWord(request.unit)}, la de la solicitud; no se cambia)</span>
      </p>
      <ReasonConfirmSubmit
        id={`identification-create-reason-${request.id}`}
        label="Motivo"
        text={reason}
        onText={setReason}
        confirmed={confirmed}
        onConfirmed={setConfirmed}
        confirmText={`Confirmo que se crea «${trimmed || '…'}» en ${unitWord(request.unit)} y que «${request.local_name}» queda identificado con él.`}
        submitLabel="Crear e identificar"
        ready={ready}
        busy={busy}
        onSubmit={() => void submit()}
      />
    </div>
  );
}

export function DeferPanel({ request, onError, onDone }: ActionProps) {
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const ready = note.trim().length > 0 && confirmed && !busy;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    onError(null);
    try {
      await identificationService.defer(request.id, { note: note.trim(), confirmed: true });
      onDone(`“${request.local_name}” sigue pendiente por falta de información. La nota queda en la bitácora.`);
    } catch (err) {
      onError(identificationError(err, 'No fue posible guardar la nota.'));
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <ReasonConfirmSubmit
        id={`identification-defer-note-${request.id}`}
        label="Nota"
        text={note}
        onText={setNote}
        confirmed={confirmed}
        onConfirmed={setConfirmed}
        confirmText="Confirmo que sigue pendiente. El agricultor verá la nota en su teléfono."
        submitLabel="Dejar pendiente"
        ready={ready}
        busy={busy}
        onSubmit={() => void submit()}
      />
    </div>
  );
}

/** Lámina 24: «Corregir la identificación» de una solicitud ya identificada (`link` → `RELINKED`). */
export function CorrectionPanel({ request, onCancel, onDone }: { request: IdentificationRequest; onCancel: () => void; onDone: (text: string) => void }) {
  const [catalog, setCatalog] = useState<CatalogEntry[] | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [target, setTarget] = useState('');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCatalog = useCallback(async () => {
    try {
      setCatalog(await collectiveService.catalog());
      setCatalogError(null);
    } catch (err) {
      setCatalogError(collectiveError(err, 'No fue posible cargar el catálogo.'));
    }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(loadCatalog);
  }, [loadCatalog]);

  const options = (catalog ?? []).filter((entry) => entry.base_unit === request.base_unit && entry.is_active);
  const targetName = options.find((entry) => entry.product_ref === target)?.product_name ?? null;
  const current = request.resolution?.product_ref === target;
  const ready = Boolean(targetName) && reason.trim().length > 0 && confirmed && !busy;

  const submit = async () => {
    if (!ready || !targetName) return;
    setBusy(true);
    setError(null);
    try {
      const result = await identificationService.link(request.id, { product_ref: target, reason: reason.trim(), confirmed: true });
      onDone(
        unchanged(result)
          ? `“${request.local_name}” ya estaba vinculado con “${targetName}”; no cambió nada.`
          : `“${request.local_name}” vinculado con “${targetName}”. La decisión queda en la bitácora.`,
      );
    } catch (err) {
      setError(identificationError(err, 'No fue posible guardar la corrección.'));
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <h2 className="font-display text-2xl font-bold text-ink">Corregir la identificación</h2>
      <Facts
        rows={[
          ['Nombre enviado', `«${request.local_name}»`],
          ['Identificado como', request.resolution?.product_name ?? '—'],
          ['Unidad', unitTitle(request.unit)],
        ]}
      />
      {catalogError ? (
        <DataState compact state="error" description={catalogError} onRetry={() => void loadCatalog()} />
      ) : (
        <Select
          id={`correction-product-${request.id}`}
          label="Producto correcto"
          value={target}
          disabled={catalog === null || busy}
          onChange={(event) => setTarget(event.target.value)}
          help={`Sólo aparecen productos activos en ${unitWord(request.unit)}.`}
        >
          <option value="">{catalog === null ? 'Cargando…' : 'Seleccione…'}</option>
          {options.map((entry) => (
            <option key={entry.product_ref} value={entry.product_ref}>
              {entry.product_name} ({entry.unit})
            </option>
          ))}
        </Select>
      )}
      {target && targetName && current && (
        <Notice kind="info" compact>
          «{targetName}» es la identificación vigente: guardar no cambia nada.
        </Notice>
      )}
      <Textarea
        id={`correction-reason-${request.id}`}
        label="Motivo"
        maxLength={MAX_TEXT}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        help="Obligatorio. Queda en el historial."
        disabled={busy}
      />
      <p className="text-base leading-relaxed text-ink-muted">
        Corrige la identificación que hizo el sindicato. No cambia por sí sola el inventario, las compras ni los vínculos del agricultor en su
        aplicación: el vínculo lo confirma él.
      </p>
      <Checkbox label="Confirmo el cambio. El cambio se aplicará a resultados futuros." checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={busy} />
      {error && <Notice kind="error">{error}</Notice>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Cancelar
        </Button>
        <Button onClick={() => void submit()} disabled={!ready} busy={busy}>
          Guardar corrección
        </Button>
      </div>
      <Clarifications request={request} />
      <History requestId={request.id} />
    </div>
  );
}
