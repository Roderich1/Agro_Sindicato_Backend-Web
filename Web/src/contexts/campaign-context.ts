import { createContext } from 'react';
import type { Campaign } from '../types/campaigns';

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
