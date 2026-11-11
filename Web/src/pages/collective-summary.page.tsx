import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { AppShell } from '../components/app-shell';
import { DisclosureNotice, PendingChangesNote } from '../components/collective-ui';
import { CoverageCard } from '../components/coverage-card';
import { ExportButtons } from '../components/export-buttons';
import { SealPanel } from '../components/seal-panel';
import { Button, buttonClass, CampaignSelector, DataState, KpiTile, Notice, PageHeader, Section, StatusChip, surfaceClass } from '../components/ui';
import { useCampaign } from '../hooks/use-campaign';
import { useSelectedCampaign } from '../hooks/use-selected-campaign';
import { collectiveError, fmtDateTime, statusReason } from '../lib/collective-text';
import { reportDisclosureMode } from '../lib/data-mode';
import { COLLECTIVE_PATHS } from '../lib/navigation';
import { formatQuantity, isBaseQuantity } from '../lib/quantity';
import { collectiveService } from '../services/collective.service';
import type { CollectiveSummary, SealRef, SummaryCell } from '../types/collective';

/**
 * F07-WEB-02 (#24): resumen de la campaña por producto canónico. Sólo presenta
 * lo que decidió el servidor (F07-POL-01): no suma, no resta y no deduce cifras
 * ocultas. F07 (2026-10-23): versión sellada y panel de sellado.
 *
 * Rediseño (sesión B, 2026-11-10): campaña y estado en la barra; «Cifra más
 * reciente» (regla de presentación: el resumen no tiene marca global, matriz
 * R11); acciones pendientes sólo cuando el dato existe; tres indicadores sin
 * duplicar (necesidades por estado, cobertura, versión); «Necesidades declaradas
 * por producto» como bloque principal, L y KG en escalas separadas y ordenadas
 * por nombre (nunca por cantidad); «Consumo publicado» aparte.
 *
 * `GET …/summary` sobre una campaña sin sellar ejecuta la decisión de
 * divulgación en el servidor: una sola llamada por campaña y visita, sin
 * sondeo; «Actualizar» y «Reintentar» son acciones explícitas.
 */
export function CollectiveSummaryPage() {
  const { campaigns, selected, select, error: campaignsError } = useSelectedCampaign();
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
      <div className="space-y-4">
        <PageHeader
          testId="toolbar"
          title="Resumen"
          subtitle="Necesidades declaradas por producto, cobertura y versión de la campaña seleccionada."
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
        {campaignsError && <Notice kind="error">{campaignsError}</Notice>}
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
        {(summary || noActive) && !loading && (
          <PendingActions summary={summary} noActive={noActive} campaignId={selected} />
        )}
        {summary && !loading && <SummaryBody summary={summary} />}
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
  link?: ReactNode;
}

