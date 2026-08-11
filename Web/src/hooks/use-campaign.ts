import { useContext } from 'react';
import { CampaignContext } from '../contexts/campaign.context';

export function useCampaign() {
  const context = useContext(CampaignContext);
  if (!context) {
    throw new Error('useCampaign debe usarse dentro de CampaignProvider');
  }
  return context;
}
