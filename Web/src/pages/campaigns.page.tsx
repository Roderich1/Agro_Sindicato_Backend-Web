import axios from 'axios';
import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '../components/app-shell';
import { Overline } from '../components/c/bits';
import { Button, DataState, Icon, ICON, Notice, PageHeader, SearchInput, Select, surfaceClass } from '../components/ui';
import { useAuth } from '../hooks/use-auth';
import { useCampaign } from '../hooks/use-campaign';
import { useCampaignList } from '../hooks/use-selected-campaign';
import { extractError } from '../lib/format';
import { isCollectiveRole } from '../lib/navigation';
import { campaignsService } from '../services/campaigns.service';
import { collectiveService } from '../services/collective.service';
import type { Campaign, CampaignStatus } from '../types/campaigns';
import { ActiveCampaignCard, CampaignActions, CampaignRow, OverdueNote } from './campaigns/campaign-cards';
import { CampaignFormDialog } from './campaigns/campaign-form-dialog';
import { MANAGER_ROLES, STATUS_FILTER_TEXT } from './campaigns/campaign.constants';

export { CampaignActions, OverdueNote };

const COUNT_TEXT: [CampaignStatus, string, string][] = [
  ['ABIERTA', 'abierta', 'abiertas'],
  ['PLANIFICADA', 'planificada', 'planificadas'],
  ['CERRADA', 'cerrada', 'cerradas'],
  ['CANCELADA', 'cancelada', 'canceladas'],
];

/**
 * Campañas del sindicato (láminas 28 y 41; diálogos 30.1, 30.2 y 34.3).
 */