/** Sólo acciones que un dato del servidor sustenta; ninguna se deduce de cantidades. */
function PendingActions({ summary, noActive, campaignId }: { summary: CollectiveSummary | null; noActive: boolean; campaignId: string | null }) {
  const actions: PendingAction[] = [];
  const linkClass = 'shrink-0 text-sm font-semibold text-brand-800 underline underline-offset-2 hover:text-ink';
  if (noActive) {
    actions.push({
      key: 'no-active',
      title: 'Sin campaña activa',
      description: 'El servidor no tiene ninguna campaña abierta y activa. Los agricultores no pueden registrar en una campaña hasta que se abra una.',
      link: <Link to="/campaigns" className={linkClass}>Ir a Campañas</Link>,
    });
  }
  if (summary && campaignId) {
    if (summary.campaign.status === 'CERRADA' && summary.seal === null) {
      actions.push({
        key: 'closed-unsealed',
        title: 'Campaña cerrada sin sellar',
        description: 'Cerrar no es sellar. Revise la versión colectiva y, si corresponde, séllela.',
        link: <a href="#sellado" className={linkClass}>Ir al sellado</a>,
      });
    }
    const pending = summary.cells.filter((cell) => cell.pending_changes).length;
    if (pending > 0) {
      actions.push({
        key: 'pending-changes',
        title: 'Hay cambios recibidos sin publicar',
        description: `${pending === 1 ? 'Una fila tiene' : `${pending} filas tienen`} cambios recibidos que aún no alcanzan el umbral para publicarse; mientras tanto se muestra lo publicado antes.`,
      });
    }
    actions.push({
      key: 'review',
      title: 'Revisar borrador',
      description: 'Revise el último borrador de propuesta de esta campaña o genere uno nuevo con un botón explícito.',
      link: (
        <Link to={`${COLLECTIVE_PATHS.proposals}?campaign=${encodeURIComponent(campaignId)}`} className={linkClass}>
          Abrir Necesidades y propuestas
        </Link>
      ),
    });
  }
  if (actions.length === 0) return null;
  return (
    <Section title="Acciones pendientes" testId="pending-actions">
      <ul className="divide-y divide-slate-100">
        {actions.map((action) => (
          <li key={action.key} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-5 py-3" data-testid={`action-${action.key}`}>
            <div className="min-w-0 flex-1 basis-64">
              <p className="text-sm font-semibold text-slate-900">{action.title}</p>
              <p className="text-xs leading-relaxed text-slate-600">{action.description}</p>
            </div>
            {action.link}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function SummaryBody({ summary }: { summary: CollectiveSummary }) {
  const { disclosure } = summary;
  const needs = sortByName(summary.cells.filter((cell) => cell.projection_type === 'DECLARED_NEED'));
  const consumption = sortByName(summary.cells.filter((cell) => cell.projection_type === 'CONSUMPTION_TOTAL'));
  const synthetic = disclosure.mode === 'PROVISIONAL_SYNTHETIC';
  return (
    <div className="space-y-4">
      <DisclosureNotice mode={disclosure.mode} threshold={disclosure.threshold} />
      <div className="grid gap-3 md:grid-cols-3" data-testid="summary-kpis">
        {synthetic && <NeedsCountTile cells={needs} />}
        {summary.coverage && (
          <CoverageCard
            coverage={summary.coverage}
            sealedAt={summary.seal?.sealed_at}
            link={`${COLLECTIVE_PATHS.coverage}?campaign=${encodeURIComponent(summary.campaign.campaign_ref)}`}
          />
        )}
        <VersionTile seal={summary.seal} />
      </div>
      {synthetic && (
        <>
          <NeedsSection cells={needs} threshold={disclosure.threshold} />
          <ConsumptionSection cells={consumption} threshold={disclosure.threshold} />
        </>
      )}
    </div>
  );
}

/** Orden alfabético por nombre de producto y unidad: nunca por cantidad (no es una prioridad). */
function sortByName(cells: SummaryCell[]): SummaryCell[] {
  return [...cells].sort(
    (a, b) => a.product_name.localeCompare(b.product_name, 'es', { sensitivity: 'base' }) || a.presentation_unit.localeCompare(b.presentation_unit),
  );
}

/** «2 productos con cifra publicada · 1 oculto por privacidad · 1 sin cifra publicada», sólo con lo que hay. */
function countsNote(cells: SummaryCell[]): { published: number; rest: string } {
  const published = cells.filter((cell) => cell.status === 'DISCLOSED').length;
  const privacy = cells.filter((cell) => cell.status === 'SUPPRESSED_UNDER_THRESHOLD').length;
  const other = cells.length - published - privacy;
  const parts: string[] = [];
  if (privacy > 0) parts.push(`${privacy} ${privacy === 1 ? 'oculto' : 'ocultos'} por privacidad`);
  if (other > 0) parts.push(`${other} sin cifra publicada`);
  return { published, rest: parts.join(' · ') };
}

/** Un conteo de filas por estado (nunca una cantidad): cuántos productos tienen cifra publicada. */
function NeedsCountTile({ cells }: { cells: SummaryCell[] }) {
  if (cells.length === 0) {
    return (
      <KpiTile
        testId="needs-counts"
        label="Necesidades por producto"
        value={<span className="text-lg">Sin necesidades publicadas</span>}
        note="Ningún agricultor publicó una necesidad declarada en esta campaña."
      />
    );
  }
  const { published, rest } = countsNote(cells);
  return (
    <KpiTile
      testId="needs-counts"
      label="Necesidades por producto"
      value={
        <>
          {published}{' '}
          <span className="text-sm font-semibold">{published === 1 ? 'producto con cifra publicada' : 'productos con cifra publicada'}</span>
        </>
      }
      note={rest || undefined}
    />
  );
}

/**
 * Versión sellada (F07) o «Sin sellar». «Datos aceptados hasta» es el instante
 * de la decisión sellada; cada cifra vale por su propia fecha.
 */
function VersionTile({ seal }: { seal: SealRef | null }) {
  if (!seal) {
    return (
      <KpiTile
        testId="version-tile"
        label="Versión"
        value={<span className="text-lg">Sin sellar</span>}
        note="Las cifras pueden cambiar mientras la campaña no tenga una versión sellada."
      />
    );
  }
  return (
    <KpiTile
      testId="seal-banner"
      label="Versión"
      value={<span className="text-lg">Versión {seal.version} sellada</span>}
      note={
        <span className="[overflow-wrap:anywhere]">
          El {fmtDateTime(seal.sealed_at)} por {seal.sealed_by.name} ({seal.sealed_by.role === 'ADMINISTRADOR' ? 'Administrador' : 'Directiva'}) ·
          datos aceptados hasta {fmtDateTime(seal.accepted_until)} · ref. <code title={seal.seal_ref}>{seal.seal_ref.slice(0, 8)}</code>. Cada
          cifra indica su propia fecha; las que tienen cambios pendientes muestran una cifra anterior. El servidor no puede asegurar que
          todos los teléfonos publicaron todo.
        </span>
      }
    />
  );
}

function NeedsSection({ cells, threshold }: { cells: SummaryCell[]; threshold: number | null }) {
  const units = (['L', 'KG'] as const).filter((unit) => cells.some((cell) => cell.presentation_unit === unit));
  return (
    <Section
      title="Necesidades declaradas por producto"
      note={`Lo que cada agricultor declaró que necesita para la campaña; no es pronóstico, consumo ni cantidad comprada.${
        cells.length > 0 ? ' Ordenado por nombre del producto; litros y kilogramos van en escalas separadas y no se suman.' : ''
      }`}
    >
      {cells.length === 0 ? (
        <p className="px-5 py-3 text-sm text-slate-600">Ningún agricultor publicó una necesidad declarada en esta campaña. Eso no significa cero.</p>
      ) : (
        units.map((unit) => (
          <div key={unit}>
            <p className="border-b border-slate-100 bg-slate-50 px-5 py-1.5 text-xs font-semibold text-slate-600">
              {unit === 'L' ? 'En litros (L)' : 'En kilogramos (KG)'}
            </p>
            <FigureRows cells={cells.filter((cell) => cell.presentation_unit === unit)} unit={unit} threshold={threshold} bars />
          </div>
        ))
      )}
    </Section>
  );
}

function ConsumptionSection({ cells, threshold }: { cells: SummaryCell[]; threshold: number | null }) {
  return (
    <Section
      title="Consumo publicado"
      note="Consumo que los agricultores registraron y publicaron desde la app. Es un dato distinto de la necesidad declarada: no se resta ni se compara con ella."
    >
      {cells.length === 0 ? (
        <p className="px-5 py-3 text-sm text-slate-600">Sin consumo publicado en esta campaña. Eso no significa cero.</p>
      ) : (
        (['L', 'KG'] as const)
          .filter((unit) => cells.some((cell) => cell.presentation_unit === unit))
          .map((unit) => (
            <FigureRows key={unit} cells={cells.filter((cell) => cell.presentation_unit === unit)} unit={unit} threshold={threshold} />
          ))
      )}
    </Section>
  );
}

const COUNT = new Intl.NumberFormat('es-BO');

/**
 * Una fila por producto y unidad: nombre y estado, cifra exacta (o el motivo por
 * el que no se publica, nunca un número ni un cero), aportantes y «datos hasta».
 * Con `bars`, una barra decorativa por fila en la escala de su unidad: la cifra
 * exacta siempre está escrita al lado.
 */
function FigureRows({ cells, unit, threshold, bars = false }: { cells: SummaryCell[]; unit: 'L' | 'KG'; threshold: number | null; bars?: boolean }) {
  const values = cells.map((cell) => (cell.status === 'DISCLOSED' && isBaseQuantity(cell.total_base) ? BigInt(cell.total_base) : null));
  const max = values.reduce<bigint>((top, value) => (value !== null && value > top ? value : top), 0n);
  const width = (value: bigint | null) => (value === null || value === 0n || max === 0n ? 0 : Math.max(Number((value * 1000n) / max) / 10, 1));
  return (
    <ul className="divide-y divide-slate-100" aria-label={unit === 'L' ? 'En litros' : 'En kilogramos'}>
      {cells.map((cell, index) => {
        const disclosed = cell.status === 'DISCLOSED';
        const text = disclosed ? formatQuantity(cell.total_base, cell.base_unit, cell.total_presentation) : null;
        return (
          <li
            key={`${cell.product_ref}|${cell.base_unit}`}
            className="grid gap-x-4 gap-y-1.5 px-5 py-3 md:grid-cols-[minmax(0,17rem)_minmax(0,1fr)_minmax(8.5rem,auto)] md:items-center"
            data-testid={`cell-${cell.projection_type}-${cell.product_name}-${cell.base_unit}`}
          >
            <div className="min-w-0">
              <span className="text-base font-semibold text-ink [overflow-wrap:anywhere]">{cell.product_name}</span>{' '}
              <span className="whitespace-nowrap text-xs text-slate-600">{cell.presentation_unit}</span>{' '}
              <StatusChip status={cell.status} threshold={threshold} />
            </div>
            {disclosed ? (
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                {text === null ? (
                  <span className="text-sm font-semibold text-red-700">Dato no válido recibido del servidor; no se muestra.</span>
                ) : (
                  <>
                    {bars && values[index]! > 0n && (
                      <div className="h-3 min-w-24 flex-1 rounded-full bg-slate-100" aria-hidden="true">
                        <div className="h-3 rounded-full bg-brand-700" style={{ width: `${width(values[index]!)}%` }} />
                      </div>
                    )}
                    <span className="text-2xl font-bold leading-tight tabular-nums text-ink [overflow-wrap:anywhere]">{text}</span>
                  </>
                )}
              </div>
            ) : (
              <p className="min-w-0 text-xs leading-snug text-slate-600">{statusReason(cell.status, threshold)}</p>
            )}
            <div className="text-xs text-slate-500 md:text-right">
              {disclosed && cell.contributors !== null ? (
                <>
                  <span className="block text-sm font-semibold text-slate-700 tabular-nums">
                    {COUNT.format(cell.contributors)} {cell.contributors === 1 ? 'aportante' : 'aportantes'}
                  </span>
                  <span className="tabular-nums">datos hasta {fmtDateTime(cell.data_as_of)}</span>
                </>
              ) : (
                <span className="text-slate-500">aportantes no revelados</span>
              )}
            </div>
            {cell.pending_changes && disclosed && (
              <div className="md:col-span-3">
                <PendingChangesNote />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function forbidden(err: unknown): boolean {
  return axios.isAxiosError(err) && err.response?.status === 403;
}
