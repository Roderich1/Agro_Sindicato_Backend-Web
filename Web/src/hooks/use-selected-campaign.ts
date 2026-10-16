import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { collectiveError } from '../lib/collective-text';
import { campaignsService } from '../services/campaigns.service';
import type { Campaign } from '../types/campaigns';
import { useCampaign } from './use-campaign';

/** Campaña elegida, en la URL (`?campaign=`), por defecto la activa. */
export function useSelectedCampaign() {
  const { activeCampaign } = useCampaign();
  const [params, setParams] = useSearchParams();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [error, setError] = useState<string | null>(null);
  const selected = params.get('campaign') ?? activeCampaign?.id ?? campaigns[0]?.id ?? null;

  useEffect(() => {
    let alive = true;
    campaignsService
      .list()
      .then((rows) => alive && setCampaigns(rows))
      .catch((err: unknown) => alive && setError(collectiveError(err, 'No fue posible cargar las campañas.')));
    return () => {
      alive = false;
    };
  }, []);

  const select = (id: string) => setParams((prev) => {
    const next = new URLSearchParams(prev);
    next.set('campaign', id);
    return next;
  });
  return { campaigns, selected, select, error };
}
