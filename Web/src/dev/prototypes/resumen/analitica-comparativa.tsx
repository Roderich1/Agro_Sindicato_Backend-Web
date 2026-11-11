import { Link } from 'react-router-dom';
import { CampaignSelector, DataState, PageHeader, Section, StatusChip, secondaryButtonClass } from '../../../components/ui';
import { fmtDateTime } from '../../../lib/collective-text';
import { coverageLink, coverageText, needGroups, pendingActions, plural, publishedCount, UNIT_LABEL, type NeedRow } from './model';
import type { VariantProps } from './variant-props';

/**
 * Variante «Analítica comparativa» — eje: jerarquía y comparación. Las barras
 * por producto (una escala por unidad) son protagonistas, con cifras grandes;
 * cobertura y sello van como tarjetas arriba; lo pendiente, como lista
 * secundaria al final.
 */
export function AnaliticaComparativa({ campaigns, selected, onSelect, summary }: VariantProps) {
  const campaign = campaigns.find((entry) => entry.id === selected) ?? null;
  const draftLink = summary ? pendingActions(summary, campaign).find((action) => action.key === 'draft')?.link : undefined;
  return (
    <div className="space-y-5" data-variant="analitica-comparativa">
      <PageHeader
        title="Resumen"
        subtitle="Cuánto declaró necesitar cada producto, comparado dentro de su unidad."
        campaign={<CampaignSelector campaigns={campaigns} selected={selected} onSelect={onSelect} />}
        actions={
          draftLink ? (
            <Link to={draftLink.to} className={secondaryButtonClass}>
              {draftLink.label}
            </Link>
          ) : undefined
        }
      />
      {summary ? <Body summary={summary} campaign={campaign} /> : <DataState state="empty" title="Sin datos de prueba" description="Esta campaña no tiene datos en el prototipo. Eso no significa cero." />}
    </div>
  );
}

