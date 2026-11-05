/**
 * Exportaciones de las vistas colectivas (defensa, 2026-11-05).
 *
 * «Descargar Excel» entrega un libro con la identidad de Agrocuentas (portada,
 * hojas de datos con encabezados filtrables, estados en color y cifras
 * destacadas) construido en el navegador a partir de las mismas respuestas del
 * servidor que muestra la pantalla: ninguna cifra se calcula ni se suma aquí y
 * una ausencia nunca se escribe como cero. «CSV» sigue saliendo del servidor
 * (o de la consulta, en la estimación) sin cambios de formato.
 */
import { downloadSummaryXlsx } from './collective-summary-xlsx';
import { downloadEstimationXlsx } from './estimation-xlsx';
import { downloadProposalExcel } from './joint-purchase-excel-export';
import { downloadTrendsXlsx } from './trends-xlsx';
import { collectiveService } from '../services/collective.service';
import { estimationService } from '../services/estimation.service';
import type { ProjectionType } from '../types/collective';

export type ExcelKind = 'summary' | 'proposal' | 'trends' | 'estimation';

export interface ExcelExport {
  /** `null` si ninguna vista tiene Excel. */
  download: ((kind: ExcelKind, ref: string) => Promise<void>) | null;
  /** Vistas con Excel disponible. */
  supports: (kind: ExcelKind) => boolean;
  /** Motivo que se muestra mientras no está disponible. */
  unavailableReason: string;
}

const PROJECTION_TYPES: ProjectionType[] = ['CONSUMPTION_TOTAL', 'DECLARED_NEED'];

/**
 * `ref` es, según la vista: el id de la campaña (resumen y estimación), el
 * `proposal_ref` del borrador mostrado (propuesta) o el tipo de dato
 * (tendencias). Cada exportación repite los mismos `GET` que la pantalla, con
 * la misma política de divulgación.
 */
export async function downloadExcel(kind: ExcelKind, ref: string): Promise<void> {
  switch (kind) {
    case 'summary': {
      downloadSummaryXlsx({ summary: await collectiveService.summary(ref) });
      return;
    }
    case 'proposal': {
      await downloadProposalExcel(ref);
      return;
    }
    case 'trends': {
      const type = PROJECTION_TYPES.find((t) => t === ref);
      if (!type) throw new Error('Tipo de tendencia no reconocido: no se exporta.');
      downloadTrendsXlsx({ trends: await collectiveService.trends(type), type });
      return;
    }
    case 'estimation': {
      const results = await estimationService.results(ref);
      if (results.profile !== 'INSTITUTIONAL') throw new Error('La respuesta no es del perfil institucional: no se exporta.');
      const ids = [...new Set(results.results.map((r) => r.run_ref))];
      const runs = await Promise.all(ids.map((id) => estimationService.run(id)));
      downloadEstimationXlsx({ results, details: Object.fromEntries(runs.map((run) => [run.run_ref, run])) });
      return;
    }
  }
}

export const excelExport: ExcelExport = {
  download: downloadExcel,
  supports: () => true,
  unavailableReason: 'Exportación a Excel no disponible en esta vista.',
};

/** Entrega un blob como descarga del navegador; revoca la URL después del clic. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revocar después: algunos navegadores leen el blob tras el clic.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
