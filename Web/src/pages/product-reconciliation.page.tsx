import axios from 'axios';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AppShell } from '../components/app-shell';
import { Facts, UnitBadge } from '../components/c/bits';
import { unitInfo } from '../components/c/unit';
import { ViewHeader } from '../components/c/view-header';
import { ProductForm } from '../components/product-form';
import { Button, Checkbox, ConfirmDialog, DataState, Dialog, Icon, ICON, Notice, SearchInput, Select, surfaceClass, Textarea } from '../components/ui';
import { useAuth } from '../hooks/use-auth';
import { collectiveError, fmtDateTime } from '../lib/collective-text';
import { normalizeName, type ProductUnit } from '../lib/product-text';
import { collectiveService } from '../services/collective.service';
import type { Association, AssociationList, CatalogEntry } from '../types/collective';

type DialogState = { kind: 'associate'; product: CatalogEntry; current: Association | null } | { kind: 'close'; association: Association };

const MAX_REASON = 280;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const matches = (query: string, ...names: string[]) => {
  const wanted = normalizeName(query);
  return !wanted || names.some((name) => normalizeName(name).includes(wanted));
};
const DAY = new Intl.DateTimeFormat('es-BO', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtDay = (value: string) => DAY.format(new Date(value));
const dimensionText = (baseUnit: CatalogEntry['base_unit']) => (baseUnit === 'G' ? 'kilogramos' : baseUnit === 'ML' ? 'litros' : null);

/**
 * Catálogo → Nombres equivalentes (lámina 22; diálogos 30.6 «Unir» y 34.5
 * «Separar»). F07-REC-01 (#108, CU-18): la Directiva une un nombre del
 * catálogo con el producto bajo el que se agrupan sus cifras. Nada se une sin
 * motivo y confirmación explícitos; los nombres originales no cambian y cada
 * cambio queda en el historial. Sin sugerencias automáticas.
 *
 * - «Nombres unidos»: las uniones vigentes, con «Corregir…» (H-01: `POST` con
 *   otro producto cierra la unión vigente y abre otra) y «Separar…».
 * - «Historial de cambios»: vigentes y cerradas, con quién y por qué.
 * - «Nombres sueltos»: los nombres que no son parte de ninguna unión (ni
 *   alias vigente ni nombre principal de una unión), con «Unir con…».
 *
 * Los candidatos se filtran sólo por dimensión (L con L, kg con kg), en orden
 * alfabético, sin porcentajes de parecido. El efecto «antes y después» de una
 * unión no existe en la API: se dice «no disponible».
 */
export function ProductReconciliationPage() {
  return (
    <AppShell title="Nombres equivalentes" section="Catálogo">
      <ProductReconciliationView />
    </AppShell>
  );
}

export function ProductReconciliationView({ headingLevel = 1, title = 'Nombres equivalentes', nav }: { headingLevel?: 1 | 2; title?: string; nav?: ReactNode }) {
  const { user } = useAuth();
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [associations, setAssociations] = useState<AssociationList>({ current: [], history: [] });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<{ message: string; forbidden: boolean } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    try {
      const [products, list] = await Promise.all([collectiveService.catalog(), collectiveService.associations()]);
      setCatalog(products);
      setAssociations(list);
      setError(null);
      setLoaded(true);
    } catch (err) {
      setError({ message: collectiveError(err, 'No fue posible cargar el catálogo.'), forbidden: axios.isAxiosError(err) && err.response?.status === 403 });
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const aliasOf = new Map(associations.current.map((row) => [row.product_ref, row]));
  const canonicalRefs = new Set(associations.current.map((row) => row.canonical_product_ref));
  const catalogEntry = (ref: string) => catalog.find((product) => product.product_ref === ref);
  const loose = catalog.filter((product) => !aliasOf.has(product.product_ref) && !canonicalRefs.has(product.product_ref));
  const canonicals = catalog.filter((product) => canonicalRefs.has(product.product_ref));
  const fullHistory = [...associations.current, ...associations.history].sort((a, b) => b.valid_from.localeCompare(a.valid_from));
  const shownLoose = loose.filter((product) => matches(query, product.product_name));
  const shownCurrent = associations.current.filter((row) => matches(query, row.product_name, row.canonical_product_name));
  const shownHistory = fullHistory.filter((row) => matches(query, row.product_name, row.canonical_product_name));
  const filtered = query.trim().length > 0;
  const noMatch = (what: string, onDark = false) => (
    <div className={onDark ? 'rounded-card bg-surface' : ''}>
      <DataState compact state="no-match" description={`Ningún ${what} coincide con «${query.trim()}».`} onClearFilters={() => setQuery('')} />
    </div>
  );

  const done = async (text: string) => {
    setDialog(null);
    setMessage(text);
    await load();
  };

  return (
    <div className="space-y-5">
      <ViewHeader
        headingLevel={headingLevel}
        title={title}
        eyebrow={user?.tenant?.name}
        subtitle="Cuando los agricultores usan nombres distintos para el mismo producto, únalos aquí: sus cifras se agruparán bajo un solo nombre en el resumen y en los borradores nuevos. Los nombres originales y los datos de los agricultores no cambian. Sólo se unen litros con litros y kilogramos con kilogramos."
      />
      {nav}
      {message && <Notice kind="ok">{message}</Notice>}
      {error && (
        <div className={surfaceClass}>
          <DataState compact state={error.forbidden ? 'forbidden' : 'error'} description={error.message} onRetry={error.forbidden ? undefined : () => void load()} />
        </div>
      )}
      {!loaded && !error && (
        <div className={surfaceClass}>
          <DataState state="loading" compact />
        </div>
      )}

      {loaded && !error && (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <section className="ui-on-ink min-w-0 rounded-card bg-ink px-5 py-6 text-white sm:px-7" aria-labelledby="unions-title">
            <h2 id="unions-title" className="font-display text-2xl font-bold text-white">
              Nombres unidos
            </h2>
            <p className="mt-0.5 text-sm text-on-ink-muted">
              {associations.current.length === 0 ? 'Ninguna unión vigente' : plural(associations.current.length, 'unión vigente', 'uniones vigentes')}
            </p>
            <div className="mt-4 border-t border-ink-line">
              {associations.current.length === 0 ? (
                <p className="py-4 text-sm text-on-ink-muted">Todavía no hay nombres unidos. Cada nombre se consolida por separado hasta que se una con otro.</p>
              ) : shownCurrent.length === 0 ? (
                <div className="py-4">{noMatch('nombre unido', true)}</div>
              ) : (
                <ul className="divide-y divide-ink-line" aria-label="Uniones vigentes">
                  {shownCurrent.map((row) => {
                    const entry = catalogEntry(row.product_ref);
                    return (
                      <li key={row.association_ref} className="py-4" data-testid={`current-${row.product_name}`}>
                        <p className="flex flex-wrap items-center gap-2">
                          <span className="rounded-control bg-ink-raised px-3 py-1.5 font-semibold text-white [overflow-wrap:anywhere]">{row.product_name}</span>
                          <Icon d={ICON.arrowRight} className="h-5 w-5 shrink-0 text-lime" />
                          <span className="sr-only">se agrupa bajo</span>
                          <span className="rounded-control bg-lime px-3 py-1.5 font-semibold text-ink [overflow-wrap:anywhere]">{row.canonical_product_name}</span>
                        </p>
                        <p className="mt-2 text-sm text-on-ink-muted">
                          Desde el {fmtDay(row.valid_from)} · unidos por {row.actor_name}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {entry && (
                            <Button variant="on-dark" size="sm" onClick={() => setDialog({ kind: 'associate', product: entry, current: row })} aria-label={`Corregir la unión de «${row.product_name}»`}>
                              Corregir…
                            </Button>
                          )}
                          <Button variant="on-dark" size="sm" onClick={() => setDialog({ kind: 'close', association: row })} aria-label={`Separar «${row.product_name}»`}>
                            Separar…
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <details className="group border-t border-ink-line" data-testid="association-history">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3 font-semibold text-white focus-visible:outline-2 [&::-webkit-details-marker]:hidden">
                <span>
                  Historial de cambios{' '}
                  <span className="font-normal text-on-ink-muted">({filtered ? `${shownHistory.length} de ${fullHistory.length}` : fullHistory.length})</span>
                </span>
                <Icon d={ICON.chevronRight} className="h-5 w-5 shrink-0 group-open:rotate-90" />
              </summary>
              <p className="pb-2 text-sm text-on-ink-muted">Corregir cierra la unión anterior y abre otra; separar la cierra. Nada se borra.</p>
              {fullHistory.length === 0 ? (
                <p className="pb-3 text-sm text-on-ink-muted">Sin cambios registrados.</p>
              ) : shownHistory.length === 0 ? (
                <div className="pb-3">{noMatch('cambio del historial', true)}</div>
              ) : (
                <ol className="space-y-3 pb-2" aria-label="Historial de cambios">
                  {shownHistory.map((row) => (
                    <li key={row.association_ref} className="rounded-control bg-ink-raised px-4 py-3 text-sm" data-testid={`history-${row.association_ref}`}>
                      <p className="font-semibold text-white [overflow-wrap:anywhere]">
                        {row.product_name} → {row.canonical_product_name}
                      </p>
                      <p className="mt-0.5 text-on-ink-muted">
                        {fmtDateTime(row.valid_from)} – {row.valid_to ? fmtDateTime(row.valid_to) : 'vigente'}
                      </p>
                      <p className="mt-1 text-on-ink [overflow-wrap:anywhere]">
                        Unido por {row.actor_name}: {row.reason}
                      </p>
                      {row.closed_by_name && (
                        <p className="mt-0.5 text-on-ink [overflow-wrap:anywhere]">
                          Cerrado por {row.closed_by_name}: {row.close_reason ?? ''}
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </details>
          </section>

          <section className={`${surfaceClass} min-w-0 px-5 py-6 sm:px-7`} aria-labelledby="loose-title">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h2 id="loose-title" className="font-display text-2xl font-bold text-ink">
                  Nombres sueltos
                </h2>
                <p className="mt-0.5 text-sm text-ink-muted">{loose.length === 0 ? 'Ningún nombre sin unir' : plural(loose.length, 'nombre sin unir', 'nombres sin unir')}</p>
              </div>
              <SearchInput
                id="association-search"
                label="Buscar nombre"
                value={query}
                onChange={setQuery}
                placeholder="Buscar nombre"
                enterKeyHint="search"
                inputMode="search"
                autoComplete="off"
                fieldClassName="w-full sm:w-64"
                className="bg-field"
              />
            </div>
            <div className="mt-4 border-t border-line">
              {loose.length === 0 ? (
                <DataState state="empty" compact title="Todos los nombres están unidos" description="" />
              ) : shownLoose.length === 0 ? (
                noMatch('nombre suelto')
              ) : (
                <ul className="divide-y divide-line" aria-label="Nombres sueltos">
                  {shownLoose.map((product) => {
                    const linkable = product.base_unit !== null;
                    return (
                      <li key={product.product_ref} className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 py-3" data-testid={`product-${product.product_name}`}>
                        <UnitBadge unit={product.unit} />
                        <div className="min-w-0 flex-1 basis-40">
                          <p className="font-semibold text-ink [overflow-wrap:anywhere]">{product.product_name}</p>
                          {(!linkable || !product.is_active) && (
                            <p className="text-sm text-ink-muted">
                              {[!product.is_active && 'Inactivo', !linkable && `Unidad «${product.unit}» no vinculable: no se une`].filter(Boolean).join(' · ')}
                            </p>
                          )}
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="ml-auto"
                          disabled={!linkable}
                          onClick={() => setDialog({ kind: 'associate', product, current: null })}
                          aria-label={`Unir «${product.product_name}» con…`}
                        >
                          Unir con…
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            {canonicals.length > 0 && (
              <p className="mt-3 border-t border-line pt-3 text-sm text-ink-muted" data-testid="canonical-note">
                {canonicals.length === 1
                  ? `«${canonicals[0]!.product_name}» no aparece aquí: ya es el nombre principal de una unión.`
                  : `${canonicals.map((entry) => `«${entry.product_name}»`).join(', ')} no aparecen aquí: ya son el nombre principal de una unión.`}
              </p>
            )}
          </section>
        </div>
      )}

      {dialog?.kind === 'associate' && (
        <AssociateDialog
          product={dialog.product}
          current={dialog.current}
          candidates={catalog.filter(
            (other) => other.product_ref !== dialog.product.product_ref && other.base_unit === dialog.product.base_unit && !aliasOf.has(other.product_ref),
          )}
          existing={catalog.map((entry) => ({ id: entry.product_ref, name: entry.product_name, isActive: entry.is_active }))}
          onProductCreated={load}
          onClose={() => setDialog(null)}
          onDone={(canonical, changed) =>
            void done(changed ? `«${dialog.product.product_name}» quedó unido a «${canonical}».` : `«${dialog.product.product_name}» ya estaba unido a «${canonical}»; no cambió nada.`)
          }
        />
      )}
      {dialog?.kind === 'close' && (
        <SeparateDialog
          association={dialog.association}
          unit={catalogEntry(dialog.association.product_ref)?.unit ?? null}
          onClose={() => setDialog(null)}
          onDone={() => void done(`«${dialog.association.product_name}» vuelve a consolidarse por separado.`)}
        />
      )}
    </div>
  );
}

/** K12: la API no ofrece una vista previa del efecto; no se calcula ni se adivina. */
function ImpactUnavailable() {
  return (
    <p className="rounded-control bg-sunken px-4 py-3 text-sm leading-relaxed text-ink" data-testid="impact-unavailable">
      <span className="font-semibold">Efecto en las cifras, antes y después: no disponible.</span> El sistema no ofrece una vista previa. Tras
      confirmar, algunas cifras del resumen pueden quedar sin publicar mientras se revisan; las versiones selladas no cambian.
    </p>
  );
}

function AssociateDialog({
  product,
  current,
  candidates,
  existing,
  onProductCreated,
  onClose,
  onDone,
}: {
  product: CatalogEntry;
  /** Unión vigente cuando se corrige (H-01): guardar otro producto la cierra y abre otra. */
  current: Association | null;
  candidates: CatalogEntry[];
  /** Nombres del catálogo, para avisar si el producto nuevo ya existe. */
  existing: { id: string; name: string; isActive: boolean }[];
  /** Recarga el catálogo; el producto creado aparece entonces en el selector. */
  onProductCreated: () => Promise<void>;
  onClose: () => void;
  onDone: (canonicalName: string, changed: boolean) => void;
}) {
  const [canonical, setCanonical] = useState(current?.canonical_product_ref ?? '');
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const lockedUnit: ProductUnit | undefined = product.base_unit === 'ML' ? 'L' : product.base_unit === 'G' ? 'kg' : undefined;
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const target = candidates.find((candidate) => candidate.product_ref === canonical);
  const ready = Boolean(target) && reason.trim().length > 0 && confirmed && !busy;
  const dimension = dimensionText(product.base_unit);
  const correcting = current !== null;

  const submit = async () => {
    if (!target || !ready) return;
    setBusy(true);
    setError(null);
    try {
      const result = await collectiveService.associate({ productId: product.product_ref, canonicalProductId: target.product_ref, reason: reason.trim(), confirmed: true });
      onDone(target.product_name, result.changed !== false);
    } catch (err) {
      setError(collectiveError(err, 'No fue posible guardar la unión.'));
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={correcting ? `Corregir la unión de «${product.product_name}»` : `Unir «${product.product_name}»`}
      onClose={onClose}
      dirty={reason.length > 0 || confirmed}
      busy={busy}
      size="md"
      footer={
        creatingProduct ? undefined : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Volver
            </Button>
            <Button onClick={() => void submit()} disabled={!ready} busy={busy}>
              {correcting ? 'Guardar corrección' : 'Unir'}
            </Button>
          </>
        )
      }
    >
      <div className="space-y-5">
        {correcting && (
          <Facts
            rows={[
              ['Hoy unido con', current.canonical_product_name],
              ['Unidad', unitInfo(product.unit).long],
            ]}
          />
        )}
        {creatingProduct ? (
          <section className="rounded-card border border-line bg-canvas p-4" aria-label="Crear producto distinto">
            <p className="mb-3 font-semibold text-ink">Crear un producto distinto</p>
            <ProductForm
              existing={existing}
              lockedUnit={lockedUnit}
              submitLabel="Crear y volver al selector"
              onCancel={() => setCreatingProduct(false)}
              onSaved={(saved) => {
                // Se recarga el catálogo y se vuelve al selector con el producto nuevo elegido;
                // la unión sigue pidiendo motivo y confirmación.
                void onProductCreated().then(() => {
                  setCanonical(saved.id);
                  setCreated(saved.name);
                  setConfirmed(false);
                  setCreatingProduct(false);
                });
              }}
            />
          </section>
        ) : (
          <>
            <div>
              <Select
                id="canonical"
                label={correcting ? 'Producto correcto' : 'Con el producto'}
                value={canonical}
                onChange={(event) => setCanonical(event.target.value)}
                help={dimension ? `Sólo aparecen productos en ${dimension}, en orden alfabético. El sistema no sugiere ninguno.` : undefined}
                disabled={busy}
              >
                <option value="">Seleccione…</option>
                {candidates.map((candidate) => (
                  <option key={candidate.product_ref} value={candidate.product_ref}>
                    {candidate.product_name} ({candidate.unit})
                  </option>
                ))}
              </Select>
              {created && (
                <p className="mt-1.5 text-sm font-semibold text-link" data-testid="created-product">
                  «{created}» quedó creado y elegido. Complete el motivo y confirme la unión.
                </p>
              )}
              {lockedUnit && (
                <button type="button" className="mt-2 min-h-11 text-sm font-semibold text-link underline underline-offset-2" onClick={() => setCreatingProduct(true)}>
                  ¿No está en la lista? Crear producto distinto…
                </button>
              )}
            </div>
            <p className="text-base leading-relaxed text-ink-muted">
              {correcting
                ? 'Corregir cierra la unión vigente y abre otra con el producto elegido; las dos quedan en el historial. Los datos de los agricultores no cambian.'
                : 'Desde ahora, sus cifras se agrupan bajo ese nombre en el resumen y en los borradores nuevos. Los datos de los agricultores no cambian.'}
            </p>
            <ImpactUnavailable />
            <Textarea id="reason" label="Motivo" help="Obligatorio. Queda en el historial." maxLength={MAX_REASON} value={reason} onChange={(event) => setReason(event.target.value)} disabled={busy} />
            <Checkbox
              label={target ? `Confirmo que «${product.product_name}» y «${target.product_name}» son el mismo producto.` : 'Confirmo que son el mismo producto.'}
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              disabled={busy}
            />
            {error && <Notice kind="error">{error}</Notice>}
          </>
        )}
      </div>
    </Dialog>
  );
}

function SeparateDialog({ association, unit, onClose, onDone }: { association: Association; unit: string | null; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (reason: string) => {
    setBusy(true);
    setError(null);
    try {
      await collectiveService.closeAssociation(association.product_ref, { reason, confirmed: true });
      onDone();
    } catch (err) {
      setError(collectiveError(err, 'No fue posible separar los nombres.'));
      setBusy(false);
    }
  };

  return (
    <ConfirmDialog
      title={`Separar «${association.product_name}»`}
      confirmLabel="Separar"
      reason={{ help: 'Obligatorio. Queda en el historial.', maxLength: MAX_REASON }}
      acknowledgement="Confirmo que no son el mismo producto."
      busy={busy}
      error={error}
      onConfirm={(reason) => void submit(reason)}
      onCancel={onClose}
    >
      <Facts
        rows={[
          ['Unido con', association.canonical_product_name],
          ...(unit ? ([['Unidad', unitInfo(unit).long]] as [ReactNode, ReactNode][]) : []),
        ]}
      />
      <p className="text-ink-muted">
        Desde ahora sus cifras se muestran por separado en el resumen y en los borradores nuevos. Los borradores anteriores no cambian.
      </p>
      <ImpactUnavailable />
    </ConfirmDialog>
  );
}
