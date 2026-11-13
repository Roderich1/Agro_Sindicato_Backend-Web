import { statusReason } from '../../lib/collective-text';
import type { CampaignStatus } from '../../types/campaigns';
import type { AnyStatus } from '../../types/collective';
import { TAG_TONE } from './tag-tone';
import { ICON } from './icon-paths';
import { Icon } from './icons';
import { statusChipEntry, type ChipTone } from './status-text';
import type { TagTone } from './types';

const TONE: Record<ChipTone, TagTone> = {
  positive: 'positive',
  neutral: 'neutral',
  attention: 'attention',
  critical: 'danger',
  hidden: 'hidden',
};

export interface StatusChipProps {
  /** Estado de divulgación (AnyStatus), de campaña (CampaignStatus) o cualquier otro texto ya usado por la Web. */
  status: AnyStatus | CampaignStatus | string;
  /** Umbral de la política, para el motivo de SUPPRESSED_UNDER_THRESHOLD. */
  threshold?: number | null;
  testId?: string;
}

/**
 * Estado de la API como texto en español. Los positivos llevan un punto (como
 * «Abierta» en las láminas); «Oculto por privacidad», candado y borde
 * discontinuo. El motivo de divulgación va además en `title`.
 */
export function StatusChip({ status, threshold, testId }: StatusChipProps) {
  const entry = statusChipEntry(status);
  const reason = statusReason(status as AnyStatus, threshold);
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold leading-tight ${TAG_TONE[TONE[entry.tone]]}`}
      title={reason ?? undefined}
      data-status={status}
      data-testid={testId}
    >
      {entry.tone === 'positive' && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />}
      {entry.tone === 'hidden' && <Icon d={ICON.lock} className="h-3.5 w-3.5" />}
      {entry.label}
    </span>
  );
}
