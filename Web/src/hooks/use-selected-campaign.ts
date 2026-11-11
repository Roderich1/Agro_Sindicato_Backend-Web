import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { collectiveError } from '../lib/collective-text';
import { campaignsService } from '../services/campaigns.service';
import type { Campaign } from '../types/campaigns';
import { useCampaign } from './use-campaign';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CampaignList {
  campaigns: Campaign[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Lista de campañas de la sesión. La pide una sola vez `CampaignProvider` y
 * todas las vistas la leen de ahí (la API limita a 20 peticiones por minuto).
 * Sólo si el contexto no la gestiona (un valor fijo en pruebas o arneses) la
 * pide aquí, una vez por montaje, con el mismo texto de error.
 */
export function useCampaignList(): CampaignList {
  const context = useCampaign();
  const managed = context.campaigns !== undefined;
  const [own, setOwn] = useState<Campaign[]>([]);
  const [ownLoading, setOwnLoading] = useState(!managed);
  const [ownError, setOwnError] = useState<string | null>(null);

  const fetchOwn = useCallback(async () => {
    setOwnLoading(true);
    setOwnError(null);
    try {
      const rows = await campaignsService.list();
      setOwn(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setOwnError(collectiveError(err, 'No fue posible cargar las campañas.'));
    } finally {
      setOwnLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!managed) void Promise.resolve().then(fetchOwn);
  }, [managed, fetchOwn]);

  if (managed) {
    return {
      campaigns: context.campaigns!,
      loading: Boolean(context.campaignsLoading),
      error: context.campaignsError ?? null,
      refresh: context.refreshCampaigns ?? (async () => undefined),
    };
  }
  return { campaigns: own, loading: ownLoading, error: ownError, refresh: fetchOwn };
}

/** Campaña elegida, en la URL (`?campaign=`), por defecto la activa. Sólo se acepta un UUID. */
export function useSelectedCampaign() {
  const { activeCampaign } = useCampaign();
  const { campaigns, error, refresh } = useCampaignList();
  const [params, setParams] = useSearchParams();
  const requested = params.get('campaign');
  const selected = (requested && UUID.test(requested) ? requested : null) ?? activeCampaign?.id ?? campaigns[0]?.id ?? null;

  const select = (id: string) => setParams((prev) => {
    const next = new URLSearchParams(prev);
    next.set('campaign', id);
    return next;
  });
  /** `refresh` vuelve a pedir la lista de la sesión (p. ej. «Reintentar» tras un fallo). */
  return { campaigns, selected, select, error, refresh };
}
