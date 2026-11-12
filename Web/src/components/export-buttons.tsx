import { useState } from 'react';
import { collectiveError } from '../lib/collective-text';
import { excelExport, type ExcelKind } from '../lib/exports';
import { secondaryButtonClass } from './app-shell';

/**
 * Exportación de una vista, siempre con peso secundario: la acción primaria de
 * cada pantalla es otra. «Descargar Excel» es la única exportación para el
 * usuario (decisión del autor, 2026-11-12: se retiraron los CSV). El libro se
 * arma con lo que el servidor responde al pulsar, con la misma política de
 * divulgación; si el servidor lo rechaza (permisos, sesión, conexión) no se
 * descarga nada y se dice por qué junto al botón.
 */
export function ExportButtons({
  kind,
  reference,
  disabled = false,
}: {
  kind: ExcelKind;
  /** Referencia de lo que se exporta (campaña, borrador, tipo o campaña objetivo). */
  reference: string | null;
  /** Sin datos o sin conexión: no se descarga. */
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const excel = excelExport.supports(kind) ? excelExport.download : null;
  if (!excel) return null;
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="export-buttons">
      <button
        type="button"
        className={secondaryButtonClass}
        disabled={disabled || busy || !reference}
        onClick={async () => {
          if (!reference) return;
          setBusy(true);
          setError(null);
          try {
            await excel(kind, reference);
          } catch (err) {
            const message = collectiveError(err, 'No fue posible preparar el Excel.');
            setError(message === 'POLICY_PENDING' ? 'La política de divulgación no está aprobada: no se exporta ninguna cifra.' : message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Preparando…' : 'Descargar Excel'}
      </button>
      {error && (
        <p className="basis-full text-xs font-medium text-red-700" role="alert" data-testid="export-error">
          {error}
        </p>
      )}
    </div>
  );
}
