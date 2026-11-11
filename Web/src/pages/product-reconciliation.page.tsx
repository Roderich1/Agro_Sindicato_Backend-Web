import axios from 'axios';
import { useCallback, useEffect, useState } from 'react';
import { AppShell, Modal } from '../components/app-shell';
import { ProductForm } from '../components/product-form';
import {
  buttonClass,
  Collapsible,
  DataState,
  DataTable,
  dangerButtonClass,
  inputClass,
  labelClass,
  Notice,
  PageHeader,
  Section,
  secondaryButtonClass,
} from '../components/ui';
import { normalizeName, type ProductUnit } from '../lib/product-text';
import { collectiveError, fmtDateTime } from '../lib/collective-text';
import { collectiveService } from '../services/collective.service';
import type { Association, AssociationList, CatalogEntry } from '../types/collective';

type Dialog =
  | { kind: 'associate'; product: CatalogEntry }
  | { kind: 'close'; association: Association };

/**
 * Sombra en el borde por el que una tabla sigue (sin JavaScript): los degradados blancos se desplazan con el
 * contenido (`local`) y tapan la sombra fija (`scroll`) sólo cuando se llega a ese borde. Sin desplazamiento no se ve.
 */
const SCROLL_HINT = '[&_.ui-table-scroll]:[background:linear-gradient(to_right,#fff_30%,rgb(255_255_255/0))_left_center/40px_100%_no-repeat_local,linear-gradient(to_left,#fff_30%,rgb(255_255_255/0))_right_center/40px_100%_no-repeat_local,radial-gradient(farthest-side_at_0_50%,rgb(15_23_42/0.2),transparent)_left_center/12px_100%_no-repeat_scroll,radial-gradient(farthest-side_at_100%_50%,rgb(15_23_42/0.2),transparent)_right_center/12px_100%_no-repeat_scroll]';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const matches = (query: string, ...names: string[]) => {
  const wanted = normalizeName(query);
  return !wanted || names.some((name) => normalizeName(name).includes(wanted));
};

/**
 * F07-REC-01 (#108, CU-18): la Directiva asocia una denominación del catálogo
 * con su producto canónico («Equivalencias de productos»). Nada se asocia sin
 * confirmación explícita; los nombres originales no cambian y cada cambio
 * queda en el historial. Sin sugerencias automáticas.
 *
 * Panel de la defensa (2026-11-05): primero los nombres pendientes de asociar,
 * después las equivalencias vigentes y el historial plegado.
 *
 * Rediseño (sesión C, 2026-11-10): el cuerpo es `ProductReconciliationView`,
 * que también usa el contenedor «Catálogo y equivalencias»
 * (`?vista=equivalencias`). Búsqueda por nombre sin mayúsculas ni tildes. Los
 * candidatos siguen filtrándose sólo por dimensión (sin porcentajes de
 * parecido ni sugerencias). El efecto «antes y después» de una asociación no
 * existe en la API: se dice «No disponible».
 */
export function ProductReconciliationPage() {
  return (
    <AppShell title="Equivalencias de productos" section="Gestión">
      <ProductReconciliationView />
    </AppShell>
  );
}

