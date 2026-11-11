import { CAMPAIGN_STATUS_TEXT } from '../../lib/collective-text';
import type { Campaign } from '../../types/campaigns';
import { inputClass, labelClass } from './classes';
import { StatusChip } from './status-chip';

export interface CampaignSelectorProps {
  campaigns: Campaign[];
  /** `Campaign.id` seleccionado. */
  selected: string | null;
  onSelect: (id: string) => void;
  /** true por defecto: muestra «Activa» o «Distinta de la activa» como texto. */
  showActiveBadge?: boolean;
  /** «Campaña» por defecto. */
  label?: string;
  /** id del <select>; «campaign-selector» por defecto. */
  id?: string;
}

function optionText(campaign: Campaign): string {
  const status = CAMPAIGN_STATUS_TEXT[campaign.status] ?? campaign.status;
  return `${campaign.name} · ${status}${campaign.isActive ? ' · Activa' : ''}`;
}

/**
 * Selector de campaña. No supone una única campaña abierta: lista todas las
 * recibidas (aunque haya varias ABIERTA) y la «activa» es sólo la que el
 * servidor marca con `isActive`.
 */
export function CampaignSelector({ campaigns, selected, onSelect, showActiveBadge = true, label = 'Campaña', id = 'campaign-selector' }: CampaignSelectorProps) {
  const current = campaigns.find((campaign) => campaign.id === selected) ?? null;
  const active = campaigns.find((campaign) => campaign.isActive) ?? null;
  return (
    <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
      <div className="w-full min-w-0 sm:w-80">
        <label className={labelClass} htmlFor={id}>
          {label}
        </label>
        <select id={id} className={inputClass} value={selected ?? ''} onChange={(event) => onSelect(event.target.value)}>
          {current === null && <option value="">Seleccione una campaña</option>}
          {campaigns.map((campaign) => (
            <option key={campaign.id} value={campaign.id}>
              {optionText(campaign)}
            </option>
          ))}
        </select>
      </div>
      {current && (
        <div className="flex flex-wrap items-center gap-1.5 pb-2" data-testid="campaign-state">
          <StatusChip status={current.status} />
          {showActiveBadge && current.isActive && (
            <span className="inline-flex items-center rounded-full bg-brand-700 px-2 py-0.5 text-[11px] font-semibold text-white" data-testid="campaign-active">
              Activa
            </span>
          )}
          {showActiveBadge && !current.isActive && active && (
            <span
              className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900 ring-1 ring-inset ring-amber-600/30"
              title={`La campaña activa del sindicato es ${active.name}`}
              data-testid="campaign-differs"
            >
              Distinta de la activa
            </span>
          )}
        </div>
      )}
    </div>
  );
}
