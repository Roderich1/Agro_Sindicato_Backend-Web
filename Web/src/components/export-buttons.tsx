import { useState } from 'react';
import { excelExport, type ExcelKind } from '../lib/exports';
import { secondaryButtonClass } from './app-shell';

/**
 * Exportaciones de una vista, siempre con peso secundario: la acción primaria
 * de cada pantalla es otra. «Descargar Excel» aparece sólo cuando el módulo de
 * exportación (`lib/exports.ts`) está integrado; hasta entonces queda el CSV,
 * que sale del servidor con la misma política de divulgación.
 */
export function ExportButtons({
  kind,
  reference,
  onCsv,
  csvLabel = 'Exportar CSV',
  disabled = false,
}: {
  kind: ExcelKind;
  /** Referencia de lo que se exporta (campaña, borrador, tipo o campaña objetivo). */
  reference: string | null;
  /** Sin `onCsv` (p. ej. el resumen, que no tiene CSV del servidor) sólo se ofrece el Excel. */
  onCsv?: () => void;
  csvLabel?: string;
  /** Sin datos o sin conexión: ninguna de las dos descarga. */
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const excel = excelExport.supports(kind) ? excelExport.download : null;
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="export-buttons">
      {excel && (
        <button
          type="button"
          className={secondaryButtonClass}
          disabled={disabled || busy || !reference}
          onClick={async () => {
            if (!reference) return;
            setBusy(true);
            try {
              await excel(kind, reference);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Preparando…' : 'Descargar Excel'}
        </button>
      )}
      {onCsv && (
        <button type="button" className={secondaryButtonClass} onClick={onCsv} disabled={disabled}>
          {csvLabel}
        </button>
      )}
    </div>
  );
}
