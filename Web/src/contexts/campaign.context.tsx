import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { campaignsService } from '../services/campaigns.service';
import type { Campaign } from '../types/campaigns';
import { useAuth } from '../hooks/use-auth';

export interface CampaignContextValue {
  activeCampaign: Campaign | null;
  isLoading: boolean;
  error: string | null;
  refreshActiveCampaign: () => Promise<void>;
  hasActiveCampaign: boolean;
}

export const CampaignContext = createContext<CampaignContextValue | null>(null);

export function CampaignProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshActiveCampaign = useCallback(async () => {
    if (!user) {
      setActiveCampaign(null);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const campaign = await campaignsService.active();
      setActiveCampaign(campaign);
    } catch {
      setActiveCampaign(null);
      setError('No fue posible cargar la campana activa.');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (isAuthLoading) return;
    void Promise.resolve().then(refreshActiveCampaign);
  }, [isAuthLoading, refreshActiveCampaign]);

  const value = useMemo<CampaignContextValue>(
    () => ({
      activeCampaign,
      isLoading,
      error,
      refreshActiveCampaign,
      hasActiveCampaign: Boolean(activeCampaign?.isActive && activeCampaign.status === 'ABIERTA'),
    }),
    [activeCampaign, error, isLoading, refreshActiveCampaign],
  );

  return <CampaignContext.Provider value={value}>{children}</CampaignContext.Provider>;
}