export function ProductReconciliationView({ headingLevel = 1 }: { headingLevel?: 1 | 2 }) {
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [associations, setAssociations] = useState<AssociationList>({ current: [], history: [] });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<{ message: string; forbidden: boolean } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
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
  const aliasCount = new Map<string, number>();
  for (const row of associations.current) {
    aliasCount.set(row.canonical_product_ref, (aliasCount.get(row.canonical_product_ref) ?? 0) + 1);
  }
  const catalogEntry = (ref: string) => catalog.find((product) => product.product_ref === ref);
  const unassociated = catalog.filter((product) => !aliasOf.has(product.product_ref));
  const pending = unassociated.filter((product) => product.base_unit !== null && (aliasCount.get(product.product_ref) ?? 0) === 0);
  const fullHistory = [...associations.current, ...associations.history].sort((a, b) => b.valid_from.localeCompare(a.valid_from));
  const shownUnassociated = unassociated.filter((product) => matches(query, product.product_name));
  const shownCurrent = associations.current.filter((row) => matches(query, row.product_name, row.canonical_product_name));
  const shownHistory = fullHistory.filter((row) => matches(query, row.product_name, row.canonical_product_name));
  const filtered = query.trim().length > 0;
  const noMatch = (what: string) => (
    <DataState compact state="no-match" description={`Ninguna ${what} coincide con «${query.trim()}».`} onClearFilters={() => setQuery('')} />
  );

  const done = async (text: string) => {
    setDialog(null);
    setMessage(text);
    await load();
  };

  return (
    <div className="space-y-4">
      <PageHeader
        headingLevel={headingLevel}
        title="Equivalencias de productos"
        subtitle="Asociar «Bellator» con «Belator» agrupa sus cifras bajo el producto canónico en el resumen y en las propuestas que se generen después. Los nombres del catálogo y los datos de los agricultores no cambian; sólo se agrupan unidades de la misma dimensión (L con L, KG con KG)."
      />
      {message && <Notice kind="ok">{message}</Notice>}
      {error && (
        <Section>
          <DataState compact state={error.forbidden ? 'forbidden' : 'error'} description={error.message} onRetry={error.forbidden ? undefined : () => void load()} />
        </Section>
      )}
      {!loaded && !error && (
        <Section>
          <DataState state="loading" compact />
        </Section>
      )}

      {loaded && (
        <>
          <div className="w-full min-w-0 sm:w-96">
            <label className={labelClass} htmlFor="association-search">
              Buscar denominación
            </label>
            <input
              id="association-search"
              type="search"
              enterKeyHint="search"
              inputMode="search"
              autoComplete="off"
              className={inputClass}
              value={query}
              placeholder="Nombre de la denominación o del producto canónico"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <Section
            label="Denominaciones sin asociar"
            title="Pendientes de asociar"
            note={`${plural(pending.length, 'denominación pendiente', 'denominaciones pendientes')}. Cada una se consolida por separado hasta que la Directiva confirme una asociación.`}
          >
            {unassociated.length === 0 ? (
              <DataState state="empty" compact title="Todas las denominaciones están asociadas" description="" />
            ) : shownUnassociated.length === 0 ? (
              noMatch('denominación sin asociar')
            ) : (
              <div className={SCROLL_HINT}><DataTable caption="Denominaciones sin asociar" minWidth={520}>
                <tbody>
                  {shownUnassociated.map((product) => {
                    const aliases = aliasCount.get(product.product_ref) ?? 0;
                    return (
                      <tr key={product.product_ref} data-testid={`product-${product.product_name}`}>
                        <td className="min-w-48 text-base font-semibold text-slate-900 [overflow-wrap:anywhere]">
                          {product.product_name}
                          <span className="ml-2 text-xs font-normal text-slate-500">{product.unit}</span>
                          {!product.is_active && <span className="ml-2 text-xs font-normal text-slate-500">(inactivo)</span>}
                        </td>
                        <td className="text-xs text-slate-600">
                          {product.base_unit === null
                            ? 'Unidad no vinculable'
                            : aliases > 0
                              ? `Canónico de ${plural(aliases, 'denominación', 'denominaciones')}`
                              : 'Pendiente'}
                        </td>
                        <td className="ui-num">
                          <button
                            type="button"
                            className={secondaryButtonClass}
                            disabled={product.base_unit === null || aliases > 0}
                            title={aliases > 0 ? 'Es canónico de otras denominaciones: no puede ser alias.' : product.base_unit === null ? 'Su unidad no es L ni kg: no se vincula a cifras colectivas.' : undefined}
                            onClick={() => setDialog({ kind: 'associate', product })}
                          >
                            Asociar…
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </DataTable></div>
            )}
          </Section>

          <Section label="Asociaciones vigentes" title="Equivalencias vigentes" note="Denominación → producto canónico bajo el que se agrupan sus cifras.">
            {associations.current.length === 0 ? (
              <DataState state="empty" compact title="No hay denominaciones asociadas" description="" />
            ) : shownCurrent.length === 0 ? (
              noMatch('equivalencia vigente')
            ) : (
              <div className={SCROLL_HINT}><DataTable caption="Equivalencias vigentes" minWidth={640}>
                <tbody>
                  {shownCurrent.map((row) => (
                    <tr key={row.association_ref} data-testid={`current-${row.product_name}`}>
                      <td className="min-w-40 font-semibold text-slate-900 [overflow-wrap:anywhere]">{row.product_name}</td>
                      <td className="min-w-40 text-slate-700 [overflow-wrap:anywhere]">→ {row.canonical_product_name}</td>
                      <td className="min-w-40 text-xs text-slate-600">
                        desde {fmtDateTime(row.valid_from)} · {row.actor_name}
                      </td>
                      <td className="ui-num space-x-2">
                        {catalogEntry(row.product_ref) && (
                          <button
                            type="button"
                            className={secondaryButtonClass}
                            onClick={() => setDialog({ kind: 'associate', product: catalogEntry(row.product_ref)! })}
                          >
                            Corregir…
                          </button>
                        )}
                        <button type="button" className={secondaryButtonClass} onClick={() => setDialog({ kind: 'close', association: row })}>
                          Deshacer
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable></div>
            )}
          </Section>

          <Collapsible title={`Historial (${filtered ? `${shownHistory.length} de ${fullHistory.length}` : fullHistory.length})`} label="Historial">
            <p className="px-5 pt-3 text-xs text-slate-600">Las correcciones cierran la asociación anterior y abren otra; nada se borra.</p>
            {fullHistory.length === 0 ? (
              <DataState state="empty" compact title="Sin cambios registrados" description="" />
            ) : shownHistory.length === 0 ? (
              noMatch('asociación del historial')
            ) : (
              <div className={SCROLL_HINT}><DataTable caption="Historial de equivalencias" minWidth={760}>
                <thead>
                  <tr>
                    <th>Denominación → canónico</th>
                    <th>Vigencia</th>
                    <th>Asociado por / motivo</th>
                    <th>Cerrado por / motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {shownHistory.map((row) => (
                    <tr key={row.association_ref} data-testid={`history-${row.association_ref}`}>
                      <td className="min-w-48 [overflow-wrap:anywhere]">
                        {row.product_name} → {row.canonical_product_name}
                      </td>
                      <td className="min-w-36 text-xs">
                        {fmtDateTime(row.valid_from)} – {row.valid_to ? fmtDateTime(row.valid_to) : 'vigente'}
                      </td>
                      <td className="min-w-48 text-xs [overflow-wrap:anywhere]">
                        {row.actor_name}: {row.reason}
                      </td>
                      <td className="min-w-56 text-xs [overflow-wrap:anywhere]">{row.closed_by_name ? `${row.closed_by_name}: ${row.close_reason ?? ''}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable></div>
            )}
          </Collapsible>
        </>
      )}

      {dialog?.kind === 'associate' && (
        <AssociateDialog
          product={dialog.product}
          candidates={catalog.filter(
            (other) =>
              other.product_ref !== dialog.product.product_ref &&
              other.base_unit === dialog.product.base_unit &&
              !aliasOf.has(other.product_ref),
          )}
          existing={catalog.map((entry) => ({ id: entry.product_ref, name: entry.product_name, isActive: entry.is_active }))}
          onProductCreated={load}
          onClose={() => setDialog(null)}
          onDone={(canonical) => void done(`«${dialog.product.product_name}» quedó asociado a «${canonical}».`)}
        />
      )}
      {dialog?.kind === 'close' && (
        <CloseDialog
          association={dialog.association}
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
    <p className="rounded-control border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700" data-testid="impact-unavailable">
      <span className="font-semibold">Efecto en las cifras, antes y después: no disponible.</span> El sistema no ofrece una
      vista previa. Tras confirmar, algunas cifras del resumen pueden quedar sin publicar mientras se revisan; las
      versiones selladas no cambian.
    </p>
  );
}

function AssociateDialog({
  product,
  candidates,
  existing,
  onProductCreated,
  onClose,
  onDone,
}: {
  product: CatalogEntry;
  candidates: CatalogEntry[];
  /** Nombres del catálogo, para avisar si el producto nuevo ya existe. */
  existing: { id: string; name: string; isActive: boolean }[];
  /** Recarga el catálogo; el producto creado aparece entonces en el selector. */
  onProductCreated: () => Promise<void>;
  onClose: () => void;
  onDone: (canonicalName: string) => void;
}) {
  const [canonical, setCanonical] = useState('');
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const lockedUnit: ProductUnit | undefined = product.base_unit === 'ML' ? 'L' : product.base_unit === 'G' ? 'kg' : undefined;
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const target = candidates.find((candidate) => candidate.product_ref === canonical);
  const ready = Boolean(target) && reason.trim().length > 0 && confirmed && !busy;

  const submit = async () => {
    if (!target || !confirmed) return;
    setBusy(true);
    setError(null);
    try {
      await collectiveService.associate({
        productId: product.product_ref,
        canonicalProductId: target.product_ref,
        reason: reason.trim(),
        confirmed: true,
      });
      onDone(target.product_name);
    } catch (err) {
      setError(collectiveError(err, 'No fue posible guardar la asociación.'));
      setBusy(false);
    }
  };

  return (
    <Modal title={`Asociar «${product.product_name}»`} onClose={onClose} size="lg">
      <div className="space-y-4">
        {creatingProduct ? (
          <section className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4" aria-label="Crear producto distinto">
            <p className="mb-3 text-sm font-semibold text-slate-800">Crear un producto distinto</p>
            <ProductForm
              existing={existing}
              lockedUnit={lockedUnit}
              submitLabel="Crear y volver al selector"
              onCancel={() => setCreatingProduct(false)}
              onSaved={(saved) => {
                // Se recarga el catálogo y se vuelve al selector con el producto nuevo elegido;
                // la asociación sigue pidiendo motivo y confirmación.
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
          <div>
            <label className={labelClass} htmlFor="canonical">Producto canónico</label>
            <select id="canonical" className={inputClass} value={canonical} onChange={(event) => setCanonical(event.target.value)}>
              <option value="">Seleccione…</option>
              {candidates.map((candidate) => (
                <option key={candidate.product_ref} value={candidate.product_ref}>
                  {candidate.product_name} ({candidate.unit})
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-600">
              Sólo productos de la misma dimensión ({lockedUnit === 'kg' ? 'masa' : 'volumen'}), en orden alfabético. El sistema no sugiere ninguno.
            </p>
            {created && (
              <p className="mt-1.5 text-xs text-emerald-700" data-testid="created-product">
                «{created}» quedó creado y elegido. Complete el motivo y confirme la asociación.
              </p>
            )}
            {lockedUnit && (
              <button type="button" className="mt-2 text-xs font-semibold text-emerald-700 underline-offset-2 hover:underline" onClick={() => setCreatingProduct(true)}>
                ¿No está en la lista? Crear producto distinto…
              </button>
            )}
          </div>
        )}
        <div>
          <label className={labelClass} htmlFor="reason">Motivo</label>
          <textarea id="reason" className={inputClass} maxLength={280} value={reason} onChange={(event) => setReason(event.target.value)} />
        </div>
        <ImpactUnavailable />
        {target && (
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" className="mt-0.5 shrink-0" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
            <span className="min-w-0 [overflow-wrap:anywhere]">
              Confirmo que «{product.product_name}» y «{target.product_name}» son el mismo producto. Sus cifras se
              agruparán bajo «{target.product_name}»; los nombres originales no cambian.
            </span>
          </label>
        )}
        {error && <Notice kind="error">{error}</Notice>}
        <div className="flex justify-end gap-2">
          <button type="button" className={secondaryButtonClass} onClick={onClose}>Cancelar</button>
          <button type="button" className={buttonClass} disabled={!ready} onClick={() => void submit()}>
            Confirmar asociación
          </button>
        </div>
      </div>
    </Modal>
  );
}

function CloseDialog({
  association,
  onClose,
  onDone,
}: {
  association: Association;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await collectiveService.closeAssociation(association.product_ref, { reason: reason.trim(), confirmed: true });
      onDone();
    } catch (err) {
      setError(collectiveError(err, 'No fue posible deshacer la asociación.'));
      setBusy(false);
    }
  };

  return (
    <Modal title={`Deshacer «${association.product_name} → ${association.canonical_product_name}»`} onClose={onClose} size="lg">
      <div className="space-y-4">
        <div>
          <label className={labelClass} htmlFor="close-reason">Motivo</label>
          <textarea id="close-reason" className={inputClass} maxLength={280} value={reason} onChange={(event) => setReason(event.target.value)} />
        </div>
        <ImpactUnavailable />
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" className="mt-0.5 shrink-0" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
          <span className="min-w-0 [overflow-wrap:anywhere]">Confirmo que «{association.product_name}» vuelve a consolidarse por separado. La asociación queda en el historial.</span>
        </label>
        {error && <Notice kind="error">{error}</Notice>}
        <div className="flex justify-end gap-2">
          <button type="button" className={secondaryButtonClass} onClick={onClose}>Cancelar</button>
          <button
            type="button"
            className={dangerButtonClass}
            disabled={!confirmed || reason.trim().length === 0 || busy}
            onClick={() => void submit()}
          >
            Deshacer asociación
          </button>
        </div>
      </div>
    </Modal>
  );
}
