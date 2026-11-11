import type { Campaign } from '../../../types/campaigns';
import type { CollectiveSummary } from '../../../types/collective';

/** Lo que el arnés entrega a cada variante: el mismo fixture para todas. */
export interface VariantProps {
  campaigns: Campaign[];
  selected: string | null;
  onSelect: (id: string) => void;
  /** Resumen de la campaña seleccionada; `null` si el fixture no la cubre. */
  summary: CollectiveSummary | null;
}
