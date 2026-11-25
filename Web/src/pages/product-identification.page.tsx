import axios from 'axios';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { DataState, Icon, ICON, Notice, PageHeader, SegmentedControl, surfaceClass } from '../components/ui';
import { notifyIdentificationChanged } from '../contexts/identification-pending';
import { useAuth } from '../hooks/use-auth';
import { collectiveError } from '../lib/collective-text';
import { identificationService } from '../services/identification.service';
import type { IdentificationRequest } from '../types/identification';
import type { ListTab } from './product-identification/identification.constants';
import { IdentifiedItem, PendingItem } from './product-identification/identification-list';
import { RequestPanel } from './product-identification/identification-request-panel';
import { CorrectionPanel } from './product-identification/identification-secondary-panels';

/**
 * Catálogo → Por identificar (E1 §6; láminas 23, 24, 47 y el diálogo 33.5).
 * Lista los productos que los agricultores reportaron desde el teléfono y que
 * todavía no corresponden a un producto del catálogo. La Directiva o el
 * Administrador elige una solicitud y decide: identificarla con un producto
 * existente (`link`), crear el producto colectivo (`create-product`) o dejarla
 * pendiente con una nota (`defer`), siempre con motivo y confirmación. En «Ya
 * identificados», «Corregir identificación» usa `link` sobre la solicitud ya
 * identificada (evento `RELINKED`, H-01); no hay «volver a pendiente» (E1-P3).
 *
 * Reglas que no cambian:
 * - Las sugerencias del servidor son sólo sugerencias (RN-29): ninguna viene
 *   elegida y nada se vincula por parecido.
 * - No se muestra quién reportó (E1-D5, H-20): la API no lo envía.
 * - La foto se pide como blob con la sesión, sólo al pulsar «Ver la foto», y
 *   su URL local se revoca al cerrar (E1-D8).
 * - El agricultor confirma el vínculo en su aplicación (E1-D4): la
 *   identificación no cambia su inventario ni sus compras.
 * - «Ya identificados» se consulta al abrirla por primera vez.
 * - Tras cada decisión se avisa al armazón (`notifyIdentificationChanged`, U.5)
 *   para que la insignia «Por identificar» vuelva a contar.
 */
