import { fmtDateTime } from '../lib/collective-text';
import type { StoredCopy } from '../lib/estimation-copy';
import { REASON_TEXT, RESULT_STATUS_TEXT } from '../lib/estimation-text';
import { Figure, ValidityBadge } from './estimation-figure';
import { ICON, Icon } from './ui';

const ROLE_TEXT: Record<string, string> = { DIRECTIVA: 'Directiva', ADMINISTRADOR: 'Administrador', AGRICULTOR: 'Agricultor' };

const dateOnly = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('es-BO', { timeZone: 'UTC' }) : 'sin fecha de fin');

/**
 * F12-EST-07-WEB (#180): la copia descargada, tal como la entregó el servidor.
 * Siempre con su fecha de generación, su fecha de descarga, el período, la
 * vigencia que tenía al descargarse y el aviso de posible desactualización.
 * Nada de esto se recalcula ni se actualiza sin conexión.
 *
 * Rediseño v2 (lámina 27, estado 1): «Estimación guardada», aviso ámbar
 * «Puede estar desactualizada» y la tabla Producto · Consumo estimado · Último
 * publicado · Vigencia; la generación, el resultado y la vigencia actual
 * («desconocida sin conexión») siguen en cada fila.
 */
export function EstimationCopyView({ copy, headingLevel = 2 }: { copy: StoredCopy; headingLevel?: 1 | 2 }) {
  const { download, owner } = copy;
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  return (
    <section className="space-y-5" aria-label="Copia descargada" data-testid={`copy-${download.target.campaign_ref}`}>
      <div className="space-y-2">
        <Heading className="text-3xl font-extrabold leading-[1.1] text-ink sm:text-4xl">Estimación guardada</Heading>
        <p className="text-base text-ink-muted [overflow-wrap:anywhere]" data-testid="copy-downloaded">
          {download.target.name} · guardada el {fmtDateTime(download.downloaded_at)} (hora del servidor) por {owner.name} (
          {ROLE_TEXT[owner.role] ?? owner.role}) · {owner.tenantName}
        </p>
        <p className="text-sm text-ink-muted" data-testid="copy-period">
          Período objetivo: {download.target.name}, desde {dateOnly(download.target.start_date)} hasta {dateOnly(download.target.end_date)}
          {download.season ? ` · Temporada ${download.season.key}: ${download.season.definition}` : ' · Sin temporada'}
        </p>
      </div>
      <div className="flex items-start gap-3 rounded-card bg-warn-bg px-5 py-4 text-base text-warn-ink" data-testid="copy-outdated">
        <Icon d={ICON.warn} className="mt-0.5 h-5 w-5 shrink-0" />
        <p>
          <strong>Puede estar desactualizada.</strong> Sin conexión no se sabe si las cifras, los permisos o la política cambiaron desde que la
          guardó. La vigencia que se muestra es la que tenía al descargarse; la vigencia actual es desconocida hasta volver a consultar con conexión.
        </p>
      </div>
      <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
        <p className="px-5 pt-4 text-sm text-ink-muted sm:px-8">{download.notice}</p>
        {download.results.length === 0 ? (
          <p className="px-5 py-5 text-base text-ink-muted sm:px-8" data-testid="copy-empty">
            Al descargarla no había ninguna estimación para esta campaña. No se muestra ninguna cifra.
          </p>
        ) : (
          <div className="ui-table-scroll mt-2 rounded-none border-0 shadow-none" tabIndex={0} role="region" aria-label="Productos de la copia">
            <table className="ui-table min-w-[40rem]">
              <caption className="sr-only">Productos de la copia</caption>
              <thead>
                <tr>
                  <th className="pl-5 sm:pl-8">Producto</th>
                  <th className="text-right">Consumo estimado</th>
                  <th className="text-right">Último publicado</th>
                  <th className="pr-5 sm:pr-8">Vigencia</th>
                </tr>
              </thead>
              <tbody>
                {download.results.map((result) => (
                  <tr key={`${result.product.product_ref}|${result.base_unit}`} data-testid={`copy-result-${result.product.name}`}>
                    <td className="pl-5 sm:pl-8">
                      <p className="text-base font-semibold text-ink [overflow-wrap:anywhere]">
                        {result.product.name} <span className="text-sm font-normal text-ink-muted">{result.presentation_unit}</span>
                      </p>
                      <p className="text-sm text-ink-muted">
                        {RESULT_STATUS_TEXT[result.status]} · generada el <span data-testid="copy-generated">{fmtDateTime(result.generated_at)}</span>
                      </p>
                      {result.reason_code && (
                        <p className="text-sm text-ink-muted" data-testid="copy-reason">
                          {REASON_TEXT[result.reason_code]}
                        </p>
                      )}
                    </td>
                    <td className="text-right text-xl" data-testid="copy-estimate">
                      <Figure value={result.estimate_base} unit={result.base_unit} kind="estimate" status={result.status} validityReason={result.validity_reason} />
                    </td>
                    <td className="text-right text-base" data-testid="copy-naive">
                      <Figure value={result.naive_base} unit={result.base_unit} kind="naive" status={result.status} validityReason={result.validity_reason} />
                    </td>
                    <td className="pr-5 sm:pr-8">
                      <div data-testid="copy-validity">
                        <ValidityBadge validity={result.validity_at_download} reason={result.validity_reason} />
                      </div>
                      <p className="mt-1 text-sm text-ink-muted">
                        Actual: <span data-testid="copy-current">Desconocida sin conexión</span>
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-sm leading-relaxed text-ink-muted" data-testid="copy-format">
        Solo la ve la persona que la guardó, con su mismo sindicato y rol, mientras su sesión siga abierta en este navegador. Para generar,
        actualizar o exportar hace falta conexión. Formato de la copia v{copy.format_version} (INT-09 v{download.contract_version}). Queda sólo en
        este navegador, fuera del respaldo privado. Deja de poder leerse al cerrar la sesión, al entrar con otra identidad o ante un rechazo del
        servidor, y después se borra (si el borrado falla, se reintenta). No es el Excel de la consulta.
      </p>
    </section>
  );
}
