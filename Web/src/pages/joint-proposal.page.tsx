import type { ReactNode } from 'react';
import { AppShell } from '../components/app-shell';
import { ExportButtons } from '../components/export-buttons';
import { Button, CampaignPill, Card, DataState, Notice, PageHeader, Tabs } from '../components/ui';
import { fmtDateTime } from '../lib/collective-text';
import type { Proposal } from '../types/collective';
import { fmtCount, type ProposalTab } from './joint-proposal/joint-proposal.types';
import { HowCalculated } from './joint-proposal/proposal-calculation-tab';
import { ProposalDetail } from './joint-proposal/proposal-detail-table';
import { HistoryList } from './joint-proposal/proposal-history-list';
import { useJointProposal } from './joint-proposal/use-joint-proposal';

/**
 * F07-JP-01/02 (#26, #27): borrador de propuesta de compra conjunta desde la
 * necesidad declarada que el servidor publicó. No crea compras, lotes,
 * movimientos, deudas ni pagos, y no calcula cantidades en el navegador.
 *
 * Rediseño v2 (láminas 06, 07, 08, 36 y 51): «Borrador de compra» con tres
 * pestañas (Borrador actual · Borradores anteriores (N) · Cómo se calculó),
 * franja de la referencia con sus estados (05 §12), tabla Llevar · Producto ·
 * Necesidad declarada · Consumo estimado y barra «Preparar convocatoria →».
 */
export function JointProposalPage() {
  const vm = useJointProposal();
  const tabs: { value: ProposalTab; label: ReactNode; count?: number }[] = [
    { value: 'actual', label: vm.shownIsLatest || vm.history.length === 0 ? 'Borrador actual' : 'Borrador anterior' },
    {
      value: 'anteriores',
      label: (
        <>
          <span className="sm:hidden">Anteriores</span>
          <span className="hidden sm:inline">Borradores anteriores</span>
        </>
      ),
      count: vm.history.length,
    },
    { value: 'calculo', label: 'Cómo se calculó' },
  ];

  return (
    <AppShell title="Necesidades y propuestas" section="Colectivo">
      <div className="space-y-5">
        <PageHeader
          eyebrow={
            <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span>Necesidades y propuestas</span>
              <CampaignPill campaigns={vm.campaigns} selected={vm.selected} onSelect={vm.chooseCampaign} />
            </span>
          }
          title="Borrador de compra"
          subtitle={vm.proposal ? <GeneratedLine proposal={vm.proposal} /> : 'Seleccione una campaña para consultar o generar un borrador.'}
          testId="proposal-header"
        />
        <div className="flex flex-wrap items-center gap-3">
          {vm.proposal && <ExportButtons kind="proposal" reference={vm.proposal.proposal_ref} shortLabel />}
          <Button variant={vm.proposal ? 'secondary' : 'primary'} onClick={() => void vm.generate()} disabled={!vm.selected || vm.busy} busy={vm.busy}>
            {vm.busy ? 'Trabajando…' : vm.proposal ? 'Generar borrador nuevo' : 'Generar borrador'}
          </Button>
        </div>
        {vm.campaignsError && <DataState state="error" description={vm.campaignsError} onRetry={() => void vm.refreshCampaigns()} testId="campaigns-list-error" />}
        {vm.problem && (
          <Card>
            <DataState
              state={vm.problem.kind}
              title={vm.problem.kind === 'error' ? 'No fue posible completar la consulta' : undefined}
              description={vm.problem.message}
              onRetry={vm.problem.retry ? vm.retry : undefined}
              testId="proposal-problem"
            />
          </Card>
        )}
        {vm.draftNotice && (
          <Notice kind="info" compact>
            {vm.draftNotice}
          </Notice>
        )}
        {vm.proposal || vm.history.length > 0 ? (
          <>
            <Tabs label="Borrador de compra" idBase="borrador" variant="pill" tabs={tabs} value={vm.tab} onChange={vm.setTab} testId="proposal-tabs" />
            <ProposalTabPanel value="actual" active={vm.tab === 'actual'}>
              {vm.proposal ? (
                <ProposalDetail
                  proposal={vm.proposal}
                  latest={vm.shownIsLatest}
                  onShowLatest={vm.latestRef && !vm.shownIsLatest ? () => void vm.openDraft(vm.latestRef!) : undefined}
                  link={vm.link}
                  linkFeedback={vm.linkFeedback}
                  acting={vm.acting}
                  onAct={(intent) => void vm.actOnLink(intent)}
                  onRetryLink={() => void vm.loadLink(vm.proposal!.proposal_ref, vm.context)}
                  selection={vm.selection}
                  selectionFeedback={vm.selectionFeedback}
                  saving={vm.saving}
                  onToggle={vm.toggleProduct}
                  onSave={() => void vm.saveSelection()}
                  onRetrySelection={() => void vm.loadSelection(vm.proposal!.proposal_ref, vm.context)}
                  onPrepareCall={vm.prepareCall}
                />
              ) : (
                <Card>
                  <DataState
                    state={vm.busy || vm.loadingHistory ? 'loading' : 'empty'}
                    title={vm.busy || vm.loadingHistory ? 'Cargando el borrador…' : 'Elija un borrador'}
                    description={vm.busy || vm.loadingHistory ? undefined : 'Abra uno en «Borradores anteriores».'}
                  />
                </Card>
              )}
            </ProposalTabPanel>
            <ProposalTabPanel value="anteriores" active={vm.tab === 'anteriores'}>
              <HistoryList history={vm.history} current={vm.proposal} onOpen={(id) => void vm.openDraft(id)} busy={vm.busy} />
            </ProposalTabPanel>
            <ProposalTabPanel value="calculo" active={vm.tab === 'calculo'}>
              {vm.proposal ? (
                <HowCalculated
                  proposal={vm.proposal}
                  link={vm.link}
                  view={vm.view}
                  campaignName={vm.shownCampaign?.name ?? vm.proposal.campaign.name}
                  onRetry={() => void vm.loadLink(vm.proposal!.proposal_ref, vm.context)}
                />
              ) : (
                <Card>
                  <DataState state="empty" title="Sin borrador abierto" description="Abra un borrador para ver cómo se calculó su consumo estimado." />
                </Card>
              )}
            </ProposalTabPanel>
          </>
        ) : vm.loadingHistory ? (
          <Card>
            <DataState state="loading" title="Cargando…" description="Cargando los borradores de la campaña…" skeletonRows={3} />
          </Card>
        ) : (
          vm.selected &&
          !vm.problem && (
            <Card>
              <DataState
                state="empty"
                title="Todavía no hay borradores para esta campaña"
                description="Genere el primero con «Generar borrador». Sin borrador no hay cifras que revisar: eso no significa cero."
              />
            </Card>
          )
        )}
      </div>
    </AppShell>
  );
}

