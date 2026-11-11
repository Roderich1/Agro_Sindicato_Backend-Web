import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { buttonClass, CampaignSelector, DataState, DataTable, PageHeader, Section, StatusChip } from '../../../components/ui';
import { fmtDateTime } from '../../../lib/collective-text';
import { coverageLink, coverageText, needGroups, pendingActions, plural, publishedCount, UNIT_LABEL } from './model';
import type { VariantProps } from './variant-props';

/**
 * Variante «Operativa compacta» — eje: densidad y acción. Todo lo que la
 * Directiva decide cabe en una pantalla de 1366×768 sin desplazarse: campaña y
 * estado, una franja de indicadores pequeños (con la cobertura), una tabla
 * densa por producto y unidad con la cifra exacta y, a la derecha, lo
 * pendiente según los datos.
 */
export function OperativaCompacta({ campaigns, selected, onSelect, summary }: VariantProps) {
  const campaign = campaigns.find((entry) => entry.id === selected) ?? null;
  const draftLink = summary ? pendingActions(summary, campaign).find((action) => action.key === 'draft')?.link : undefined;
  return (
    <div className="space-y-3" data-variant="operativa-compacta">
      <PageHeader
        title="Resumen"
        campaign={<CampaignSelector campaigns={campaigns} selected={selected} onSelect={onSelect} />}
        actions={
          draftLink ? (
            <Link to={draftLink.to} className={buttonClass}>
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
      <dl className="grid gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-3" data-testid="kpi-strip">
        <Stat label="Necesidades con cifra publicada">
          {counts.total === 0 ? 'Ninguna declarada' : `${counts.published} de ${plural(counts.total, 'producto', 'productos')}`}
        </Stat>
        <Stat
          label="Cobertura"
          testId="coverage"
          note={
            summary.coverage && (
              <>
                agricultores vinculados con cifras publicadas.{summary.coverage.suppressed_cells && ' Hay filas sin cifra cuyos aportes no se cuentan.'} Ausencia de
                aporte = desconocido, no cero.{' '}
                <Link to={coverageLink(summary)} className="font-semibold text-brand-800 underline underline-offset-2">
                  Ver cobertura
                </Link>
              </>
            )
          }
        >
          {coverage ? (
            <>
              {coverage.ratio}
              {coverage.percent && <span className="ml-1 text-sm font-medium text-slate-600">({coverage.percent})</span>}
            </>
          ) : (
            'No disponible'
          )}
        </Stat>
        <Stat label="Versión sellada" note={summary.seal ? `Sellada el ${fmtDateTime(summary.seal.sealed_at)}` : undefined}>
          {summary.seal ? `Versión ${summary.seal.version}` : 'Sin sellar'}
        </Stat>
      </dl>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <Section title="Necesidades declaradas por producto" note="Lo que cada agricultor declaró que necesita; no es pronóstico, consumo ni compra. Litros y kilogramos van por separado.">
          {groups.length === 0 ? (
            <div className="px-5 py-3">
              <DataState state="empty" compact description="Ningún agricultor publicó una necesidad declarada en esta campaña. Eso no significa cero." />
            </div>
          ) : (
            <div className="[&_tbody_td]:py-1.5 [&_tbody_th]:py-1.5 [&_thead_th]:py-2">
              <DataTable caption="Necesidades declaradas por producto">
                <thead>
                  <tr>
                    <th scope="col">Producto</th>
                    <th scope="col" className="ui-num">
                      Necesidad declarada
                    </th>
                    <th scope="col" className="ui-num">
                      Aportantes
                    </th>
                    <th scope="col">Datos hasta</th>
                  </tr>
                </thead>
                {groups.map((group) => (
                  <tbody key={group.unit}>
                    <tr>
                      <th scope="colgroup" colSpan={4} className="bg-slate-50 text-xs font-semibold text-slate-600">
                        {UNIT_LABEL[group.unit]}
                      </th>
                    </tr>
                    {group.rows.map((row) => (
                      <tr key={row.key} data-testid={row.testId}>
                        <th scope="row" className="font-medium text-ink">
                          <span className="break-words">{row.name}</span>
                          {row.status !== 'DISCLOSED' && (
                            <span className="ml-2 inline-block align-middle">
                              <StatusChip status={row.status} threshold={summary.disclosure.threshold} />
                            </span>
                          )}
                        </th>
                        {row.status === 'DISCLOSED' ? (
                          <>
                            <td className="ui-num">
                              {row.invalid ? (
                                <span className="text-xs font-semibold text-red-800">Dato no válido recibido; no se muestra.</span>
                              ) : (
                                <span className="font-semibold text-ink">{row.text}</span>
                              )}
                              {row.pending && <span className="block text-xs font-medium text-amber-900">Cambios pendientes: cifra anterior</span>}
                            </td>
                            <td className="ui-num text-slate-700">{row.contributors}</td>
                            <td className="text-xs text-slate-600">{fmtDateTime(row.asOf)}</td>
                          </>
                        ) : (
                          <td colSpan={3} className="text-xs leading-snug text-slate-600">
                            {row.reason}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                ))}
              </DataTable>
            </div>
          )}
        </Section>

        <Section title="Pendiente" note="Sólo lo que se desprende de los datos recibidos.">
          {actions.length === 0 ? (
            <p className="px-5 py-3 text-sm text-slate-600">Nada pendiente según estos datos.</p>
          ) : (
            <ul className="divide-y divide-slate-100" data-testid="pending-actions">
              {actions.map((action) => (
                <li key={action.key} className="px-5 py-2.5 text-sm leading-snug">
                  <p className="text-ink">{action.text}</p>
                  <p className="mt-0.5 text-xs text-slate-600">
                    Fuente: {action.source}
                    {action.link && (
                      <>
                        {' · '}
                        <Link to={action.link.to} className="font-semibold text-brand-800 underline underline-offset-2">
                          {action.link.label}
                        </Link>
                      </>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}

function Stat({ label, children, note, testId }: { label: string; children: ReactNode; note?: ReactNode; testId?: string }) {
  return (
    <div className="bg-surface px-4 py-2.5" data-testid={testId}>
      <dt className="text-xs font-semibold text-slate-600">{label}</dt>
      <dd className="mt-0.5 text-lg font-bold tabular-nums text-ink">{children}</dd>
      {note && <dd className="mt-0.5 text-xs leading-snug text-slate-600">{note}</dd>}
    </div>
  );
}
