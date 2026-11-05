import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell, EmptyState, Notice } from '../components/app-shell';
import { CollectiveToolbar, DisclosureNotice, PageNote, SectionHeader, StatTile } from '../components/collective-ui';
import { useSelectedCampaign } from '../hooks/use-selected-campaign';
import { collectiveError } from '../lib/collective-text';
import { COLLECTIVE_PATHS } from '../lib/navigation';
import { collectiveService } from '../services/collective.service';
import type { CollectiveSummary } from '../types/collective';

/**
 * «Agricultores y sincronización» (defensa, 2026-11-05). La cobertura agregada
 * vive en el Resumen; aquí se repite sólo como indicador con enlace. El
 * seguimiento operativo por agricultor (última sincronización, pendientes)
 * depende de una consulta del servidor que aún no existe (sesión 3): la vista
 * deja su sitio preparado sin inventar datos ni estados.
 *
 * F07-WEB-03 (#25), alcance reducido: sólo el conteo agregado de quienes están
 * dentro de cifras publicadas (F10-SEC-02); nunca quién aportó.
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
    <AppShell title="Agricultores y sincronización" section="Colectivo">
      <div className="space-y-5">
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
                      {' '}agricultores vinculados con cifras publicadas · {summary.campaign.name}.{' '}
                      {summary.coverage.suppressed_cells && 'Hay filas sin cifra (bajo el umbral o en revisión) cuyos aportes no se cuentan. '}
                      Ausencia de aporte = desconocido, no cero.{' '}
                      <Link className="font-semibold text-emerald-700 underline" to={`${COLLECTIVE_PATHS.summary}?campaign=${encodeURIComponent(summary.campaign.campaign_ref)}`}>
                        Ver el resumen de la campaña
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
        <section className="glass-card overflow-hidden" aria-label="Seguimiento de sincronización" data-testid="sync-tracking">
          <SectionHeader
            title="Seguimiento de sincronización"
            note="Última sincronización y envíos pendientes por agricultor, con la consulta del servidor que prepara la sesión 3."
          />
          <EmptyState
            compact
            title="Todavía sin consulta del servidor"
            description="Esta vista se completará cuando el servidor exponga el seguimiento operativo. Hasta entonces no muestra datos ni estados."
          />
        </section>
      </div>
    </AppShell>
  );
}
