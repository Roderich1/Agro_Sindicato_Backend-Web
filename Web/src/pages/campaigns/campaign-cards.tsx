import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, buttonClassFor, Chip, ConfirmDialog, Icon, ICON, Notice, StatusChip } from '../../components/ui';
import { useAuth } from '../../hooks/use-auth';
import { useCampaign } from '../../hooks/use-campaign';
import { fmtDateTime } from '../../lib/collective-text';
import { extractError } from '../../lib/format';
import { campaignDetailPath } from '../../lib/navigation';
import { campaignsService } from '../../services/campaigns.service';
import type { Campaign } from '../../types/campaigns';
import { fmtCampaignDay, isEstimatedEndOverdue, OVERDUE_TEXT } from '../campaign-dates';
import { MANAGER_ROLES } from './campaign.constants';
import { CampaignFormDialog } from './campaign-form-dialog';

function SealChip({ version }: { version: number | null }) {
  if (version === null) return null;
  return (
    <Chip tone="positive" dot>
      Sellada · versión {version}
    </Chip>
  );
}

/** Texto (no sólo color) de la regla de presentación «fin estimado vencido». */
export function OverdueNote({ onDark = false }: { onDark?: boolean }) {
  return (
    <span className={`mt-0.5 block font-sans text-xs font-semibold ${onDark ? 'text-warn-bg' : 'text-caution'}`} data-testid="overdue">
      {OVERDUE_TEXT}
    </span>
  );
}

/** Editar, abrir y cerrar una campaña, con los mismos permisos y confirmaciones. */
export function CampaignActions({ campaign, onChanged, onDark = false }: { campaign: Campaign; onChanged: (message: string) => Promise<void> | void; onDark?: boolean }) {
  const { user } = useAuth();
  const { refreshActiveCampaign } = useCampaign();
  const [editing, setEditing] = useState(false);
  const [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [closeBusy, setCloseBusy] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canManage = Boolean(user && MANAGER_ROLES.includes(user.role));
  if (!canManage) return <span className={`self-center text-xs ${onDark ? 'text-on-ink-muted' : 'text-ink-muted'}`}>Sólo consulta</span>;

  const terminal = campaign.status === 'CERRADA' || campaign.status === 'CANCELADA';
  const variant = onDark ? 'on-dark' : 'secondary';
  const size = onDark ? 'md' : 'sm';
  const done = async (text: string) => {
    setEditing(false);
    setClosing(false);
    await Promise.all([onChanged(text), refreshActiveCampaign()]);
  };
  const open = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await campaignsService.open(campaign.id);
      await done('Campaña abierta.');
    } catch (err) {
      setError(extractError(err, 'No fue posible abrir la campaña.'));
    } finally {
      setBusy(false);
    }
  };
  const close = async (notes: string) => {
    setCloseBusy(true);
    setCloseError(null);
    try {
      await campaignsService.close(campaign.id, { notes: notes || null });
      setCloseBusy(false);
      await done('Campaña cerrada.');
    } catch (err) {
      setCloseError(extractError(err, 'No fue posible cerrar la campaña.'));
      setCloseBusy(false);
    }
  };

  return (
    <>
      {!terminal && (
        <Button variant={variant} size={size} onClick={() => setEditing(true)}>
          Editar
        </Button>
      )}
      {!campaign.isActive && !terminal && (
        <Button variant={onDark ? 'accent' : 'primary'} size={size} onClick={() => void open()} busy={busy}>
          Abrir campaña
        </Button>
      )}
      {campaign.isActive && (
        <Button variant={variant} size={size} onClick={() => setClosing(true)}>
          Cerrar campaña…
        </Button>
      )}
      {error && (
        <div className="max-w-xs basis-full whitespace-normal">
          <Notice kind="error" compact>
            {error}
          </Notice>
        </div>
      )}
      {editing && <CampaignFormDialog campaign={campaign} onClose={() => setEditing(false)} onDone={done} />}
      {closing && (
        <ConfirmDialog
          title={`Cerrar «${campaign.name}»`}
          confirmLabel="Cerrar campaña"
          reason={{ label: 'Motivo o notas', required: false, help: 'Opcional.', maxLength: 500 }}
          busy={closeBusy}
          error={closeError}
          onConfirm={(notes) => void close(notes)}
          onCancel={() => {
            setClosing(false);
            setCloseError(null);
          }}
        >
          <Notice kind="warn">
            Cerrar no es sellar, y una campaña cerrada no se puede reabrir. Al cerrarla se bloquean las operaciones normales asociadas a este periodo.
          </Notice>
        </ConfirmDialog>
      )}
    </>
  );
}