export function CampaignsPage() {
  const { user } = useAuth();
  const { activeCampaign, refreshActiveCampaign } = useCampaign();
  const session = useCampaignList();
  const [found, setFound] = useState<Campaign[]>([]);
  const [status, setStatus] = useState<CampaignStatus | ''>('');
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [findLoading, setFindLoading] = useState(false);
  const [findError, setFindError] = useState<{ kind: 'error' | 'forbidden'; text: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [sealed, setSealed] = useState<Map<string, number>>(new Map());

  const canManage = Boolean(user && MANAGER_ROLES.includes(user.role));
  const collective = isCollectiveRole(user?.role);
  const filtered = Boolean(status || term);

  useEffect(() => {
    if (!collective) return undefined;
    let alive = true;
    collectiveService
      .trends(null)
      .then((trends) => {
        if (!alive) return;
        setSealed(new Map(trends.campaigns.filter((row) => row.seal).map((row) => [row.campaign_ref, row.seal!.version])));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [collective]);

  useEffect(() => {
    const timer = setTimeout(() => setTerm(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const find = useCallback(async () => {
    setFindLoading(true);
    setFindError(null);
    try {
      setFound(await campaignsService.list({ status: status || undefined, search: term || undefined }));
    } catch (err) {
      setFound([]);
      setFindError({
        kind: axios.isAxiosError(err) && err.response?.status === 403 ? 'forbidden' : 'error',
        text: extractError(err, 'No fue posible cargar las campañas.'),
      });
    } finally {
      setFindLoading(false);
    }
  }, [status, term]);

  useEffect(() => {
    if (filtered) void Promise.resolve().then(find);
  }, [filtered, find]);

  const campaigns = filtered ? found : session.campaigns;
  const isLoading = filtered ? findLoading : session.loading;
  const error = filtered ? findError : session.error ? { kind: 'error' as const, text: session.error } : null;
  const refreshSession = session.refresh;
  const refresh = useCallback(async () => {
    await (filtered ? find() : refreshSession());
    await refreshActiveCampaign();
  }, [filtered, find, refreshSession, refreshActiveCampaign]);

  const changed = async (text: string) => {
    setMessage(text);
    setCreating(false);
    await (filtered ? Promise.all([session.refresh(), find()]) : session.refresh());
  };

  const openCount = campaigns.filter((campaign) => campaign.status === 'ABIERTA').length;
  const active = activeCampaign ? (session.campaigns.find((row) => row.id === activeCampaign.id) ?? activeCampaign) : null;
  const others = campaigns.filter((campaign) => campaign.id !== active?.id);
  const onlyActiveMatches = filtered && others.length === 0 && campaigns.length > 0;
  const counts = COUNT_TEXT.map(([value, one, many]) => {
    const n = others.filter((campaign) => campaign.status === value).length;
    return n > 0 ? `${n} ${n === 1 ? one : many}` : null;
  })
    .filter(Boolean)
    .join(' · ');
  const activeInList = campaigns.some((campaign) => campaign.id === active?.id);

  return (
    <AppShell title="Campañas" section="Sindicato">
      <div className="flex flex-col gap-5">
        <PageHeader
          showSynthetic={false}
          attachToHeader
          eyebrowPhoneOnly
          title="Campañas"
          eyebrow={user?.tenant?.name}
          primaryAction={canManage ? { label: 'Nueva campaña', onClick: () => setCreating(true) } : undefined}
        />

        {message && <Notice kind="ok">{message}</Notice>}

        <section aria-labelledby="active-title" className="space-y-3">
          <div className="lg:sr-only">
            <Overline id="active-title">Campaña activa</Overline>
          </div>
          {active ? (
            <ActiveCampaignCard campaign={active} sealedVersion={sealed.get(active.id) ?? null} onChanged={changed} />
          ) : (
            <div data-testid="active-campaign">
              <Notice kind="warn">No hay campaña activa. Los agricultores no pueden registrar en una campaña hasta que la Directiva abra una.</Notice>
            </div>
          )}
        </section>

        <section aria-labelledby="list-title" className="space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <Overline id="list-title">{active && !filtered ? 'Otras campañas' : 'Campañas'}</Overline>
              <p className="mt-0.5 text-sm text-ink-muted" data-testid="campaign-counts">
                {isLoading || error ? ' ' : others.length === 0 ? (campaigns.length === 0 ? 'Sin campañas en la lista' : 'Ninguna otra campaña') : counts}
                {!isLoading && !error && openCount > 1 && ` · en total hay ${openCount} campañas abiertas${activeInList ? ', contando la de arriba' : ''}; «Campaña activa» es sólo la que el servidor marca como activa`}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <SearchInput
                id="campaign-search"
                label="Buscar campaña"
                value={search}
                onChange={setSearch}
                placeholder="Buscar campaña"
                enterKeyHint="search"
                inputMode="search"
                autoComplete="off"
                fieldClassName="w-full sm:w-64"
              />
              <Select id="campaign-status" label="Estado" hideLabel value={status} onChange={(event) => setStatus(event.target.value as CampaignStatus | '')} fieldClassName="w-full sm:w-44" className="rounded-full bg-surface">
                <option value="">Todas</option>
                {(Object.keys(STATUS_FILTER_TEXT) as CampaignStatus[]).map((value) => (
                  <option key={value} value={value}>
                    {STATUS_FILTER_TEXT[value]}
                  </option>
                ))}
              </Select>
              <Button variant="secondary" icon={<Icon d={ICON.refresh} className="h-4 w-4" />} onClick={() => void refresh()} disabled={isLoading}>
                Actualizar
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className={surfaceClass}>
              <DataState state="loading" title="Cargando campañas…" />
            </div>
          ) : error ? (
            <div className={surfaceClass}>
              <DataState state={error.kind} description={error.kind === 'forbidden' ? undefined : error.text} onRetry={() => void refresh()} testId="campaigns-error" />
            </div>
          ) : campaigns.length === 0 || onlyActiveMatches ? (
            <div className={surfaceClass}>
              {filtered ? (
                <DataState
                  state="no-match"
                  description={
                    onlyActiveMatches
                      ? 'Sólo coincide la campaña activa, que está arriba.'
                      : `Ninguna campaña coincide con el filtro aplicado (${[term && `«${term}»`, status && STATUS_FILTER_TEXT[status]].filter(Boolean).join(', ')}).`
                  }
                  onClearFilters={() => {
                    setSearch('');
                    setTerm('');
                    setStatus('');
                  }}
                />
              ) : (
                <DataState
                  state="empty"
                  title="Todavía no hay campañas"
                  description={canManage ? 'Cree la primera con «Nueva campaña».' : 'La Directiva aún no creó ninguna campaña.'}
                />
              )}
            </div>
          ) : others.length === 0 ? (
            <p className="text-sm text-ink-muted">No hay otras campañas: sólo la activa.</p>
          ) : (
            <ul className={`${surfaceClass} divide-y divide-line overflow-hidden`} aria-label="Otras campañas">
              {others.map((campaign) => (
                <CampaignRow key={campaign.id} campaign={campaign} sealedVersion={sealed.get(campaign.id) ?? null} onChanged={changed} />
              ))}
            </ul>
          )}
          <p className="text-sm text-ink-muted">Cerrar una campaña no la sella, y una campaña cerrada no se puede reabrir.</p>
        </section>
      </div>

      {creating && <CampaignFormDialog campaign={null} onClose={() => setCreating(false)} onDone={changed} />}
    </AppShell>
  );
}
