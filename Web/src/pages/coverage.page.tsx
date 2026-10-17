import { useEffect, useState } from 'react';
import { AppShell, EmptyState, Notice } from '../components/app-shell';
import {
  CampaignPicker,
  CoverageBanner,
  DisclosureNotice,
} from '../components/collective-ui';
import { useSelectedCampaign } from '../hooks/use-selected-campaign';
import { collectiveError } from '../lib/collective-text';
import { collectiveService } from '../services/collective.service';
import type { CollectiveSummary } from '../types/collective';

/**
 * F07-WEB-03 (#25), alcance reducido: cobertura sólo agregada (cuántos
 * agricultores vinculados están dentro de cifras publicadas; F10-SEC-02), con
 * la misma política que el resumen.
 * No hay listado de quién aportó ni estado por agricultor.
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
    <AppShell title="Cobertura de agricultores" section="Directiva">
      <div className="space-y-6">
        <CampaignPicker campaigns={campaigns} selected={selected} onSelect={select} />
        {campaignsError && <Notice kind="error">{campaignsError}</Notice>}
        {error && <Notice kind="error">{error}</Notice>}
        {summary && (
          <>
            <DisclosureNotice mode={summary.disclosure.mode} threshold={summary.disclosure.threshold} />
            {summary.coverage ? (
              <CoverageBanner coverage={summary.coverage} campaignName={summary.campaign.name} />
            ) : (
              <EmptyState title="Cobertura no disponible" description="Sin política de divulgación aprobada no se publican conteos." />
            )}
          </>
        )}
        <Notice kind="info">
          Por decisión de alcance de F07 no se muestra qué agricultores aportaron ni su última sincronización: sólo el
          conteo agregado de quienes están en cifras publicadas.
        </Notice>
      </div>
    </AppShell>
  );
}
