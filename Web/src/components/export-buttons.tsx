import { useState } from 'react';
import { collectiveError } from '../lib/collective-text';
import { excelExport, type ExcelKind } from '../lib/exports';
import { Button, ICON, Icon } from './ui';

/**
 * Exportación de una vista, siempre con peso secundario: la acción primaria de
 * cada pantalla es otra. «Descargar Excel» es la única exportación para el
 * usuario (decisión del autor, 2026-11-12: se retiraron los CSV). El libro se
 * arma con lo que el servidor responde al pulsar, con la misma política de
 * divulgación; si el servidor lo rechaza (permisos, sesión, conexión) no se
 * descarga nada y se dice por qué junto al botón.
 *
 * Rediseño v2: `variant="on-dark"` sobre la cabecera oscura (lámina 03) y
 * `shortLabel` («Excel») en teléfono (láminas 35 y 36); el nombre accesible
 * sigue siendo «Descargar Excel».
 */
export function ExportButtons({
  kind,
  reference,
  disabled = false,
  variant = 'secondary',
  shortLabel = false,
  block = false,
}: {
  kind: ExcelKind;
  /** Referencia de lo que se exporta (campaña, borrador, tipo o campaña objetivo). */
  reference: string | null;
  /** Sin datos o sin conexión: no se descarga. */
  disabled?: boolean;
  variant?: 'secondary' | 'on-dark';
  /** En pantallas estrechas el texto visible es «Excel». */
  shortLabel?: boolean;
  block?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const excel = excelExport.supports(kind) ? excelExport.download : null;
  if (!excel) return null;
  return (
    <div className={`flex flex-wrap items-center gap-2 ${block ? 'w-full' : ''}`} data-testid="export-buttons">
      <Button
        variant={variant}
        block={block}
        icon={<Icon d={ICON.download} className="h-5 w-5" />}
        aria-label={busy ? undefined : 'Descargar Excel'}
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
        {busy ? (
          'Preparando…'
        ) : shortLabel ? (
          <>
            <span className="sm:hidden">Excel</span>
            <span className="hidden sm:inline">Descargar Excel</span>
          </>
        ) : (
          'Descargar Excel'
        )}
      </Button>
      {error && (
        <p className="basis-full rounded-control bg-danger-bg px-3 py-1.5 text-xs font-medium text-danger-ink" role="alert" data-testid="export-error">
          {error}
        </p>
      )}
    </div>
  );
}
