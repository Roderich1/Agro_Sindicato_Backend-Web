import { PolicyLine } from '../components/collective-ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { HeroCoverage } from '../components/a/coverage-figure';
import { AppShell } from '../components/app-shell';
import { CampaignSelector, Card, Collapsible, DataState, dataStateKindForError, ICON, Icon, PageHeader, type DataStateKind } from '../components/ui';
import { useSelectedCampaign } from '../hooks/use-selected-campaign';
import { collectiveError } from '../lib/collective-text';
import { reportDisclosureMode } from '../lib/data-mode';
import { CAMPAIGNS_PATH, COLLECTIVE_PATHS } from '../lib/navigation';
import { collectiveService } from '../services/collective.service';
import type { CollectiveSummary, Coverage } from '../types/collective';

const COUNT = new Intl.NumberFormat('es-BO');

/**
 * «Cobertura» (F07-WEB-03, #25, alcance reducido): sólo el conteo agregado de
 * quienes están dentro de cifras publicadas (F10-SEC-02); nunca quién aportó.
 * Fuera del menú: se llega desde el Resumen y el detalle de campaña.
 *
 * Rediseño v2 (lámina 04): «Volver al resumen», la cifra grande sobre tinta con
 * su barra de proporción y tres tarjetas (Vinculados, Con cifras publicadas,
 * Quién aportó). Distingue «aportes aceptados» (lo que el servidor consolidó)
 * de «registros locales» (lo que un teléfono tiene sin publicar), que la API
 * no expone (matriz V9).
 *
 * Una sola lectura de `GET …/summary` por campaña y visita (ejecuta la decisión
 * de divulgación en el servidor si no está sellada).
 */
export function CoveragePage() {
  const { campaigns, selected, select, error: campaignsError, refresh: refreshCampaigns } = useSelectedCampaign();
  const [summary, setSummary] = useState<CollectiveSummary | null>(null);
  const [error, setError] = useState<{ kind: DataStateKind; text: string } | null>(null);
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
      setError({ kind: dataStateKindForError(err), text: collectiveError(err, 'No fue posible cargar la cobertura.') });
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

  const campaign = campaigns.find((entry) => entry.id === selected) ?? null;
  const summaryUrl = selected ? `${COLLECTIVE_PATHS.summary}?campaign=${encodeURIComponent(selected)}` : COLLECTIVE_PATHS.summary;

  return (
    <AppShell title="Cobertura" section="Colectivo">
      <div className="space-y-6">
        <PageHeader
          eyebrow={
            <Link to={summaryUrl} className="font-semibold text-link underline underline-offset-2">
              Volver al resumen
            </Link>
          }
          title="Cobertura"
          subtitle={`${campaign ? `${campaign.name} · ` : ''}cuántos agricultores están dentro de las cifras publicadas`}
          campaign={campaigns.length > 1 ? <CampaignSelector campaigns={campaigns} selected={selected} onSelect={select} /> : undefined}
        />
        {campaignsError && <DataState state="error" description={campaignsError} onRetry={() => void refreshCampaigns()} testId="campaigns-list-error" />}
        {loading && (
          <Card>
            <DataState state="loading" title={campaign?.name ?? 'Cargando…'} description="Cargando la cobertura…" skeletonRows={2} />
          </Card>
        )}
        {error && !loading && (
          <Card>
            <DataState state={error.kind} description={error.kind === 'offline' || error.kind === 'busy' ? undefined : error.text} onRetry={selected ? () => void load(selected) : undefined} testId="coverage-error" />
          </Card>
        )}
        {!selected && !campaignsError && (
          <Card>
            <DataState
              state="empty"
              title="Todavía no hay campañas"
              description="Cree o abra una campaña para ver su cobertura."
              action={
                <Link to={CAMPAIGNS_PATH} className="font-semibold text-link underline underline-offset-2">
                  Ir a Campañas
                </Link>
              }
            />
          </Card>
        )}
        {summary && !loading && <CoverageBody coverage={summary.coverage} sealedAt={summary.seal?.sealed_at ?? null} policyPending={summary.disclosure.mode === 'POLICY_PENDING'} />}
        {/* E4 (verificación O1): la política de publicación aplicada, como en el Resumen. */}
        {summary && !loading && summary.disclosure.mode !== 'POLICY_PENDING' && (
          <PolicyLine policy={summary.disclosure.policy} threshold={summary.disclosure.threshold} testId="coverage-policy" />
        )}
        <section aria-labelledby="aceptados-locales" className="rounded-card border border-line bg-surface px-5 py-6 shadow-card sm:px-8" data-testid="accepted-vs-local">
          <h2 id="aceptados-locales" className="text-xl font-bold text-ink">
            Aportes aceptados y registros locales
          </h2>
          <div className="mt-3 space-y-2 text-base leading-relaxed text-ink-muted">
            <p>
              <span className="font-semibold text-ink">Aportes aceptados:</span> lo que los teléfonos publicaron y el servidor aceptó y
              consolidó. Es lo único que cuentan las cifras y la cobertura de esta página.
            </p>
            <p>
              <span className="font-semibold text-ink">Registros locales:</span> lo que un agricultor tiene registrado en su teléfono sin
              publicar. El servidor no lo conoce y <strong className="text-ink">no está disponible</strong> aquí: no se puede saber si todos los
              teléfonos publicaron todo. Una cobertura alta no significa que los datos estén completos.
            </p>
          </div>
        </section>
        <Collapsible title="Seguimiento de sincronización" label="Seguimiento de sincronización" testId="sync-tracking">
          <div className="px-5 py-4 sm:px-7">
            <DataState
              state="empty"
              title="Todavía sin consulta del servidor"
              description="Última sincronización y envíos pendientes por agricultor no se muestran: el servidor no expone esa consulta. No se muestran datos ni estados."
              compact
            />
          </div>
        </Collapsible>
      </div>
    </AppShell>
  );
}

