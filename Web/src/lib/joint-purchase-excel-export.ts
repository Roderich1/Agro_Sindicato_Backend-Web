import axios from 'axios';
import { collectiveService } from '../services/collective.service';
import { downloadJointPurchaseXlsx, type JointPurchaseXlsx } from './joint-purchase-xlsx';
import type { EstimationLinkView } from '../types/estimation-link';

/** Un rechazo de permisos o de pertenencia: el libro no se arma (401, 403 o 404 del servidor). */
function deniesAccess(err: unknown): boolean {
  return axios.isAxiosError(err) && [401, 403, 404].includes(err.response?.status ?? 0);
}

/**
 * Enganche para «Descargar Excel» del borrador de Compra conjunta: la forma que
 * espera `excelExport.download(kind, ref)` (`lib/exports.ts`) para
 * `kind === 'proposal'`, con `ref` = `proposal_ref`.
 *
 * Al pulsar el botón pide de nuevo al servidor, con la sesión del usuario, el
 * borrador y su referencia de consumo estimado **fijada** (E3,
 * `GET …/estimation-link`); nada sale de lo que la pantalla tenga en memoria,
 * así que el servidor vuelve a aplicar sus permisos y su política. Un 401, 403
 * o 404 en cualquiera de las dos rechaza la exportación con el error original
 * (la pantalla lo muestra con `collectiveError`) y no se descarga nada. Si la
 * referencia falla por otro motivo, el libro sale sin estimación y la portada
 * lo dice: no se usa otra estimación en su lugar.
 */
export async function downloadProposalExcel(proposalRef: string): Promise<JointPurchaseXlsx> {
  const [proposal, link] = await Promise.all([
    collectiveService.proposal(proposalRef),
    collectiveService.estimationLink(proposalRef).then(
      (view): EstimationLinkView | null => view,
      (err: unknown) => {
        if (deniesAccess(err)) throw err;
        return null;
      },
    ),
  ]);
  if (proposal.proposal_ref !== proposalRef) throw new Error('El servidor devolvió otro borrador: no se exporta.');
  return downloadJointPurchaseXlsx({ proposal, link });
}
