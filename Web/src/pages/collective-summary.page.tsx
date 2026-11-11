import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { AppShell } from '../components/app-shell';
import { DisclosureNotice } from '../components/collective-ui';
import { CoverageCard } from '../components/coverage-card';
import { ExportButtons } from '../components/export-buttons';
import { NeedsBars } from '../components/needs-bars';
import { SealPanel } from '../components/seal-panel';
import { Button, buttonClass, CampaignSelector, DataState, PageHeader, Section, StatusChip, surfaceClass } from '../components/ui';
import { useCampaign } from '../hooks/use-campaign';
import { useSelectedCampaign } from '../hooks/use-selected-campaign';
import { collectiveError, fmtDateTime } from '../lib/collective-text';
import { reportDisclosureMode } from '../lib/data-mode';
import { COLLECTIVE_PATHS } from '../lib/navigation';
import { collectiveService } from '../services/collective.service';
import type { CollectiveSummary, SealRef, SummaryCell } from '../types/collective';

/**
 * F07-WEB-02 (#24): resumen de la campaña por producto canónico. Sólo presenta
 * lo que decidió el servidor (F07-POL-01): no suma, no resta y no deduce cifras
 * ocultas. F07 (2026-10-23): versión sellada y panel de sellado.
 *
 * Variante «Analítica comparativa» (elegida por el autor, 2026-11-10): una sola
 * acción primaria («Revisar borrador»); tarjetas de cobertura y versión
 * sellada; «Necesidades declaradas por producto» con barras por producto dentro
 * de su unidad (L y KG en escalas separadas, orden por nombre, nunca por
 * cantidad); «Consumo publicado» aparte; «Pendiente según los datos» como lista
 * secundaria al final, sólo con lo que un dato sustenta. «Cifra más reciente»
 * es una regla de presentación (el resumen no tiene marca global, matriz R11).
 *
 * `GET …/summary` sobre una campaña sin sellar ejecuta la decisión de
 * divulgación en el servidor: una sola llamada por campaña y visita, sin
 * sondeo; «Actualizar» y «Reintentar» son acciones explícitas.
 */