/** Cifra grande y las tres tarjetas de la lámina 04. Sin cobertura (política pendiente) no hay conteos. */
function CoverageBody({ coverage, sealedAt, policyPending }: { coverage: Coverage | null; sealedAt: string | null; policyPending: boolean }) {
  if (!coverage) {
    return (
      <Card testId="coverage">
        <DataState
          state={policyPending ? 'policy-pending' : 'restricted'}
          title="Cobertura no disponible"
          description="Sin política de divulgación aprobada el servidor no publica conteos. Eso no significa cero."
        />
      </Card>
    );
  }
  const { linked_members: linked, members_with_contribution: within } = coverage;
  return (
    <div className="space-y-6" data-testid="coverage">
      <section aria-label="Cobertura de la campaña" className="ui-on-ink rounded-hero bg-ink px-6 py-7 text-white sm:px-10 sm:py-9">
        <HeroCoverage coverage={coverage} sealedAt={sealedAt} bar plain testId="coverage-figure" />
      </section>
      <div className="grid gap-6 md:grid-cols-3">
        <Card as="article" padding="lg">
          <h2 className="text-xl font-bold text-ink">Vinculados · {COUNT.format(linked)}</h2>
          <p className="mt-3 text-base leading-relaxed text-ink-muted">
            Agricultores con vínculo y cuenta activos en el sindicato, aporten o no. No es el padrón del sindicato.
          </p>
        </Card>
        <Card as="article" padding="lg">
          <h2 className="text-xl font-bold text-ink">Con cifras publicadas · {COUNT.format(within)}</h2>
          <p className="mt-3 text-base leading-relaxed text-ink-muted">
            Están dentro de alguna cifra publicada (necesidad o consumo). Quien aportó solo a productos sin cifra publicada no se cuenta. Quien no figura
            es desconocido, no cero. Mide participación, no que los datos estén completos ni que sean suficientes.
          </p>
        </Card>
        <Card as="article" padding="lg">
          <h2 className="text-xl font-bold text-ink">Quién aportó</h2>
          <p className="mt-3 flex items-start gap-3 text-base leading-relaxed text-ink-muted">
            <Icon d={ICON.lock} className="mt-1 h-5 w-5 shrink-0 text-ink" />
            <span>No se muestra, ni tampoco cuándo sincronizó cada persona: la Web sólo recibe el conteo agregado que permite la política de divulgación del sindicato.</span>
          </p>
        </Card>
      </div>
    </div>
  );
}