function Body({ summary, campaign }: { summary: NonNullable<VariantProps['summary']>; campaign: VariantProps['campaigns'][number] | null }) {
  const groups = needGroups(summary);
  const counts = publishedCount(summary);
  const actions = pendingActions(summary, campaign).filter((action) => action.key !== 'draft');
  const coverage = summary.coverage ? coverageText(summary.coverage) : null;
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <article className="rounded-card border border-line bg-surface px-5 py-4 shadow-card" data-testid="coverage">
          <h2 className="text-sm font-semibold text-slate-700">Cobertura</h2>
          {summary.coverage && coverage ? (
            <>
              <p className="mt-1 flex flex-wrap items-baseline gap-x-3 text-ink">
                <span className="text-4xl font-bold leading-tight tabular-nums">{coverage.ratio}</span>
                {coverage.percent && <span className="text-lg font-semibold text-slate-700 tabular-nums">{coverage.percent}</span>}
              </p>
              <p className="mt-1 text-sm text-slate-700">agricultores vinculados con cifras publicadas</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                {summary.coverage.suppressed_cells && 'Hay filas sin cifra cuyos aportes no se cuentan. '}Ausencia de aporte = desconocido, no cero. No es el total del sindicato.
              </p>
              <Link to={coverageLink(summary)} className="mt-2 inline-block text-sm font-semibold text-brand-800 underline underline-offset-2">
                Ver cobertura
              </Link>
            </>
          ) : (
            <p className="mt-1 text-sm text-slate-600">Cobertura no disponible.</p>
          )}
        </article>
        <article className="rounded-card border border-line bg-surface px-5 py-4 shadow-card" data-testid="seal-card">
          <h2 className="text-sm font-semibold text-slate-700">Versión sellada</h2>
          {summary.seal ? (
            <>
              <p className="mt-1 text-4xl font-bold leading-tight text-ink tabular-nums">Versión {summary.seal.version}</p>
              <p className="mt-1 text-sm text-slate-700">
                Sellada el {fmtDateTime(summary.seal.sealed_at)} por {summary.seal.sealed_by.name} · datos aceptados hasta {fmtDateTime(summary.seal.accepted_until)}
              </p>
            </>
          ) : (
            <>
              <p className="mt-1 text-4xl font-bold leading-tight text-ink">Sin sellar</p>
              <p className="mt-1 text-sm text-slate-700">
                <StatusChip status={summary.campaign.status} /> <span className="ml-1">Sólo se sella una campaña cerrada.</span>
              </p>
            </>
          )}
        </article>
      </div>

      <Section
        title="Necesidades declaradas por producto"
        note={
          counts.total === 0
            ? 'Lo que cada agricultor declaró que necesita. No es pronóstico, consumo ni cantidad comprada.'
            : `${counts.published} de ${plural(counts.total, 'producto', 'productos')} con cifra publicada. Cada unidad tiene su propia escala: litros y kilogramos no se comparan entre sí.`
        }
      >
        {groups.length === 0 ? (
          <DataState state="empty" description="Ningún agricultor publicó una necesidad declarada en esta campaña. Eso no significa cero." />
        ) : (
          <div className={`grid divide-y divide-slate-100 ${groups.length > 1 ? '2xl:grid-cols-2 2xl:divide-x 2xl:divide-y-0' : ''}`}>
            {groups.map((group) => (
              <div key={group.unit} className="min-w-0 px-5 py-4">
                <h3 className="text-xs font-semibold text-slate-600">{UNIT_LABEL[group.unit]}</h3>
                <ul className="mt-2 space-y-4" aria-label={`Comparación en ${group.unit}`}>
                  {group.rows.map((row) => (
                    <BarItem key={row.key} row={row} threshold={summary.disclosure.threshold} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Section>

      <section aria-labelledby="pendiente-secundario" className="px-1">
        <h2 id="pendiente-secundario" className="text-sm font-semibold text-slate-700">
          Pendiente según los datos
        </h2>
        {actions.length === 0 ? (
          <p className="mt-1 text-sm text-slate-600">Nada pendiente según estos datos.</p>
        ) : (
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700" data-testid="pending-actions">
            {actions.map((action) => (
              <li key={action.key}>
                {action.text} <span className="text-xs text-slate-600">({action.source})</span>
                {action.link && (
                  <>
                    {' '}
                    <Link to={action.link.to} className="font-semibold text-brand-800 underline underline-offset-2">
                      {action.link.label}
                    </Link>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

/** Una fila: nombre y estado; con cifra publicada, barra en su escala y cifra grande; sin cifra, el motivo (sin barra ni cero). */
function BarItem({ row, threshold }: { row: NeedRow; threshold: number | null }) {
  return (
    <li data-testid={row.testId}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="min-w-0 break-words text-sm font-semibold text-ink">
          {row.name}
          {row.status !== 'DISCLOSED' && (
            <span className="ml-2 align-middle">
              <StatusChip status={row.status} threshold={threshold} />
            </span>
          )}
        </p>
        {row.status === 'DISCLOSED' &&
          (row.invalid ? (
            <span className="text-sm font-semibold text-red-800">Dato no válido recibido; no se muestra.</span>
          ) : (
            <span className="text-2xl font-bold leading-none tabular-nums text-ink">{row.text}</span>
          ))}
      </div>
      {row.status === 'DISCLOSED' ? (
        <>
          {row.share !== null && (
            <div className="mt-2 h-2.5 rounded-full bg-slate-100" aria-hidden="true">
              <div className="h-2.5 rounded-full bg-brand-700" style={{ width: `${row.share}%` }} data-bar />
            </div>
          )}
          <p className="mt-1 text-xs text-slate-600">
            {row.contributors} aportantes · datos hasta {fmtDateTime(row.asOf)}
            {row.pending && <span className="ml-1 font-medium text-amber-900">· Cambios pendientes: se muestra la cifra anterior</span>}
          </p>
        </>
      ) : (
        <p className="mt-1 text-xs leading-snug text-slate-600">{row.reason}</p>
      )}
    </li>
  );
}