export function CollectiveSummaryPage() {
  const { campaigns, selected, select, error: campaignsError, refresh: refreshCampaigns } = useSelectedCampaign();
  const { activeCampaign, isLoading: activeLoading, error: activeError } = useCampaign();
  const [summary, setSummary] = useState<CollectiveSummary | null>(null);
  const [error, setError] = useState<{ kind: 'error' | 'forbidden'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  // Cambia en cada recarga para que el panel de sellado relea su estado.
  const [reloads, setReloads] = useState(0);
  const current = useRef<string | null>(null);
  const requested = useRef<string | null>(null);

  const load = useCallback(async (campaignId: string) => {
    setLoading(true);
    setError(null);
    setSummary(null);
    setReloads((value) => value + 1);
    try {
      const data = await collectiveService.summary(campaignId);
      if (current.current !== campaignId) return;
      reportDisclosureMode(data.disclosure.mode);
      setSummary(data);
    } catch (err) {
      if (current.current !== campaignId) return;
      setError({ kind: forbidden(err) ? 'forbidden' : 'error', text: collectiveError(err, 'No fue posible cargar el resumen colectivo.') });
    } finally {
      if (current.current === campaignId) setLoading(false);
    }
  }, []);

  useEffect(() => {
    current.current = selected;
    // Una sola lectura por campaña aunque el efecto se repita (StrictMode).
    if (!selected || requested.current === selected) return;
    requested.current = selected;
    void Promise.resolve().then(() => load(selected));
  }, [selected, load]);

  const noActive = !activeLoading && !activeError && activeCampaign === null;

  return (
    <AppShell title="Resumen colectivo" section="Colectivo">
      <div className="space-y-5">
        <PageHeader
          testId="toolbar"
          title="Resumen"
          subtitle="Cuánto declaró necesitar cada producto, comparado dentro de su unidad, con la cobertura y la versión de la campaña."
          campaign={<CampaignSelector campaigns={campaigns} selected={selected} onSelect={select} />}
          actions={
            selected && (
              <>
                <Button variant="ghost" onClick={() => void load(selected)} disabled={loading}>
                  Actualizar
                </Button>
                <ExportButtons kind="summary" reference={selected} disabled={!summary || loading} />
                <Link to={`${COLLECTIVE_PATHS.proposals}?campaign=${encodeURIComponent(selected)}`} className={buttonClass}>
                  Revisar borrador
                </Link>
              </>
            )
          }
        />
        {campaignsError && (
          <DataState state="error" description={campaignsError} onRetry={() => void refreshCampaigns()} testId="campaigns-list-error" />
        )}
        {error && (
          <div className={surfaceClass}>
            <DataState
              state={error.kind}
              description={error.text}
              onRetry={selected ? () => void load(selected) : undefined}
              testId="summary-error"
            />
          </div>
        )}
        {loading && <DataState state="loading" compact />}
        {summary && !loading && <LatestFigure cells={summary.cells} />}
        {summary && !loading && <SummaryBody summary={summary} />}
        {(summary || noActive) && !loading && <PendingActions summary={summary} noActive={noActive} campaignId={selected} />}
        {selected && summary && !loading && !summary.seal && (
          <div id="sellado">
            <SealPanel key={`${selected}:${reloads}`} campaignId={selected} onSealed={() => void load(selected)} />
          </div>
        )}
        {!selected && !campaignsError && (
          <div className={surfaceClass}>
            <DataState state="empty" title="No hay campañas" description="Cree o abra una campaña compartida en Campañas." />
          </div>
        )}
      </div>
    </AppShell>
  );
}

/**
 * Regla de presentación declarada (R11 no existe): el máximo de `data_as_of`
 * entre las cifras publicadas, con su rótulo literal. Sin cifras publicadas no
 * se muestra nada: no hay una «última actualización» del resumen.
 */
function LatestFigure({ cells }: { cells: SummaryCell[] }) {
  const latest = latestDataAsOf(cells);
  if (!latest) return null;
  return (
    <p className="text-sm text-slate-600" data-testid="latest-figure">
      Cifra más reciente: datos hasta <span className="font-semibold text-slate-800 tabular-nums">{fmtDateTime(latest)}</span>
      <span className="text-slate-500"> · cada cifra indica su propia fecha.</span>
    </p>
  );
}

function latestDataAsOf(cells: SummaryCell[]): string | null {
  let latest: { at: number; value: string } | null = null;
  for (const cell of cells) {
    if (cell.status !== 'DISCLOSED' || !cell.data_as_of) continue;
    const at = Date.parse(cell.data_as_of);
    if (Number.isFinite(at) && (!latest || at > latest.at)) latest = { at, value: cell.data_as_of };
  }
  return latest?.value ?? null;
}

interface PendingAction {
  key: string;
  title: string;
  description: string;
  /** De qué dato sale: se muestra al lado para que nada parezca inventado. */
  source: string;
  link?: ReactNode;
}

/**
 * «Pendiente según los datos»: lista secundaria al final. Sólo acciones que un
 * dato del servidor sustenta; ninguna se deduce de cantidades.
 */
function PendingActions({ summary, noActive, campaignId }: { summary: CollectiveSummary | null; noActive: boolean; campaignId: string | null }) {
  const actions: PendingAction[] = [];
  const linkClass = 'font-semibold text-brand-800 underline underline-offset-2 hover:text-ink';
  if (noActive) {
    actions.push({
      key: 'no-active',
      title: 'Sin campaña activa.',
      description: 'Los agricultores no pueden registrar en una campaña hasta que se abra una.',
      source: 'campaña activa del servidor',
      link: <Link to="/campaigns" className={linkClass}>Ir a Campañas</Link>,
    });
  }
  if (summary && campaignId) {
    if (summary.campaign.status === 'CERRADA' && summary.seal === null) {
      actions.push({
        key: 'closed-unsealed',
        title: 'Campaña cerrada sin sellar.',
        description: 'Cerrar no es sellar: revise la versión colectiva y, si corresponde, séllela.',
        source: 'estado de la campaña y sellado',
        link: <a href="#sellado" className={linkClass}>Ir al sellado</a>,
      });
    }
    const pending = summary.cells.filter((cell) => cell.pending_changes).length;
    if (pending > 0) {
      actions.push({
        key: 'pending-changes',
        title: 'Hay cambios recibidos sin publicar.',
        description: `${pending === 1 ? 'Una fila tiene' : `${pending} filas tienen`} cambios recibidos que aún no alcanzan el umbral para publicarse; mientras tanto se muestra lo publicado antes.`,
        source: 'cambios pendientes del servidor',
      });
    }
    actions.push({
      key: 'review',
      title: 'Revisar borrador.',
      description: 'Revise el último borrador de propuesta de esta campaña o genere uno nuevo con un botón explícito.',
      source: 'necesidades declaradas',
      link: (
        <Link to={`${COLLECTIVE_PATHS.proposals}?campaign=${encodeURIComponent(campaignId)}`} className={linkClass}>
          Abrir Necesidades y propuestas
        </Link>
      ),
    });
  }
  return (
    <section aria-labelledby="pendiente-segun-datos" className="px-1" data-testid="pending-actions">
      <h2 id="pendiente-segun-datos" className="text-sm font-semibold text-slate-700">
        Pendiente según los datos
      </h2>
      <ul className="mt-1 list-disc space-y-1.5 pl-5 text-sm text-slate-700">
        {actions.map((action) => (
          <li key={action.key} data-testid={`action-${action.key}`}>
            <span className="font-semibold text-ink">{action.title}</span> {action.description}{' '}
            <span className="text-xs text-slate-600">({action.source})</span>
            {action.link && <> {action.link}</>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function SummaryBody({ summary }: { summary: CollectiveSummary }) {
  const { disclosure } = summary;
  const needs = summary.cells.filter((cell) => cell.projection_type === 'DECLARED_NEED');
  const consumption = summary.cells.filter((cell) => cell.projection_type === 'CONSUMPTION_TOTAL');
  const synthetic = disclosure.mode === 'PROVISIONAL_SYNTHETIC';
  return (
    <div className="space-y-5">
      <DisclosureNotice mode={disclosure.mode} threshold={disclosure.threshold} />
      <div className="grid gap-4 md:grid-cols-2" data-testid="summary-cards">
        {summary.coverage && (
          <CoverageCard
            coverage={summary.coverage}
            sealedAt={summary.seal?.sealed_at}
            link={`${COLLECTIVE_PATHS.coverage}?campaign=${encodeURIComponent(summary.campaign.campaign_ref)}`}
          />
        )}
        <VersionCard seal={summary.seal} status={summary.campaign.status} />
      </div>
      {synthetic && (
        <>
          <Section
            title="Necesidades declaradas por producto"
            note={
              <>
                <NeedsCounts cells={needs} /> Lo que cada agricultor declaró que necesita; no es pronóstico, consumo ni cantidad comprada.
                {needs.length > 0 && ' Cada unidad tiene su propia escala (litros y kilogramos no se comparan ni se suman); ordenado por nombre del producto.'}
              </>
            }
          >
            {needs.length === 0 ? (
              <DataState state="empty" title="Sin necesidades publicadas" description="Ningún agricultor publicó una necesidad declarada en esta campaña. Eso no significa cero." />
            ) : (
              <NeedsBars cells={needs} threshold={disclosure.threshold} />
            )}
          </Section>
          <Section
            title="Consumo publicado"
            note="Consumo que los agricultores registraron y publicaron desde la app. Es un dato distinto de la necesidad declarada: no se resta ni se compara con ella."
          >
            {consumption.length === 0 ? (
              <p className="px-5 py-3 text-sm text-slate-600">Sin consumo publicado en esta campaña. Eso no significa cero.</p>
            ) : (
              <NeedsBars cells={consumption} threshold={disclosure.threshold} bars={false} />
            )}
          </Section>
        </>
      )}
    </div>
  );
}

/** Conteo de filas por estado (nunca una cantidad): «5 productos con cifra publicada · 1 oculto por privacidad». */
function NeedsCounts({ cells }: { cells: SummaryCell[] }) {
  if (cells.length === 0) {
    return (
      <span className="font-semibold text-slate-700" data-testid="needs-counts">
        Sin necesidades publicadas.
      </span>
    );
  }
  const published = cells.filter((cell) => cell.status === 'DISCLOSED').length;
  const privacy = cells.filter((cell) => cell.status === 'SUPPRESSED_UNDER_THRESHOLD').length;
  const other = cells.length - published - privacy;
  const parts = [`${published} ${published === 1 ? 'producto con cifra publicada' : 'productos con cifra publicada'}`];
  if (privacy > 0) parts.push(`${privacy} ${privacy === 1 ? 'oculto' : 'ocultos'} por privacidad`);
  if (other > 0) parts.push(`${other} sin cifra publicada`);
  return (
    <span className="font-semibold text-slate-700" data-testid="needs-counts">
      {parts.join(' · ')}.
    </span>
  );
}

/**
 * Versión sellada (F07) o «Sin sellar». «Datos aceptados hasta» es el instante
 * de la decisión sellada; cada cifra vale por su propia fecha.
 */
function VersionCard({ seal, status }: { seal: SealRef | null; status: string }) {
  return (
    <article className={`min-w-0 px-5 py-4 ${surfaceClass}`} data-testid={seal ? 'seal-banner' : 'version-tile'}>
      <h2 className="text-sm font-semibold text-slate-700">Versión sellada</h2>
      {seal ? (
        <>
          <p className="mt-1 text-4xl font-bold leading-tight text-ink tabular-nums">Versión {seal.version} sellada</p>
          <p className="mt-1 text-sm text-slate-700 [overflow-wrap:anywhere]">
            El {fmtDateTime(seal.sealed_at)} por {seal.sealed_by.name} ({seal.sealed_by.role === 'ADMINISTRADOR' ? 'Administrador' : 'Directiva'}) · datos
            aceptados hasta {fmtDateTime(seal.accepted_until)} · ref. <code title={seal.seal_ref}>{seal.seal_ref.slice(0, 8)}</code>
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            Cada cifra indica su propia fecha; las que tienen cambios pendientes muestran una cifra anterior. El servidor no puede asegurar que
            todos los teléfonos publicaron todo.
          </p>
        </>
      ) : (
        <>
          <p className="mt-1 text-4xl font-bold leading-tight text-ink">Sin sellar</p>
          <p className="mt-1 text-sm text-slate-700">
            <StatusChip status={status} /> <span className="ml-1">Las cifras pueden cambiar. Sólo se sella una campaña cerrada.</span>
          </p>
        </>
      )}
    </article>
  );
}

function forbidden(err: unknown): boolean {
  return axios.isAxiosError(err) && err.response?.status === 403;
}
