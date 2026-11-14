/**
 * Exportaciones de las vistas colectivas (defensa, 2026-11-05).
 *
 * «Descargar Excel» entrega un libro con la identidad de Agrocuentas (portada,
 * hojas de datos con encabezados filtrables, estados en color y cifras
 * destacadas) construido en el navegador a partir de las mismas respuestas del
 * servidor que muestra la pantalla: ninguna cifra se calcula ni se suma aquí y
 * una ausencia nunca se escribe como cero.
 *
 * Excel es la única exportación para el usuario (decisión del autor,
 * 2026-11-12): los CSV se retiraron y sus columnas quedaron en estos libros
 * (`docs/architecture/WEB_EXCEL_UNICO_2026-11-12.md`).
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
 * (tendencias). Cada exportación repite, al pulsar, los mismos `GET` que la
 * pantalla con la sesión del usuario: el servidor vuelve a aplicar permisos y
 * política, y nada se toma de lo que la pantalla tenga en memoria.
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
