/**
 * Exportaciones de las vistas colectivas (defensa, 2026-11-05).
 *
 * «Descargar Excel» es la opción principal y «CSV» la secundaria. El módulo de
 * Excel lo entrega la sesión 2: aquí sólo está el punto de enganche. Mientras
 * `excelExport.download` sea `null`, el botón de Excel se muestra deshabilitado
 * con su motivo, y el CSV sigue saliendo del servidor con la misma política de
 * divulgación (ninguna cifra se arma en el navegador).
 *
 * Integración prevista: la sesión 2 asigna `excelExport.download` (o sustituye
 * este módulo) con una función que, dado el tipo de vista y su referencia
 * (campaña, borrador, tipo de tendencia o campaña de estimación), pida el
 * archivo al servidor y lo entregue al navegador. No debe calcular totales.
 */
export type ExcelKind = 'summary' | 'proposal' | 'trends' | 'estimation';

export interface ExcelExport {
  /** `null` hasta que exista el módulo de la sesión 2. */
  download: ((kind: ExcelKind, ref: string) => Promise<void>) | null;
  /** Motivo que se muestra mientras no está disponible. */
  unavailableReason: string;
}

export const excelExport: ExcelExport = {
  download: null,
  unavailableReason: 'Disponible cuando se integre el módulo de exportación a Excel (sesión 2).',
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
