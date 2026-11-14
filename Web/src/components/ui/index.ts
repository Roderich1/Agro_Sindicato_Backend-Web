/* Componentes compartidos del rediseño (contrato en README.md). Importe sólo desde aquí. */
export { AttentionList, type AttentionItem, type AttentionListProps } from './attention-list';
export { Avatar, type AvatarProps } from './avatar';
export { Button, IconButton, type ButtonProps, type IconButtonProps } from './button';
export { CampaignPill } from './campaign-pill';
export { CampaignSelector, type CampaignSelectorProps } from './campaign-selector';
export { Card, type CardProps } from './card';
export { Chip, PrivacyChip, Tag, type ChipProps } from './chip';
export {
  buttonClass,
  buttonClassFor,
  cardClass,
  dangerButtonClass,
  ghostButtonClass,
  helpClass,
  iconButtonClassFor,
  inputClass,
  labelClass,
  linkClass,
  secondaryButtonClass,
  surfaceClass,
} from './classes';
export { Collapsible, type CollapsibleProps } from './collapsible';
export { ConfirmDialog, type ConfirmDialogProps, type ConfirmReason } from './confirm-dialog';
export { DataState, type DataStateProps } from './data-state';
export { dataStateKindForError } from './data-state-kind';
export { DataTable, type DataTableColumn, type DataTableProps } from './data-table';
export { Dialog, type DialogProps } from './dialog';
export {
  Checkbox,
  Field,
  RadioCards,
  SearchInput,
  Select,
  TextInput,
  Textarea,
  type CheckboxProps,
  type FieldControlProps,
  type FieldProps,
  type RadioCardOption,
  type RadioCardsProps,
  type SearchInputProps,
  type SelectProps,
  type TextareaProps,
  type TextInputProps,
} from './field';
export { FilterChips, type FilterChipOption, type FilterChipsProps } from './filter-chips';
export { HeroPanel, type HeroPanelProps, type HeroSelectProps, type HeroStat } from './hero-panel';
export { ICON, type IconName } from './icon-paths';
export { Icon } from './icons';
export { initialsOf } from './initials';
export { KpiTile, type KpiTileProps } from './kpi-tile';
export { Notice } from './notice';
export { PageHeader, type PageHeaderAction, type PageHeaderProps } from './page-header';
export { ProgressBar, type ProgressBarProps } from './progress-bar';
export { QuantityFigure } from './quantity-figure';
export { Section, SectionHeader, type SectionHeaderProps, type SectionProps } from './section';
export { SegmentedControl, type SegmentedControlProps } from './segmented-control';
export { StatusChip, type StatusChipProps } from './status-chip';
export { SyntheticDataChip } from './synthetic-chip';
export { isKnownStatus, statusChipLabel } from './status-text';
export { Stepper, type StepperProps, type StepperStep } from './stepper';
export { TabPanel, Tabs, type TabItem, type TabPanelProps, type TabsProps } from './tabs';
export type { ButtonSize, ButtonVariant, DataStateKind, KpiTone, NoticeKind, TagTone } from './types';
