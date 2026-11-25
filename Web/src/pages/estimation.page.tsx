import { AppShell } from '../components/app-shell';
import { EstimationCopyView } from '../components/estimation-copy-view';
import { ExportButtons } from '../components/export-buttons';
import { Button, CampaignPill, Card, DataState, Notice, PageHeader } from '../components/ui';
import { fmtDateTime } from '../lib/collective-text';
import { HistorySection, RunDetail } from './estimation/estimation-history-section';
import { CopyPanel, JobPanel, RequestOptions, ResultsSection } from './estimation/estimation-results-section';
import { ERROR_STATE, ERROR_TITLE } from './estimation/estimation.helpers';
import { useEstimationView } from './estimation/use-estimation-view';

/** Cada cuánto se consulta un trabajo en cola o en proceso. */
export const POLL_MS = 2000;

/**
 * F12-EST-06 (#179): «Estimación del consumo» para DIRECTIVA y ADMINISTRADOR
 * (INT-09, perfil institucional). La Web pide y presenta: el SES/naive lo
 * calcula el servidor, por lotes. La estimación es una referencia de consumo
 * para una campaña comparable: no se suma a la necesidad declarada ni crea
 * compras, propuestas o movimientos. Un dato ausente nunca se muestra como
 * cero, y cada cifra dice de qué ejecución viene. «Descargar Excel» exporta la
 * consulta tal como responde el servidor y requiere conexión; no es la copia descargada para
 * consultar sin conexión (RF-40, F12-EST-07), que esta pantalla sí ofrece aparte.
 *
 * Rediseño (sesión C, 2026-11-10): el cuerpo es `EstimationView`, que también
 * usa el contenedor «Histórico y estimaciones» (`?vista=estimacion`). Muestra
 * cuándo se evaluó la vigencia (`evaluated_at`) y la ejecución de cada cifra en
 * «Ver detalle». Abrir la vista sólo consulta: no pide estimaciones ni copias.
 */
export function EstimationPage() {
  return (
    <AppShell title="Estimación del consumo" section="Colectivo">
      <EstimationView />
    </AppShell>
  );
}

export function EstimationView({ headingLevel = 1 }: { headingLevel?: 1 | 2 }) {
  const vm = useEstimationView(POLL_MS);

  return (
    <div className="space-y-5">
      <PageHeader
        headingLevel={headingLevel}
        title="Estimación del consumo"
        subtitle="Un cálculo a partir de campañas anteriores, hecho por el servidor. Es una referencia: no se suma a la necesidad ni crea compras."
      />
      <div className="flex flex-wrap items-center gap-3" data-testid="estimation-toolbar">
        <CampaignPill campaigns={vm.campaigns} selected={vm.selected} onSelect={vm.select} />
        {vm.calculatedAt && (
          <p className="text-sm text-ink-muted" data-testid="calculated-at">
            Calculada el {fmtDateTime(vm.calculatedAt)}
            {vm.results?.season ? ` · temporada ${vm.results.season.key.toLowerCase()}` : ''}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3 sm:ml-auto">
          <ExportButtons kind="estimation" reference={vm.selected} disabled={vm.stale || !vm.results || vm.results.results.length === 0} />
          {!vm.blocked && vm.selected && (
            <Button onClick={() => void vm.request()} disabled={vm.busy || !vm.eligible} busy={vm.busy}>
              {vm.busy ? 'Generando…' : 'Generar estimación'}
            </Button>
          )}
        </div>
      </div>
      {vm.campaignsError && <Notice kind="error">{vm.campaignsError}</Notice>}
      {vm.error && (
        <div data-testid={`error-${vm.error.kind}`}>
          <Card>
            <DataState state={ERROR_STATE[vm.error.kind]} title={ERROR_TITLE[vm.error.kind]} description={vm.error.message} />
          </Card>
        </div>
      )}
      {vm.stale && (
        <p className="rounded-control bg-warn-bg px-4 py-2 text-sm text-warn-ink" data-testid="stale">
          Lo que se muestra es de la última consulta que respondió; puede no estar actualizado. Sin conexión no se
          exporta, y generar, actualizar o descargar también requieren conexión.
        </p>
      )}

      {((!vm.blocked && vm.selected) || vm.job) && (
        <div className="space-y-2">
          {!vm.blocked && vm.selected && (
            <RequestOptions eligible={vm.eligible} campaignStatus={vm.campaign?.status ?? null} catalog={vm.catalog} chosen={vm.chosen} onChoose={vm.setChosen} />
          )}
          {vm.job && <JobPanel job={vm.job} polling={vm.polling} onRecheck={() => void vm.recheckJob()} />}
        </div>
      )}
      {vm.loading && (
        <Card>
          <DataState state="loading" title="Cargando la estimación…" skeletonRows={3} />
        </Card>
      )}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)] xl:items-start">
        <div className="min-w-0 space-y-5">
          {vm.results && <ResultsSection results={vm.results} details={vm.details} latestRun={vm.job?.run_ref ?? null} />}
          {vm.opened && <RunDetail run={vm.opened} onClose={() => vm.setOpened(null)} />}
          {!vm.blocked && vm.offline && vm.copy && <EstimationCopyView copy={vm.copy} />}
        </div>
        {((!vm.blocked && vm.selected) || vm.results) && (
          <div className="min-w-0 space-y-5">
            {!vm.blocked && vm.selected && (
              <CopyPanel copy={vm.copy} offline={vm.offline} downloading={vm.downloading} note={vm.copyNote} onDownload={() => void vm.downloadCopy()} />
            )}
            {vm.results && (
              <HistorySection runs={vm.runs} hasMore={vm.cursor !== null} onMore={() => void vm.moreRuns()} onOpen={(id) => void vm.openRun(id)} openedId={vm.opened?.run_ref ?? null} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
