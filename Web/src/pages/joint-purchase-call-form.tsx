import { Button, DataState, Dialog, labelClass, Notice, SegmentedControl, Select, TextInput } from '../components/ui';
import {
  CREATE_AS_DRAFT_NOTE,
  DEADLINE_HELP,
  handOverText,
  RESPONSIBLE_NOTICE,
  ROLE_LABEL,
} from '../lib/joint-purchase-call-text';
import type { JointPurchaseCallDetail } from '../types/joint-purchase-calls';
import { CatalogPicker, FieldError, ProposalPicker } from './joint-purchase-calls/call-form-pickers';
import { MAX_NAME, SOURCES, useCallForm } from './joint-purchase-calls/use-call-form';

/**
 * Crear o editar el borrador de una convocatoria (E2 §4.1 `POST` y `PATCH`, sólo en `DRAFT`).
 */
export function JointPurchaseCallForm({
  campaignId,
  campaignName,
  call,
  onClose,
  onSaved,
  onManageForbidden,
  preset,
}: {
  campaignId: string;
  campaignName: string;
  call?: JointPurchaseCallDetail;
  onClose: () => void;
  onSaved: (saved: { id: string | null; text: string }) => void;
  onManageForbidden?: () => void;
  preset?: { proposalId: string; productRefs: readonly string[] };
}) {
  const form = useCallForm({ campaignId, call, preset, onSaved, onManageForbidden });
  const handOver = handOverText(form.responsibleName);

  return (
    <Dialog
      title={form.confirmingHandOver ? 'Antes de guardar: dejará de administrar este borrador' : form.editing ? 'Editar la convocatoria' : 'Nueva convocatoria'}
      onClose={form.confirmingHandOver ? () => form.setConfirmingHandOver(false) : onClose}
      dirty={form.dirty}
      busy={form.busy}
      size="lg"
      hideCloseButton
      fullScreenOnPhone
      testId="call-form"
      footer={
        form.confirmingHandOver ? (
          <>
            <Button variant="secondary" onClick={() => form.setConfirmingHandOver(false)} disabled={form.busy}>
              Volver
            </Button>
            <Button onClick={() => void form.submit(true)} busy={form.busy}>
              Confirmar
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={form.busy}>
              Cancelar
            </Button>
            <Button onClick={() => void form.submit()} busy={form.busy}>
              {form.editing ? 'Guardar cambios' : 'Crear borrador'}
            </Button>
          </>
        )
      }
    >
      {form.confirmingHandOver && (
        <div className="space-y-4" data-testid="handover-warning">
          <Notice kind="warn">
            <p>{handOver.lead}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {handOver.losses.map((loss) => (
                <li key={loss}>{loss}</li>
              ))}
            </ul>
            <p className="mt-2">{handOver.closing}</p>
          </Notice>
        </div>
      )}
      <div className="space-y-5" hidden={form.confirmingHandOver}>
        <p className="text-base text-ink-muted">
          Campaña: <strong className="font-semibold text-ink">{campaignName}</strong>
        </p>
        {form.serverError && <Notice kind="error">{form.serverError}</Notice>}
        {form.prepared && (
          <Notice kind="info" compact>
            <span data-testid="prepared-notice">
              Preparada desde un borrador de compra. Complete el nombre, la fecha límite y el responsable, revise los productos y
              confirme con «Crear borrador». No se crea nada ni se inscribe a nadie hasta entonces.
            </span>
          </Notice>
        )}

        <TextInput
          id="call-name"
          label="Nombre"
          placeholder="Por ejemplo: Herbicidas de invierno"
          value={form.name}
          maxLength={MAX_NAME}
          autoComplete="off"
          onChange={(event) => form.setName(event.target.value)}
          error={form.errors.name}
        />

        <TextInput
          id="call-deadline"
          label="Fecha y hora límite"
          type="datetime-local"
          value={form.deadline}
          onChange={(event) => form.setDeadline(event.target.value)}
          help={DEADLINE_HELP}
          error={form.errors.deadline}
        />

        {form.responsiblesError ? (
          <div>
            <p className={labelClass}>Responsable</p>
            <DataState compact state="error" description={form.responsiblesError} onRetry={() => void form.loadResponsibles()} />
          </div>
        ) : (
          <Select
            id="call-responsible"
            label="Responsable"
            value={form.responsibleId}
            disabled={!form.responsibles}
            onChange={(event) => form.setResponsibleId(event.target.value)}
            error={form.errors.responsible}
            help={<span data-testid="responsible-notice">{RESPONSIBLE_NOTICE}</span>}
          >
            <option value="">{form.responsibles ? 'Seleccione…' : 'Cargando…'}</option>
            {(form.responsibles ?? []).map((user) => (
              <option key={user.user_ref} value={user.user_ref}>
                {user.name}
                {user.user_ref === form.me ? ' (usted)' : ''}
                {ROLE_LABEL[user.role] ? ` · ${ROLE_LABEL[user.role]}` : ''}
              </option>
            ))}
          </Select>
        )}

        <fieldset className="min-w-0 space-y-3" aria-describedby={form.errors.products ? 'call-products-error' : undefined}>
          <legend className={labelClass}>Productos</legend>
          <SegmentedControl label="Origen de los productos" hideLabel options={SOURCES} value={form.source} onChange={form.setSource} testId="call-product-source" />
          {form.source === 'catalog' ? (
            <CatalogPicker selected={form.catalogRefs} onChange={form.setCatalogRefs} />
          ) : (
            <ProposalPicker
              campaignId={campaignId}
              proposalId={form.proposalId}
              onProposalId={form.selectProposalId}
              proposal={form.proposal}
              onProposal={form.showProposal}
              selected={form.positions}
              onChange={form.setPositions}
            />
          )}
          {form.ignored > 0 && form.source === 'proposal' && (
            <Notice kind="warn" compact>
              <span data-testid="prepared-ignored">
                {form.ignored === 1
                  ? '1 producto indicado no es una línea de este borrador de compra y no se preseleccionó.'
                  : `${form.ignored} productos indicados no son líneas de este borrador de compra y no se preseleccionaron.`}
              </span>
            </Notice>
          )}
          <FieldError id="call-products-error" text={form.errors.products} />
        </fieldset>
        {!form.editing && <p className="text-sm text-ink-muted">{CREATE_AS_DRAFT_NOTE}</p>}
      </div>
    </Dialog>
  );
}
