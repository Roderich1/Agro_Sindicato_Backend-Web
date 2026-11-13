import { CAMPAIGN_STATUS_TEXT } from '../../lib/collective-text';
import type { Campaign } from '../../types/campaigns';
import { ICON, Icon } from '../ui';

/**
 * Selector de campaña compacto en forma de píldora blanca (láminas 06 y 26:
 * «Invierno 2026 (DEMO) · Abierta»). Es un `<select>` nativo con su etiqueta
 * («Campaña») para lectores de pantalla. Como `CampaignSelector`, no supone una
 * única campaña abierta: cada opción dice su estado y «Activa» sólo para la
 * que el servidor marca `isActive`.
 */
export function CampaignPill({
  campaigns,
  selected,
  onSelect,
  id = 'campaign-selector',
  label = 'Campaña',
}: {
  campaigns: Campaign[];
  selected: string | null;
  onSelect: (id: string) => void;
  id?: string;
  label?: string;
}) {
  if (campaigns.length === 0 || !selected) return null;
  const optionText = (campaign: Campaign) =>
    `${campaign.name} · ${CAMPAIGN_STATUS_TEXT[campaign.status] ?? campaign.status}${campaign.isActive ? ' · Activa' : ''}`;
  const current = campaigns.find((campaign) => campaign.id === selected);
  return (
    <span className="relative inline-flex min-w-0 max-w-full">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        value={selected}
        title={current ? optionText(current) : undefined}
        onChange={(event) => onSelect(event.target.value)}
        className="block min-h-11 w-full max-w-full cursor-pointer appearance-none truncate rounded-full border border-line bg-surface py-2 pl-4 pr-10 text-sm font-semibold text-ink shadow-card hover:border-ink sm:text-base"
      >
        {campaigns.map((campaign) => (
          <option key={campaign.id} value={campaign.id}>
            {optionText(campaign)}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-ink">
        <Icon d={ICON.chevronDown} className="h-5 w-5" />
      </span>
    </span>
  );
}
