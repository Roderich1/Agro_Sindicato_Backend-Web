import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell, EmptyState, Notice } from '../components/app-shell';
import { Collapsible, CollectiveToolbar, DisclosureNotice, PageNote, StatTile } from '../components/collective-ui';
import { useSelectedCampaign } from '../hooks/use-selected-campaign';
import { collectiveError } from '../lib/collective-text';
import { reportDisclosureMode } from '../lib/data-mode';
import { COLLECTIVE_PATHS } from '../lib/navigation';
import { collectiveService } from '../services/collective.service';
import type { CollectiveSummary } from '../types/collective';

/**
 * «Cobertura» (F07-WEB-03, #25, alcance reducido): sólo el conteo agregado de
 * quienes están dentro de cifras publicadas (F10-SEC-02); nunca quién aportó.
 * El seguimiento operativo por agricultor depende de una consulta del servidor
 * que llega aparte: la vista deja su sitio preparado sin inventar datos.
 */
export function CoveragePage() {
  const { campaigns, selected, select, error: campaignsError } = useSelectedCampaign();
  const [summary, setSummary] = useState<CollectiveSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selected) return;
    let alive = true;
    collectiveService
      .summary(selected)
      .then((data) => {
        if (!alive) return;
        reportDisclosureMode(data.disclosure.mode);
        setError(null);
        setSummary(data);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setSummary(null);
        setError(collectiveError(err, 'No fue posible cargar la cobertura.'));
      });
    return () => {
      alive = false;
    };
  }, [selected]);

  return (
    <AppShell title="Cobertura" section="Colectivo">
      <div className="space-y-4">
        <CollectiveToolbar campaigns={campaigns} selected={selected} onSelect={select} />
        <PageNote>
          Cuántos agricultores vinculados están dentro de las cifras publicadas de la campaña. No se muestra quién aportó
          ni cuánto.
        </PageNote>
        {campaignsError && <Notice kind="error">{campaignsError}</Notice>}
        {error && <Notice kind="error">{error}</Notice>}
        {summary && (
          <>
            <DisclosureNotice mode={summary.disclosure.mode} threshold={summary.disclosure.threshold} />
            {summary.coverage ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <StatTile
                  testId="coverage"
                  label="Cobertura"
                  value={`${summary.coverage.members_with_contribution} de ${summary.coverage.linked_members}`}
                  note={
                    <>
                      {' '}agricultores vinculados con cifras publicadas.{' '}
                      {summary.coverage.suppressed_cells && 'Hay filas sin cifra (ocultas o en revisión) cuyos aportes no se cuentan. '}
                      Ausencia de aporte = desconocido, no cero.{' '}
                      <Link className="font-semibold text-emerald-700 underline" to={`${COLLECTIVE_PATHS.summary}?campaign=${encodeURIComponent(summary.campaign.campaign_ref)}`}>
                        Ver el resumen colectivo
                      </Link>
                    </>
                  }
                />
                <StatTile
                  tone="muted"
                  label="Vinculados al sindicato"
                  value={summary.coverage.linked_members}
                  note="agricultores activos con vínculo en el sindicato, aporten o no"
                />
              </div>
            ) : (
              <EmptyState title="Cobertura no disponible" description="Sin política de divulgación aprobada no se publican conteos." />
            )}
          </>
        )}
        <Collapsible title="Seguimiento de sincronización" label="Seguimiento de sincronización" testId="sync-tracking">
          <EmptyState
            compact
            title="Todavía sin consulta del servidor"
            description="Última sincronización y envíos pendientes por agricultor se mostrarán cuando el servidor exponga esa consulta. Hasta entonces no se muestran datos ni estados."
          />
        </Collapsible>
      </div>
    </AppShell>
  );
}
