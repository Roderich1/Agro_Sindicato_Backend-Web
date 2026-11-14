import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';
import { readXlsx, rowOf } from '../test/xlsx-read';
import { buildEstimationXlsx } from './estimation-xlsx';
import { clearsInstitutionalData, estimationError, formatAlpha, newRequestId } from './estimation-text';
import { decimalToPresentation, formatBaseValue, formatDecimalQuantity } from './quantity';
import type { InstitutionalResults } from '../types/estimation';

const axiosError = (status: number | null, message?: string) =>
  new AxiosError(
    'x',
    'ERR',
    undefined,
    undefined,
    status === null
      ? undefined
      : { status, statusText: '', headers: {}, config: { headers: new AxiosHeaders() }, data: message ? { statusCode: status, message, error: 'x' } : {} },
  );

describe('cantidades decimales de la estimación (EST-D-07)', () => {
  it('desplaza la coma sin redondear ni pasar por Number', () => {
    expect(decimalToPresentation('111000.000000')).toBe('111');
    expect(decimalToPresentation('2400.000000')).toBe('2.4');
    expect(decimalToPresentation('0.292613')).toBe('0.000292613');
    expect(decimalToPresentation('214499999999.450000')).toBe('214499999.99945');
    expect(decimalToPresentation('9007199254740993.000001')).toBe('9007199254740.993000001');
    expect(decimalToPresentation('0')).toBe('0');
  });

  it('rechaza lo que no es un decimal no negativo con hasta 6 decimales', () => {
    for (const bad of ['-1', '1.0000001', '01', '1e3', '', ' 1']) expect(decimalToPresentation(bad)).toBeNull();
    expect(formatDecimalQuantity(null, 'ML')).toBeNull();
  });

  it('presenta en L o KG y conserva la cifra del servidor en unidad base', () => {
    expect(formatDecimalQuantity('111000.000000', 'ML')).toBe('111 L');
    expect(formatDecimalQuantity('2500.500000', 'G')).toBe('2,5005 KG');
    expect(formatBaseValue('111000.000000', 'ML')).toBe('111.000 mL');
    expect(formatBaseValue('116000', 'ML')).toBe('116.000 mL');
    expect(formatBaseValue('0.292613', 'G')).toBe('0,292613 g');
  });
});

