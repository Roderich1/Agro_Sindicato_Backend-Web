import { statusReason } from '../../lib/collective-text';
import type { CampaignStatus } from '../../types/campaigns';
import type { AnyStatus } from '../../types/collective';
import { statusChipEntry, type ChipTone } from './status-text';

const TONE: Record<ChipTone, string> = {
  positive: 'bg-brand-50 text-brand-800 ring-brand-700/25',
  neutral: 'bg-slate-100 text-slate-700 ring-slate-500/25',
  attention: 'bg-amber-50 text-amber-900 ring-amber-600/30',
  critical: 'bg-red-50 text-red-800 ring-red-600/25',
};

export interface StatusChipProps {
  /** Estado de divulgación (AnyStatus), de campaña (CampaignStatus) o cualquier otro texto ya usado por la Web. */
  status: AnyStatus | CampaignStatus | string;
  /** Umbral de la política, para el motivo de SUPPRESSED_UNDER_THRESHOLD. */
  threshold?: number | null;
  testId?: string;
}

export function StatusChip({ status, threshold, testId }: StatusChipProps) {
  const entry = statusChipEntry(status);
  const reason = statusReason(status as AnyStatus, threshold);
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${TONE[entry.tone]}`}
      title={reason ?? undefined}
      data-status={status}
      data-testid={testId}
    >
      {entry.label}
    </span>
  );
}