/** Panel de pestaña que sigue montado aunque no esté activo (oculto con `hidden`). Mismos ids que `Tabs`. */
function ProposalTabPanel({ value, active, children }: { value: ProposalTab; active: boolean; children: ReactNode }) {
  return (
    <div
      role="tabpanel"
      id={`borrador-panel-${value}`}
      aria-labelledby={`borrador-tab-${value}`}
      hidden={!active}
      tabIndex={0}
      className="focus-visible:outline-2 focus-visible:outline-offset-4"
    >
      {children}
    </div>
  );
}

/** «Generado el … por … · al generarlo, N de M agricultores tenían cifras publicadas» (no se reescribe). */
function GeneratedLine({ proposal }: { proposal: Proposal }) {
  const coverage = proposal.coverage;
  return (
    <span>
      Generado el {fmtDateTime(proposal.generated_at)} por {proposal.generated_by.name}
      {coverage && (
        <span data-testid="coverage">
          {' '}
          · al generarlo ({fmtDateTime(proposal.generated_at)}),{' '}
          {coverage.basis === 'ALL_CONTRIBUTORS' ? (
            <>
              {fmtCount(coverage.members_with_contribution)} de {fmtCount(coverage.linked_members)} agricultores vinculados habían aportado datos en esa
              fecha (regla anterior a F10-SEC-02: contaba también filas sin cifra)
            </>
          ) : (
            <>
              {fmtCount(coverage.members_with_contribution)} de {fmtCount(coverage.linked_members)} agricultores vinculados con cifras publicadas en esa
              fecha
            </>
          )}
          . No es la cobertura actual.
        </span>
      )}
    </span>
  );
}
