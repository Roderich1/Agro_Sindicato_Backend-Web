import { Button, Dialog, labelClass, Notice, SegmentedControl, TextInput } from '../components/ui';
import {
  callProductsLimitMessage,
  CREATE_AS_DRAFT_NOTE,
  DEADLINE_HELP,
} from '../lib/joint-purchase-call-text';
import type { JointPurchaseCallDetail } from '../types/joint-purchase-calls';
import { CatalogPicker, FieldError, ProposalPicker } from './joint-purchase-calls/call-form-pickers';
import { ClosedCallReference } from './joint-purchase-calls/closed-call-reference';
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

  return (
    <Dialog
      title={form.editing ? 'Editar la convocatoria' : 'Nueva convocatoria'}
      onClose={onClose}
      dirty={form.dirty}
      busy={form.busy}
      size="lg"
      fullScreenOnPhone
      testId="call-form"
      footer={
          <>
            <Button variant="secondary" onClick={onClose} disabled={form.busy}>
              Cancelar
            </Button>
            <Button onClick={() => void form.submit()} busy={form.busy}>
              {form.editing ? 'Guardar cambios' : 'Crear borrador'}
            </Button>
          </>
      }
    >
      <div className="space-y-5">
        <p className="text-base text-ink-muted">
          Campaña: <strong className="font-semibold text-ink">{campaignName}</strong>
        </p>
        {form.serverError && <Notice kind="error">{form.serverError}</Notice>}
        {form.prepared && (
          <Notice kind="info" compact>
            <span data-testid="prepared-notice">
              Preparada desde un borrador de compra. Revise los productos, el nombre y la fecha límite antes de crear el borrador.
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
          {form.overLimit && (
            <Notice kind="warn" compact>
              <span data-testid="call-products-limit">{callProductsLimitMessage(form.selectedProductRefs.length)}</span>
            </Notice>
          )}
          <FieldError id="call-products-error" text={form.overLimit ? undefined : form.errors.products} />
          <ClosedCallReference
            campaignId={campaignId}
            productRefs={form.overLimit ? [] : form.selectedProductRefs}
            excludeCallId={call?.call_id}
            showDeclaredNeed={form.source === 'catalog'}
          />
        </fieldset>
        {!form.editing && <p className="text-sm text-ink-muted">{CREATE_AS_DRAFT_NOTE}</p>}
      </div>
    </Dialog>
  );
}