export function ProductIdentificationView({ headingLevel = 1, nav }: { headingLevel?: 1 | 2; nav?: ReactNode }) {
  const { user } = useAuth();
  const [requests, setRequests] = useState<IdentificationRequest[] | null>(null);
  const [error, setError] = useState<{ message: string; forbidden: boolean } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tab, setTab] = useState<ListTab>('pendientes');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState<IdentificationRequest | null>(null);
  const [linked, setLinked] = useState<IdentificationRequest[] | null>(null);
  const [linkedError, setLinkedError] = useState<string | null>(null);
  const linkedRequested = useRef(false);
  const panelRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    try {
      const list = await identificationService.list('PENDING');
      setRequests(list);
      setError(null);
      return list;
    } catch (err) {
      setError({
        message: collectiveError(err, 'No fue posible cargar los productos por identificar.'),
        forbidden: axios.isAxiosError(err) && err.response?.status === 403,
      });
      return null;
    }
  }, []);

  const loadLinked = useCallback(async () => {
    linkedRequested.current = true;
    try {
      setLinked(await identificationService.list('LINKED'));
      setLinkedError(null);
    } catch (err) {
      setLinkedError(collectiveError(err, 'No fue posible cargar los productos identificados.'));
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const openTab = (next: ListTab) => {
    setTab(next);
    setMessage(null);
    if (next === 'identificados' && !linkedRequested.current) void loadLinked();
  };

  const retry = () => {
    setError(null);
    setRequests(null);
    void load();
  };

  /** Elegir una solicitud lleva el foco a su panel (en teléfono, el panel está debajo de la lista). */
  const focusPanel = () => {
    window.requestAnimationFrame(() => {
      const node = panelRef.current;
      if (!node) return;
      // En escritorio el panel ya está a la vista, al lado de la lista: sólo se mueve el foco.
      const wide = window.matchMedia?.('(min-width: 1024px)').matches ?? false;
      if (!wide) node.scrollIntoView?.({ block: 'start' });
      node.focus({ preventScroll: true });
    });
  };

  const select = (id: string) => {
    setSelectedId(id);
    setMessage(null);
    focusPanel();
  };

  const startCorrection = (request: IdentificationRequest) => {
    setCorrecting(request);
    setMessage(null);
    focusPanel();
  };

  const done = async (text: string) => {
    setMessage(text);
    setCorrecting(null);
    notifyIdentificationChanged();
    const list = await load();
    if (list && selectedId && !list.some((request) => request.id === selectedId)) setSelectedId(null);
    if (linkedRequested.current) await loadLinked();
  };

  const pending = requests ?? [];
  const selected = pending.find((request) => request.id === selectedId) ?? pending[0] ?? null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        showSynthetic={false}
        attachToHeader
        eyebrowPhoneOnly
        headingLevel={headingLevel}
        title="Por identificar"
        eyebrow={user?.tenant?.name ? `Catálogo · ${user.tenant.name}` : 'Catálogo'}
        subtitle="Productos que los agricultores reportaron desde el teléfono y no están en el catálogo. Usted propone la identificación y el agricultor confirma el vínculo en su aplicación: hasta entonces, su inventario y sus compras no cambian. Nada se identifica solo por parecido."
      />
      {nav}
      {message && <Notice kind="ok">{message}</Notice>}
      {error && (
        <div className={surfaceClass}>
          <DataState
            compact
            state={error.forbidden ? 'forbidden' : 'error'}
            description={error.message}
            onRetry={error.forbidden ? undefined : retry}
            testId="identification-error"
          />
        </div>
      )}
      {!requests && !error && (
        <div className={surfaceClass}>
          <DataState state="loading" compact testId="identification-loading" />
        </div>
      )}

      {requests && !error && (
        <>
          <SegmentedControl
            label="Lista"
            hideLabel
            testId="identification-tabs"
            value={tab}
            onChange={openTab}
            options={[
              { value: 'pendientes', label: `Pendientes (${requests.length})` },
              { value: 'identificados', label: linked ? `Ya identificados (${linked.length})` : 'Ya identificados' },
            ]}
          />

          {tab === 'pendientes' ? (
            requests.length === 0 ? (
              <div className={surfaceClass}>
                <DataState state="empty" compact title="Nada pendiente" description="No hay productos por identificar." testId="identification-empty" />
              </div>
            ) : (
              <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)]">
                <div className={`${surfaceClass} min-w-0 p-2`}>
                  <ul className="space-y-1" aria-label="Solicitudes pendientes">
                    {requests.map((request) => (
                      <PendingItem key={request.id} request={request} selected={selected?.id === request.id} onSelect={() => select(request.id)} />
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => openTab('identificados')}
                    className="mt-1 flex min-h-12 w-full items-center justify-between gap-3 border-t border-line px-4 py-3 text-left font-semibold text-ink hover:bg-sunken focus-visible:outline-2"
                  >
                    Ya identificados
                    <Icon d={ICON.chevronRight} className="h-5 w-5" />
                  </button>
                </div>
                {selected && (
                  <section
                    ref={panelRef}
                    tabIndex={-1}
                    aria-label={`Identificar «${selected.local_name}»`}
                    className={`${surfaceClass} min-w-0 scroll-mt-4 px-5 py-6 focus:outline-none focus-visible:outline-2 sm:px-8`}
                    data-testid="identification-panel"
                  >
                    <RequestPanel key={selected.id} request={selected} onDone={(text) => void done(text)} />
                  </section>
                )}
              </div>
            )
          ) : (
            <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,8fr)_minmax(0,5fr)]">
              <div className={`${surfaceClass} min-w-0 overflow-hidden`} data-testid="identified">
                {linkedError ? (
                  <DataState compact state="error" description={linkedError} onRetry={() => void loadLinked()} />
                ) : !linked ? (
                  <DataState compact state="loading" />
                ) : linked.length === 0 ? (
                  <DataState compact state="empty" title="Ninguno identificado" description="Todavía no se identificó ningún producto reportado." />
                ) : (
                  <ul className="divide-y divide-line" aria-label="Solicitudes identificadas">
                    {linked.map((request) => (
                      <IdentifiedItem key={request.id} request={request} active={correcting?.id === request.id} onCorrect={() => startCorrection(request)} />
                    ))}
                  </ul>
                )}
              </div>
              {correcting && (
                <section
                  ref={panelRef}
                  tabIndex={-1}
                  aria-label="Corregir la identificación"
                  className={`${surfaceClass} min-w-0 scroll-mt-4 px-5 py-6 focus:outline-none focus-visible:outline-2 sm:px-7`}
                  data-testid="correction-panel"
                >
                  <CorrectionPanel key={correcting.id} request={correcting} onCancel={() => setCorrecting(null)} onDone={(text) => void done(text)} />
                </section>
              )}
            </div>
          )}
          <p className="text-sm text-ink-muted">No se muestra qué agricultor envió cada nombre. El motivo y el historial de cada decisión se conservan.</p>
        </>
      )}
    </div>
  );
}
