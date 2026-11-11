import axios from 'axios';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../components/app-shell';
import { DisclosureNotice } from '../components/collective-ui';
import { CoverageCard } from '../components/coverage-card';
import { buttonClassFor, CampaignSelector, Collapsible, DataState, PageHeader, Section, surfaceClass } from '../components/ui';
import { useSelectedCampaign } from '../hooks/use-selected-campaign';
import { collectiveError } from '../lib/collective-text';
import { reportDisclosureMode } from '../lib/data-mode';
import { COLLECTIVE_PATHS } from '../lib/navigation';
import { collectiveService } from '../services/collective.service';
import type { CollectiveSummary } from '../types/collective';

/**
 * «Cobertura» (F07-WEB-03, #25, alcance reducido): sólo el conteo agregado de
 * quienes están dentro de cifras publicadas (F10-SEC-02); nunca quién aportó.
 * Sale del menú en el rediseño (la ruta se conserva y se enlaza desde el
 * Resumen y el detalle de campaña).
 *
 * Distingue «aportes aceptados» (lo que el servidor consolidó) de «registros
 * locales» (lo que un teléfono tiene sin publicar), que la API no expone
 * (matriz V9). El seguimiento por agricultor depende de una consulta que no
 * está integrada (matriz V7, `7fd3365`): su sitio queda preparado sin datos.
 *
 * Una sola lectura de `GET …/summary` por campaña y visita (ejecuta la decisión
 * de divulgación en el servidor si no está sellada).
 */
export function CoveragePage() {
  const { campaigns, selected, select, error: campaignsError, refresh: refreshCampaigns } = useSelectedCampaign();
  const [summary, setSummary] = useState<CollectiveSummary | null>(null);
  const [error, setError] = useState<{ kind: 'error' | 'forbidden'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const current = useRef<string | null>(null);
  const requested = useRef<string | null>(null);

  const load = useCallback(async (campaignId: string) => {
    setLoading(true);
    setError(null);
    setSummary(null);
    try {
      const data = await collectiveService.summary(campaignId);
      if (current.current !== campaignId) return;
      reportDisclosureMode(data.disclosure.mode);
      setSummary(data);
    } catch (err) {
      if (current.current !== campaignId) return;
      setError({
        kind: axios.isAxiosError(err) && err.response?.status === 403 ? 'forbidden' : 'error',
        text: collectiveError(err, 'No fue posible cargar la cobertura.'),
      });
    } finally {
      if (current.current === campaignId) setLoading(false);
    }
  }, []);

  useEffect(() => {
    current.current = selected;
    if (!selected || requested.current === selected) return;
    requested.current = selected;
    void Promise.resolve().then(() => load(selected));
  }, [selected, load]);

  return (
    <AppShell title="Cobertura" section="Colectivo">
      <div className="space-y-4">
        <PageHeader
          title="Cobertura"
          subtitle="Cuántos agricultores vinculados están dentro de las cifras publicadas de la campaña. No se muestra quién aportó ni cuánto."
          campaign={<CampaignSelector campaigns={campaigns} selected={selected} onSelect={select} />}
          actions={
            selected && (
              <Link to={`${COLLECTIVE_PATHS.summary}?campaign=${encodeURIComponent(selected)}`} className={buttonClassFor('secondary')}>
                Ver el resumen
              </Link>
            )
          }
        />
        {campaignsError && (
          <DataState state="error" description={campaignsError} onRetry={() => void refreshCampaigns()} testId="campaigns-list-error" />
        )}
        {loading && <DataState state="loading" compact />}
        {error && (
          <div className={surfaceClass}>
            <DataState state={error.kind} description={error.text} onRetry={selected ? () => void load(selected) : undefined} testId="coverage-error" />
          </div>
        )}
        {!selected && !campaignsError && (
          <div className={surfaceClass}>
            <DataState state="empty" title="No hay campañas" description="Cree o abra una campaña compartida en Campañas." />
          </div>
        )}
        {summary && !loading && (
          <>
            <DisclosureNotice mode={summary.disclosure.mode} threshold={summary.disclosure.threshold} />
            <CoverageCard coverage={summary.coverage} sealedAt={summary.seal?.sealed_at} variant="full" />
          </>
        )}
        <Section title="Aportes aceptados y registros locales" testId="accepted-vs-local">
          <div className="space-y-2 px-5 py-4 text-sm leading-relaxed text-slate-700">
            <p>
              <span className="font-semibold text-ink">Aportes aceptados:</span> lo que los teléfonos publicaron y el servidor aceptó y
              consolidó. Es lo único que cuentan las cifras y la cobertura de esta página.
            </p>
            <p>
              <span className="font-semibold text-ink">Registros locales:</span> lo que un agricultor tiene registrado en su teléfono sin
              publicar. El servidor no lo conoce y <strong>no está disponible</strong> aquí: no se puede saber si todos los teléfonos
              publicaron todo. Una cobertura alta no significa que los datos estén completos.
            </p>
          </div>
        </Section>
        <Collapsible title="Seguimiento de sincronización" label="Seguimiento de sincronización" testId="sync-tracking">
          <DataState
            state="empty"
            title="Todavía sin consulta del servidor"
            description="Última sincronización y envíos pendientes por agricultor se mostrarán cuando el servidor exponga esa consulta. Hasta entonces no se muestran datos ni estados."
            compact
          />
        </Collapsible>
      </div>
    </AppShell>
  );
}
