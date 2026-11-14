import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { campaignsService } from '../services/campaigns.service';
import type { Campaign } from '../types/campaigns';
import { useAuth } from '../hooks/use-auth';
import { collectiveError } from '../lib/collective-text';
import { isCollectiveRole } from '../lib/navigation';

export interface CampaignContextValue {
  activeCampaign: Campaign | null;
  isLoading: boolean;
  error: string | null;
  refreshActiveCampaign: () => Promise<void>;
  hasActiveCampaign: boolean;
  /**
   * Lista de `GET /campaigns`, pedida una sola vez por sesión y compartida por
   * todas las vistas (la API limita a 20 peticiones por minuto). `undefined`
   * sólo cuando quien provee el contexto no la gestiona (p. ej. una prueba que
   * da un valor fijo): entonces `useCampaignList` la pide por su cuenta.
   */
  campaigns?: Campaign[];
  /** `true` mientras la lista se está pidiendo (primera vez o `refreshCampaigns`). */
  campaignsLoading?: boolean;
  campaignsError?: string | null;
  /** Vuelve a pedir la lista; lo llaman las vistas tras crear, editar, abrir o cerrar. */
  refreshCampaigns?: () => Promise<void>;
}

export const CampaignContext = createContext<CampaignContextValue | null>(null);

/** Quien no es Directiva ni Administrador no recibe datos en la Web: no se piden las campañas. */
function mayLoad(role: string | undefined): boolean {
  return isCollectiveRole(role);
}

export function CampaignProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(true);
  const [campaignsError, setCampaignsError] = useState<string | null>(null);

  const refreshActiveCampaign = useCallback(async () => {
    // F07-WEB-01 (#23): tampoco la campaña activa para otros roles.
    if (!user || !mayLoad(user.role)) {
      setActiveCampaign(null);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const campaign = await campaignsService.active();
      setActiveCampaign(campaign ?? null);
    } catch {
      setActiveCampaign(null);
      setError('No fue posible cargar la campaña activa.');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const refreshCampaigns = useCallback(async () => {
    if (!user || !mayLoad(user.role)) {
      setCampaigns([]);
      setCampaignsError(null);
      setCampaignsLoading(false);
      return;
    }
    setCampaignsLoading(true);
    setCampaignsError(null);
    try {
      const rows = await campaignsService.list();
      setCampaigns(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setCampaigns([]);
      setCampaignsError(collectiveError(err, 'No fue posible cargar las campañas.'));
    } finally {
      setCampaignsLoading(false);
    }
  }, [user]);

  // Una sola carga por sesión: se repite sólo si cambia la identidad (inicio o
  // cierre de sesión), o cuando una vista llama a los `refresh*` tras escribir.
  // La guarda evita la segunda carga cuando StrictMode repite el efecto.
  const loadedFor = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (isAuthLoading) return;
    // Identidad = persona, rol y sindicato: al cerrar sesión (user nulo) la lista
    // se vacía; con otra persona, rol o sindicato se vuelve a pedir.
    const identity = user ? `${user.id}|${user.role}|${user.tenantId}` : null;
    if (loadedFor.current === identity) return;
    loadedFor.current = identity;
    void Promise.resolve().then(() => Promise.all([refreshActiveCampaign(), refreshCampaigns()]));
  }, [isAuthLoading, user, refreshActiveCampaign, refreshCampaigns]);

  const value = useMemo<CampaignContextValue>(
    () => ({
      activeCampaign,
      isLoading,
      error,
      refreshActiveCampaign,
      hasActiveCampaign: Boolean(activeCampaign?.isActive && activeCampaign.status === 'ABIERTA'),
      campaigns,
      campaignsLoading,
      campaignsError,
      refreshCampaigns,
    }),
    [activeCampaign, error, isLoading, refreshActiveCampaign, campaigns, campaignsLoading, campaignsError, refreshCampaigns],
  );

  return <CampaignContext.Provider value={value}>{children}</CampaignContext.Provider>;
}
