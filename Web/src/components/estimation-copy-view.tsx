import { fmtDateTime } from '../lib/collective-text';
import type { StoredCopy } from '../lib/estimation-copy';
import { REASON_TEXT, RESULT_STATUS_TEXT } from '../lib/estimation-text';
import { Figure, ValidityBadge } from './estimation-figure';

const ROLE_TEXT: Record<string, string> = { DIRECTIVA: 'Directiva', ADMINISTRADOR: 'Administrador', AGRICULTOR: 'Agricultor' };

const dateOnly = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('es-BO', { timeZone: 'UTC' }) : 'sin fecha de fin');

/**
 * F12-EST-07-WEB (#180): la copia descargada, tal como la entregó el servidor.
 * Siempre con su fecha de generación, su fecha de descarga, el período, la
 * vigencia que tenía al descargarse y el aviso de posible desactualización.
 * Nada de esto se recalcula ni se actualiza sin conexión.
 */
export function EstimationCopyView({ copy }: { copy: StoredCopy }) {
  const { download, owner } = copy;
  return (
    <section className="glass-card overflow-hidden" aria-label="Copia descargada" data-testid={`copy-${download.target.campaign_ref}`}>
      <div className="space-y-1 border-b border-slate-100 px-5 py-4">
        <h2 className="text-base font-bold text-slate-900">Copia descargada: {download.target.name}</h2>
        <p className="text-xs text-slate-600" data-testid="copy-period">
          Período objetivo: {download.target.name}, desde {dateOnly(download.target.start_date)} hasta {dateOnly(download.target.end_date)}
          {download.season ? ` · Temporada ${download.season.key}: ${download.season.definition}` : ' · Sin temporada'}
        </p>
        <p className="text-xs text-slate-600" data-testid="copy-downloaded">
          Descargada el {fmtDateTime(download.downloaded_at)} (hora del servidor) por {owner.name} ({ROLE_TEXT[owner.role] ?? owner.role}),{' '}
          {owner.tenantName}.
        </p>
      </div>
      <div className="border-b border-amber-100 bg-amber-50 px-5 py-3 text-xs text-amber-900" data-testid="copy-outdated">
        <strong>Puede estar desactualizada.</strong> Sin conexión no se conocen revocaciones de permiso, cambios de política ni cambios
        de las cifras publicadas. La vigencia que se muestra es la que tenía al descargarse; la vigencia actual es desconocida hasta
        volver a consultar con conexión.
      </div>
      <p className="px-5 pt-3 text-xs text-slate-500">{download.notice}</p>
      {download.results.length === 0 ? (
        <p className="px-5 py-4 text-sm text-slate-600" data-testid="copy-empty">
          Al descargarla no había ninguna estimación para esta campaña. No se muestra ninguna cifra.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3">Resultado</th>
                <th className="px-4 py-3">Estimación SES</th>
                <th className="px-4 py-3">Línea base naive</th>
                <th className="px-4 py-3">Generada el</th>
                <th className="px-4 py-3">Vigencia al descargar</th>
                <th className="px-4 py-3">Vigencia actual</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {download.results.map((result) => (
                <tr key={`${result.product.product_ref}|${result.base_unit}`} data-testid={`copy-result-${result.product.name}`}>
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {result.product.name}
                    <span className="block text-[11px] text-slate-500">{result.presentation_unit}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-slate-800">{RESULT_STATUS_TEXT[result.status]}</span>
                    {result.reason_code && <p className="text-[11px] text-slate-500" data-testid="copy-reason">{REASON_TEXT[result.reason_code]}</p>}
                  </td>
                  <td className="px-4 py-3" data-testid="copy-estimate">
                    <Figure value={result.estimate_base} unit={result.base_unit} kind="estimate" status={result.status} validityReason={result.validity_reason} />
                  </td>
                  <td className="px-4 py-3" data-testid="copy-naive">
                    <Figure value={result.naive_base} unit={result.base_unit} kind="naive" status={result.status} validityReason={result.validity_reason} />
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600" data-testid="copy-generated">{fmtDateTime(result.generated_at)}</td>
                  <td className="px-4 py-3" data-testid="copy-validity">
                    <ValidityBadge validity={result.validity_at_download} reason={result.validity_reason} />
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500" data-testid="copy-current">Desconocida sin conexión</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="border-t border-slate-100 px-5 py-3 text-[11px] text-slate-500" data-testid="copy-format">
        Formato de la copia v{copy.format_version} (INT-09 v{download.contract_version}). Queda sólo en este navegador, fuera del respaldo
        privado. Deja de poder leerse al cerrar la sesión, al entrar con otra identidad o ante un rechazo del servidor, y después se borra (si el borrado falla, se reintenta). No es el Excel de la consulta.
      </p>
    </section>
  );
}
