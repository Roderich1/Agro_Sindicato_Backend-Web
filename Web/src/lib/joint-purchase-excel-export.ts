import { collectiveService } from '../services/collective.service';
import { downloadJointPurchaseXlsx, type JointPurchaseXlsx } from './joint-purchase-xlsx';

/**
 * Enganche para «Descargar Excel» del borrador de Compra conjunta: la forma que
 * espera `excelExport.download(kind, ref)` (`lib/exports.ts`, PR #205) para
 * `kind === 'proposal'`, con `ref` = `proposal_ref`.
 *
 * Pide al servidor el borrador y su referencia de consumo (los mismos `GET`
 * que la pantalla, con la misma política), arma el libro y lo descarga. Si la
 * referencia no se puede cargar, el libro sale sin esa hoja y la hoja
 * «Borrador» lo dice; si el borrador no se puede cargar, la promesa se rechaza
 * con el error HTTP original para que la pantalla lo muestre (`collectiveError`).
 */
export async function downloadProposalExcel(proposalRef: string): Promise<JointPurchaseXlsx> {
  const [proposal, reference] = await Promise.all([
    collectiveService.proposal(proposalRef),
    collectiveService.proposalEstimationReference(proposalRef).catch(() => null),
  ]);
  if (proposal.proposal_ref !== proposalRef) throw new Error('El servidor devolvió otro borrador: no se exporta.');
  return downloadJointPurchaseXlsx({ proposal, reference });
}
