import { useState } from 'react';
import { excelExport, type ExcelKind } from '../lib/exports';
import { buttonClass, secondaryButtonClass } from './app-shell';

/**
 * «Descargar Excel» (principal) y «CSV» (secundaria). El Excel llega con el
 * módulo de la sesión 2 (`lib/exports.ts`); mientras tanto el botón queda
 * deshabilitado con su motivo visible al pasar el ratón.
 */
export function ExportButtons({
  kind,
  reference,
  onCsv,
  csvLabel = 'CSV',
  disabled = false,
}: {
  kind: ExcelKind;
  /** Referencia de lo que se exporta (campaña, borrador, tipo o campaña objetivo). */
  reference: string | null;
  onCsv: () => void;
  csvLabel?: string;
  /** Sin datos o sin conexión: ninguna de las dos descarga. */
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const excel = excelExport.download;
  const excelDisabled = disabled || busy || !excel || !reference;
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="export-buttons">
      <button
        type="button"
        className={buttonClass}
        disabled={excelDisabled}
        title={!excel ? excelExport.unavailableReason : undefined}
        onClick={async () => {
          if (!excel || !reference) return;
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
      <button type="button" className={secondaryButtonClass} onClick={onCsv} disabled={disabled}>
        {csvLabel}
      </button>
    </div>
  );
}
