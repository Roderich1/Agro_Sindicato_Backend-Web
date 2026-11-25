import { useCallback, useEffect, useState } from 'react';
import { UnitBadge } from '../../components/c/bits';
import { Button, Chip, Collapsible, DataState, Dialog, Icon, ICON, Notice } from '../../components/ui';
import { fmtDateTime } from '../../lib/collective-text';
import { EVENT_LABEL, identificationError, photoError } from '../../lib/identification-text';
import { identificationService } from '../../services/identification.service';
import type { IdentificationEvent, IdentificationRequest } from '../../types/identification';
import { fmtShort, unitTitle } from './identification.constants';

export function PendingItem({ request, selected, onSelect }: { request: IdentificationRequest; selected: boolean; onSelect: () => void }) {
  const withPhoto = request.photo.state === 'STORED';
  return (
    <li data-testid={`identification-${request.id}`}>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? 'true' : undefined}
        className={`flex w-full min-w-0 items-start gap-4 rounded-[20px] px-4 py-3.5 text-left focus-visible:outline-2 ${selected ? 'ui-on-ink bg-ink text-white' : 'text-ink hover:bg-sunken'}`}
      >
        <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control ${selected ? 'bg-lime text-ink' : 'bg-sunken text-ink'}`}>
          <Icon d={withPhoto ? ICON.camera : ICON.archive} className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold [overflow-wrap:anywhere]">{request.local_name}</span>
          <span className={`block text-sm ${selected ? 'text-on-ink-muted' : 'text-ink-muted'}`}>
            {unitTitle(request.unit)} · {fmtShort(request.received_at)}
            {withPhoto && ' · con foto'}
          </span>
          {request.pending_note && (
            <span className="mt-1.5 block">
              <Chip tone="attention">Falta información</Chip>
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

export function IdentifiedItem({ request, active, onCorrect }: { request: IdentificationRequest; active: boolean; onCorrect: () => void }) {
  const resolution = request.resolution;
  return (
    <li className={`flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4 ${active ? 'bg-lime-soft' : ''}`} data-testid={`identified-${request.id}`}>
      <UnitBadge unit={request.unit} />
      <div className="min-w-0 flex-1 basis-56">
        <p className="text-base font-semibold text-ink [overflow-wrap:anywhere]">«{request.local_name}»</p>
        {resolution ? (
          <p className="text-sm text-ink-muted [overflow-wrap:anywhere]">
            Identificado como <span className="font-semibold text-ink">{resolution.product_name}</span> · {fmtDateTime(resolution.resolved_at)}
            {resolution.kind === 'CREATED_PRODUCT' && ' · Producto colectivo creado'}
            {!resolution.is_active && ' · producto inactivo'}
          </p>
        ) : (
          <p className="text-sm text-ink-muted">Sin datos de la identificación.</p>
        )}
      </div>
      <Button variant={active ? 'primary' : 'secondary'} size="sm" className="ml-auto" onClick={onCorrect} aria-label={`Corregir la identificación de «${request.local_name}»`}>
        Corregir identificación…
      </Button>
    </li>
  );
}

export function PendingNote({ note }: { note: { text: string; at: string } }) {
  return (
    <div data-testid="pending-note">
      <Notice kind="warn" compact>
        Pendiente por falta de información: {note.text} <span className="text-xs">({fmtDateTime(note.at)})</span>
      </Notice>
    </div>
  );
}

/** Historial de la solicitud: quién decidió aparece sólo en decisiones institucionales (H-12); nunca quién reportó. */
export function History({ requestId }: { requestId: string }) {
  const [history, setHistory] = useState<IdentificationEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setHistory(await identificationService.history(requestId));
      setError(null);
    } catch (err) {
      setError(identificationError(err, 'No fue posible cargar el historial.'));
    }
  }, [requestId]);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  return (
    <Collapsible title="Historial" testId="identification-history">
      {error ? (
        <DataState compact state="error" description={error} onRetry={() => void load()} />
      ) : !history ? (
        <DataState compact state="loading" />
      ) : history.length === 0 ? (
        <DataState compact state="empty" title="Sin eventos" description="El servidor no registra eventos para esta solicitud." />
      ) : (
        <ol className="divide-y divide-line" aria-label="Historial de la solicitud">
          {history.map((event, index) => (
            <li key={`${event.at}-${index}`} className="px-5 py-2.5 text-sm" data-testid="history-event">
              <p>
                <span className="font-semibold text-ink">{EVENT_LABEL[event.kind] ?? event.kind}</span>
                <span className="ml-2 text-xs text-ink-muted">{fmtDateTime(event.at)}</span>
                {event.actor && <span className="ml-2 text-xs text-ink-muted">· {event.actor.name}</span>}
              </p>
              {event.product_name && <p className="text-xs text-ink [overflow-wrap:anywhere]">Producto: “{event.product_name}”</p>}
              {event.detail && <p className="text-xs text-ink [overflow-wrap:anywhere]">{event.detail}</p>}
            </li>
          ))}
        </ol>
      )}
    </Collapsible>
  );
}

/** Lámina 33.5: la imagen llega como blob con la sesión; su URL local se crea aquí y se revoca al cerrar. */
export function PhotoDialog({ request, onClose }: { request: IdentificationRequest; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let created: string | null = null;
    identificationService
      .photoBlob(request.id)
      .then((blob) => {
        if (!active) return;
        created = URL.createObjectURL(blob);
        setUrl(created);
      })
      .catch((err: unknown) => {
        if (active) setError(photoError(err));
      });
    return () => {
      active = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [request.id]);

  return (
    <Dialog
      title={request.local_name}
      label={`Foto de «${request.local_name}»`}
      onClose={onClose}
      size="lg"
      hideCloseButton
      footer={<Button onClick={onClose}>Cerrar</Button>}
    >
      <div className="space-y-3">
        {error ? (
          <Notice kind="error">{error}</Notice>
        ) : url ? (
          <img src={url} alt="Foto de la etiqueta reportada" className="max-h-[65dvh] w-full rounded-card border border-line bg-canvas object-contain" />
        ) : (
          <div className="ui-dashed rounded-card bg-canvas">
            <DataState state="loading" compact title="Cargando la foto…" />
          </div>
        )}
        <p className="text-sm leading-relaxed text-ink-muted">
          La envió el agricultor con su consentimiento para ayudar a identificar el producto. La foto se pide al servidor con su sesión y no se guarda en
          este equipo.
        </p>
      </div>
    </Dialog>
  );
}