describe('errores de INT-09', () => {
  it('distingue conexión, sesión, permiso, política, inexistencia y petición no admisible', () => {
    expect(estimationError(axiosError(null), 'f').kind).toBe('offline');
    // Detrás del proxy (nginx o Vite), una API caída responde 502 o 504: es conexión, no permiso ni cálculo.
    expect(estimationError(axiosError(502), 'f').kind).toBe('offline');
    expect(estimationError(axiosError(504), 'f').kind).toBe('offline');
    expect(estimationError(axiosError(500), 'f').kind).toBe('other');
    expect(estimationError(axiosError(401), 'f').kind).toBe('session');
    expect(estimationError(axiosError(403, 'No tienes permisos para esta acción'), 'f')).toMatchObject({ kind: 'forbidden' });
    expect(estimationError(axiosError(409, 'POLICY_PENDING'), 'f')).toMatchObject({ kind: 'policy' });
    expect(estimationError(axiosError(404, 'TARGET_CAMPAIGN_NOT_FOUND'), 'f')).toMatchObject({ kind: 'not-found', message: expect.stringMatching(/no pertenece a su organización/) });
    expect(estimationError(axiosError(422, 'TARGET_CAMPAIGN_NOT_CLASSIFIED'), 'f')).toMatchObject({ kind: 'invalid', message: expect.stringMatching(/no está clasificada/) });
    expect(estimationError(new Error('x'), 'f')).toEqual({ kind: 'other', message: 'f' });
  });

  it('sólo los que retiran el acceso borran los datos a la vista; la conexión no', () => {
    expect(['session', 'forbidden', 'policy', 'not-found'].every((k) => clearsInstitutionalData(k as never))).toBe(true);
    expect(['offline', 'invalid', 'other'].some((k) => clearsInstitutionalData(k as never))).toBe(false);
  });

  it('el identificador de solicitud es un UUID v4', () => {
    expect(newRequestId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('exportación de la consulta (#179, tercer criterio)', () => {
  const response: InstitutionalResults = {
    contract_version: 1,
    profile: 'INSTITUTIONAL',
    scope: { tenant_ref: 't-1' },
    target: { campaign_ref: 'c-t', name: 'Objetivo, "sintético"', status: 'PLANIFICADA', start_date: '2019-09-01T00:00:00.000Z', end_date: null },
    season: { season_ref: 's-1', key: 'INVIERNO', definition: 'Temporada sintética', duration_days: 180 },
    evaluated_at: '2026-11-02T15:00:00.000Z',
    notice: 'Aviso',
    results: [
      {
        product: { product_ref: 'p-1', name: 'Herbicida' }, base_unit: 'ML', presentation_unit: 'L', status: 'ESTIMATED', reason_code: null,
        method: 'SES_NAIVE', run_ref: 'r-1', generated_at: '2026-11-02T14:00:00.000Z', span_length: 4, estimate_base: '111000.000000',
        naive_base: '116000', coverage: { status: 'IDENTIFIED', campaigns: [] }, validity: 'CURRENT', validity_reason: null,
      },
      {
        product: { product_ref: 'p-2', name: 'Fungicida' }, base_unit: 'ML', presentation_unit: 'L', status: 'INSUFFICIENT_DATA',
        reason_code: 'SPAN_TOO_SHORT', method: 'SES_NAIVE', run_ref: 'r-1', generated_at: '2026-11-02T14:00:00.000Z', span_length: 2,
        estimate_base: null, naive_base: null, coverage: { status: 'UNKNOWN', campaigns: [] }, validity: 'NOT_USABLE', validity_reason: 'NO_FIGURE',
      },
    ],
  };

  /**
   * Desde el 2026-11-12 la consulta se exporta sólo en Excel (el CSV se retiró).
   * Cada columna que daba el CSV sigue en el libro, en la portada o en una
   * columna filtrable de «Resultados», con el valor de la respuesta.
   */
  it('cada columna del antiguo CSV está en el Excel con el valor de la respuesta; una ausencia queda vacía', () => {
    const exportedAt = new Date('2026-11-12T12:00:00.000Z');
    const { sheets } = readXlsx(buildEstimationXlsx({ results: response, details: {}, exportedAt }).bytes);
    const cover = sheets.get('Estimación')!;
    // target_campaign_ref, target_name, season_key, evaluated_at → portada.
    expect(cover.text).toContain('c-t');
    expect(cover.text).toContain('Objetivo, "sintético"');
    expect(cover.text).toContain('INVIERNO: Temporada sintética');
    expect(cover.text).toContain('Vigencia evaluada el');
    const res = sheets.get('Resultados')!;
    const header = Array.from({ length: 15 }, (_, i) => res.cells.get(`${String.fromCharCode(65 + i)}5`)?.value);
    expect(header).toEqual([
      'Producto',
      'Estimación',
      'Línea base',
      'Unidad',
      'Estado',
      'Motivo',
      'Vigencia',
      'Motivo de la vigencia',
      'α',
      'Campañas observadas',
      'Ejecución del (hora de Bolivia, UTC−4)',
      'Ejecución (referencia)',
      'Método',
      'Cobertura del tramo',
      'Referencia del producto',
    ]);
    // Encabezados filtrables: el autofiltro cubre las 15 columnas y las 2 filas.
    expect(res.xml.getElementsByTagName('autoFilter')[0]!.getAttribute('ref')).toBe('A5:O7');
    const herb = rowOf(res, 'Herbicida');
    const at = (col: string, row: number) => res.cells.get(`${col}${row}`)?.value ?? null;
    expect(at('O', herb)).toBe('p-1');
    expect(at('B', herb)).toBe('111');
    expect(at('C', herb)).toBe('116');
    expect(at('D', herb)).toBe('L');
    expect(at('E', herb)).toBe('Estimado');
    expect(at('G', herb)).toBe('Vigente');
    expect(at('J', herb)).toBe('4');
    expect(at('L', herb)).toBe('r-1');
    expect(at('M', herb)).toBe('SES frente a la línea base (SES_NAIVE)');
    expect(at('N', herb)).toBe('Identificada en cada campaña del tramo');
    // 2026-11-02T14:00Z → 10:00 en Bolivia.
    expect(Number(at('K', herb))).toBeCloseTo(46328 + 10 / 24, 6);

    const fung = rowOf(res, 'Fungicida');
    expect(at('O', fung)).toBe('p-2');
    expect(at('E', fung)).toBe('Datos insuficientes');
    expect(at('F', fung)).toContain('menos de tres campañas comparables');
    expect(at('G', fung)).toBe('No utilizable');
    expect(at('H', fung)).toBe('Este resultado no tiene cifra.');
    expect(at('J', fung)).toBe('2');
    expect(at('N', fung)).toBe('Desconocida en alguna campaña');
    // Una ausencia es una celda vacía, nunca un cero.
    expect(res.cells.has(`B${fung}`)).toBe(false);
    expect(res.cells.has(`C${fung}`)).toBe(false);
  });
});

describe('α en pantalla', () => {
  it('coma decimal como el resto de las cifras; sin dato, raya; otra forma, no se muestra', () => {
    expect(formatAlpha('0.50')).toBe('0,50');
    expect(formatAlpha('1.00')).toBe('1,00');
    expect(formatAlpha(null)).toBe('—');
    for (const bad of ['0.5', '2.00', '-0.50', '0,50', '']) expect(formatAlpha(bad)).toBe('Cifra no válida');
  });
});
