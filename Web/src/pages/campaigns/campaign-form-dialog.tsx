import { useState, type FormEvent } from 'react';
import { Button, Dialog, ICON, Icon, Notice, Textarea, TextInput } from '../../components/ui';
import { extractError } from '../../lib/format';
import { campaignsService } from '../../services/campaigns.service';
import type { Campaign, CreateCampaignPayload } from '../../types/campaigns';
import { STATUS_FILTER_TEXT } from './campaign.constants';

/** Diálogos 30.1 «Nueva campaña» y 34.3 «Editar campaña». */
export function CampaignFormDialog({
  campaign,
  onClose,
  onDone,
}: {
  campaign: Campaign | null;
  onClose: () => void;
  onDone: (message: string) => Promise<void>;
}) {
  const initial = {
    name: campaign?.name ?? '',
    startDate: campaign?.startDate.slice(0, 10) ?? '',
    estimatedEndDate: campaign?.estimatedEndDate?.slice(0, 10) ?? '',
    notes: campaign?.notes ?? '',
  };
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formId = campaign ? `campaign-form-${campaign.id}` : 'campaign-form-new';
  const dirty = (Object.keys(initial) as (keyof typeof initial)[]).some((key) => form[key] !== initial[key]);
  const ready = form.name.trim().length >= 2 && form.startDate !== '' && !saving;

  const set = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    setSaving(true);
    setError(null);
    const payload: CreateCampaignPayload = {
      name: form.name,
      startDate: form.startDate,
      estimatedEndDate: form.estimatedEndDate || null,
      notes: form.notes || null,
    };
    try {
      if (campaign) {
        await campaignsService.update(campaign.id, payload);
        await onDone('Campaña actualizada.');
      } else {
        await campaignsService.create(payload);
        await onDone('Campaña creada.');
      }
    } catch (err) {
      setError(extractError(err, 'No fue posible guardar la campaña.'));
      setSaving(false);
    }
  };

  return (
    <Dialog
      title={campaign ? `Editar «${campaign.name}»` : 'Nueva campaña'}
      onClose={onClose}
      dirty={dirty}
      busy={saving}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} disabled={!ready} busy={saving}>
            {campaign ? 'Guardar cambios' : 'Crear campaña'}
          </Button>
        </>
      }
    >
      <form id={formId} className="space-y-5" onSubmit={(event) => void submit(event)} noValidate>
        <TextInput
          id="campaign-name"
          label="Nombre"
          required
          maxLength={160}
          value={form.name}
          onChange={(event) => set('name', event.target.value)}
          placeholder="Por ejemplo: Invierno 2027"
          autoComplete="off"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput id="campaign-start" label="Inicio" required type="date" value={form.startDate} onChange={(event) => set('startDate', event.target.value)} />
          <TextInput id="campaign-end" label="Fin estimado" optional type="date" value={form.estimatedEndDate} onChange={(event) => set('estimatedEndDate', event.target.value)} />
        </div>
        <Textarea id="campaign-notes" label="Notas" help="Opcional." maxLength={500} value={form.notes} onChange={(event) => set('notes', event.target.value)} />
        {campaign && (
          <div>
            <p className="mb-1.5 text-sm font-semibold text-ink" id={`${formId}-status`}>
              Estado
            </p>
            <p className="flex min-h-11 items-center gap-2 rounded-field border border-line bg-sunken px-4 py-2.5 text-base text-ink" aria-labelledby={`${formId}-status`}>
              <Icon d={ICON.lock} className="h-4 w-4 shrink-0" />
              {STATUS_FILTER_TEXT[campaign.status] ?? campaign.status}
            </p>
            <p className="mt-1.5 text-xs text-ink-muted">Se cambia con «Cerrar campaña», no desde aquí.</p>
          </div>
        )}
        {error && <Notice kind="error">{error}</Notice>}
      </form>
    </Dialog>
  );
}
