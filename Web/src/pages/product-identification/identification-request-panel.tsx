import { useCallback, useEffect, useState } from 'react';
import { Facts, Overline } from '../../components/c/bits';
import { Button, Icon, ICON, Notice, RadioCards } from '../../components/ui';
import { collectiveError, fmtDateTime } from '../../lib/collective-text';
import { identificationError, PRODUCT_NAME_TAKEN_TEXT } from '../../lib/identification-text';
import { normalizeName } from '../../lib/product-text';
import { collectiveService } from '../../services/collective.service';
import { identificationService } from '../../services/identification.service';
import type { CatalogEntry } from '../../types/collective';
import type { IdentificationCandidate, IdentificationRequest } from '../../types/identification';
import { CHOICES, photoText, unitWord, type Choice } from './identification.constants';
import { History, PendingNote, PhotoDialog } from './identification-list';
import { LinkPanel } from './identification-link-panel';
import { CreatePanel, DeferPanel } from './identification-secondary-panels';

/** Panel de una solicitud pendiente (láminas 23 y 47). */
export function RequestPanel({ request, onDone }: { request: IdentificationRequest; onDone: (text: string) => void }) {
  const [choice, setChoice] = useState<Choice>('link');
  const [target, setTarget] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [showPhoto, setShowPhoto] = useState(false);
  const [candidates, setCandidates] = useState<IdentificationCandidate[] | null>(null);
  const [candidatesError, setCandidatesError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<CatalogEntry[] | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const loadCandidates = useCallback(async () => {
    try {
      setCandidates(await identificationService.candidates(request.id));
      setCandidatesError(null);
    } catch (err) {
      setCandidatesError(identificationError(err, 'No fue posible cargar las sugerencias.'));
    }
  }, [request.id]);
  const loadCatalog = useCallback(async () => {
    try {
      const entries = await collectiveService.catalog();
      setCatalog(entries);
      setCatalogError(null);
      return entries;
    } catch (err) {
      setCatalogError(collectiveError(err, 'No fue posible cargar el catálogo.'));
      return null;
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => Promise.all([loadCandidates(), loadCatalog()]));
  }, [loadCandidates, loadCatalog]);

  const switchChoice = (next: Choice) => {
    setChoice(next);
    setActionError(null);
  };

  /** 409 `PRODUCT_NAME_TAKEN`: se pasa a «Ya está en el catálogo», con el producto existente elegido si es vinculable. */
  const nameTaken = async (name: string) => {
    setChoice('link');
    setActionError(PRODUCT_NAME_TAKEN_TEXT);
    const entries = await loadCatalog();
    const existing = entries?.find((entry) => normalizeName(entry.product_name) === normalizeName(name));
    if (existing && existing.is_active && existing.base_unit === request.base_unit) setTarget(existing.product_ref);
  };

  const sameDimension = (catalog ?? []).filter((entry) => entry.base_unit === request.base_unit && entry.is_active);
  const targetName =
    candidates?.find((candidate) => candidate.product_ref === target)?.product_name ?? catalog?.find((entry) => entry.product_ref === target)?.product_name ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <Overline as="p">El agricultor lo llamó</Overline>
          <h2 className="mt-1 font-display text-3xl font-extrabold leading-tight text-ink [overflow-wrap:anywhere] sm:text-4xl">«{request.local_name}»</h2>
          <Facts
            className="mt-4"
            rows={[
              ['Ingrediente activo', request.active_ingredient ?? 'Sin dato'],
              ['Se mide en', unitWord(request.unit)],
              ['Recibido', fmtDateTime(request.received_at)],
              ['Foto', photoText(request)],
            ]}
          />
        </div>
        <PhotoFrame request={request} onOpen={() => setShowPhoto(true)} />
      </div>
      {request.pending_note && <PendingNote note={request.pending_note} />}

      <div className="space-y-5 border-t border-line pt-5">
        <div className="lg:[&_fieldset>div]:grid lg:[&_fieldset>div]:grid-cols-3">
          <RadioCards legend={<span className="font-display text-xl font-bold">¿Qué es este producto?</span>} name={`choice-${request.id}`} options={CHOICES} value={choice} onChange={switchChoice} />
        </div>

        {actionError && <Notice kind="error">{actionError}</Notice>}

        {choice === 'link' && (
          <LinkPanel
            request={request}
            candidates={candidates}
            candidatesError={candidatesError}
            onRetryCandidates={() => void loadCandidates()}
            catalog={sameDimension}
            catalogLoaded={catalog !== null}
            catalogError={catalogError}
            onRetryCatalog={() => void loadCatalog()}
            target={target}
            targetName={targetName}
            onTarget={setTarget}
            onError={setActionError}
            onDone={onDone}
          />
        )}
        {choice === 'create' && (
          <CreatePanel
            request={request}
            catalog={catalog ?? []}
            onUseExisting={(entry) => {
              switchChoice('link');
              setTarget(entry.product_ref);
            }}
            onNameTaken={(name) => void nameTaken(name)}
            onError={setActionError}
            onDone={onDone}
          />
        )}
        {choice === 'defer' && <DeferPanel request={request} onError={setActionError} onDone={onDone} />}
      </div>

      <p className="text-sm text-ink-muted">
        Esta es la identificación del sindicato. El agricultor confirma el vínculo en su aplicación; hasta entonces, su inventario y sus compras no
        cambian. No se muestra quién lo reportó.
      </p>
      <History requestId={request.id} />
      {showPhoto && <PhotoDialog request={request} onClose={() => setShowPhoto(false)} />}
    </div>
  );
}

/** Recuadro de la foto: la imagen no se pide hasta pulsar «Ver la foto» (diálogo 33.5). */
function PhotoFrame({ request, onOpen }: { request: IdentificationRequest; onOpen: () => void }) {
  const stored = request.photo.state === 'STORED';
  return (
    <div className="ui-dashed flex min-h-40 w-full shrink-0 flex-col items-center justify-center gap-3 rounded-card bg-canvas px-5 py-5 text-center xl:w-56">
      <Icon d={ICON.camera} className="h-7 w-7 text-ink-muted" />
      {stored ? (
        <>
          <p className="text-sm text-ink-muted">El agricultor envió una foto de la etiqueta.</p>
          <Button variant="secondary" size="sm" onClick={onOpen}>
            Ver la foto
          </Button>
        </>
      ) : (
        <p className="text-sm text-ink-muted">{request.photo.state === 'REMOVED' ? 'La foto fue retirada.' : 'El agricultor no envió una foto.'}</p>
      )}
    </div>
  );
}