/** Lámina 28: la campaña activa en una tarjeta oscura (lámina 41 en teléfono). */
export function ActiveCampaignCard({ campaign, sealedVersion, onChanged }: { campaign: Campaign; sealedVersion: number | null; onChanged: (text: string) => Promise<void> }) {
  return (
    <div className="ui-on-ink rounded-hero bg-ink px-5 py-6 text-white sm:px-8" data-testid="active-campaign">
      <div className="flex flex-col gap-5" data-testid={`campaign-row-${campaign.name}`}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip status={campaign.status} />
            {campaign.isActive && <Chip tone="on-dark">Campaña activa</Chip>}
            <SealChip version={sealedVersion} />
          </div>
          <p className="mt-3 font-display text-3xl font-extrabold leading-tight text-white [overflow-wrap:anywhere] sm:text-4xl">{campaign.name}</p>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-5 border-t border-ink-line pt-5">
          <dl className="grid grid-cols-2 gap-x-10 gap-y-3 sm:grid-cols-3">
            <div>
              <dt className="text-sm text-on-ink-muted">Empezó</dt>
              <dd className="font-display text-xl font-bold tabular-nums text-white">{fmtCampaignDay(campaign.startDate) ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-sm text-on-ink-muted">Fin estimado</dt>
              <dd className="font-display text-xl font-bold tabular-nums text-white" data-testid="estimated-end">
                {fmtCampaignDay(campaign.estimatedEndDate) ?? 'Sin fecha estimada'}
                {isEstimatedEndOverdue(campaign) && <OverdueNote onDark />}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-on-ink-muted">Cierre</dt>
              <dd className="font-display text-xl font-bold text-white" data-testid="closed-at">
                {campaign.closedAt ? `Cerrada el ${fmtDateTime(campaign.closedAt)}` : 'Sin cierre registrado'}
              </dd>
            </div>
          </dl>
          <div className="flex flex-wrap items-center gap-2">
            <CampaignActions campaign={campaign} onChanged={onChanged} onDark />
            <Link to={campaignDetailPath(campaign.id)} className={buttonClassFor('accent')} aria-label={`Ver detalle de ${campaign.name}`}>
              Ver detalle
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CampaignRow({ campaign, sealedVersion, onChanged }: { campaign: Campaign; sealedVersion: number | null; onChanged: (text: string) => Promise<void> }) {
  return (
    <li className="relative flex min-w-0 flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4 hover:bg-canvas sm:px-7" data-testid={`campaign-row-${campaign.name}`}>
      <div className="min-w-0 flex-1 basis-56">
        <p className="text-lg font-semibold text-ink [overflow-wrap:anywhere]">{campaign.name}</p>
        <p className="text-sm tabular-nums text-ink-muted">
          <span data-testid="estimated-end">
            {fmtCampaignDay(campaign.startDate) ?? '—'} – {fmtCampaignDay(campaign.estimatedEndDate) ?? 'Sin fecha estimada'}
          </span>
          <span className="sr-only"> (inicio y fin estimado)</span>
          {' · '}
          <span data-testid="closed-at">{campaign.closedAt ? `Cerrada el ${fmtDateTime(campaign.closedAt)}` : 'Sin cierre registrado'}</span>
        </p>
        {isEstimatedEndOverdue(campaign) && <OverdueNote />}
        {campaign.notes && <p className="mt-0.5 line-clamp-2 text-xs text-ink-muted [overflow-wrap:anywhere]">{campaign.notes}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip status={campaign.status} />
        {campaign.isActive && <Chip tone="dark">Campaña activa</Chip>}
        <SealChip version={sealedVersion} />
      </div>
      <div className="relative z-[1] flex flex-wrap items-center gap-2">
        <CampaignActions campaign={campaign} onChanged={onChanged} />
      </div>
      <Link
        to={campaignDetailPath(campaign.id)}
        aria-label={`Ver detalle de ${campaign.name}`}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink after:absolute after:inset-0 after:content-[''] hover:bg-sunken focus-visible:outline-2"
      >
        <Icon d={ICON.chevronRight} className="h-5 w-5" />
      </Link>
    </li>
  );
}
