/* Componentes compartidos del rediseño (contrato en README.md). Importe sólo desde aquí. */
export { Button, type ButtonProps } from './button';
export { CampaignSelector, type CampaignSelectorProps } from './campaign-selector';
export {
  buttonClass,
  buttonClassFor,
  cardClass,
  dangerButtonClass,
  ghostButtonClass,
  inputClass,
  labelClass,
  secondaryButtonClass,
  surfaceClass,
} from './classes';
export { Collapsible, type CollapsibleProps } from './collapsible';
export { DataState, type DataStateProps } from './data-state';
export { DataTable, type DataTableProps } from './data-table';
export { KpiTile, type KpiTileProps } from './kpi-tile';
export { Notice } from './notice';
export { PageHeader, type PageHeaderProps } from './page-header';
export { Section, SectionHeader, type SectionHeaderProps, type SectionProps } from './section';
export { SegmentedControl, type SegmentedControlProps } from './segmented-control';
export { StatusChip, type StatusChipProps } from './status-chip';
export { isKnownStatus, statusChipLabel } from './status-text';
export type { ButtonSize, ButtonVariant, DataStateKind, KpiTone, NoticeKind } from './types';
