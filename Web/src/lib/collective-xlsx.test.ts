import { describe, expect, it } from 'vitest';
import { cell, point, SEAL, summaryWith, trendsWith } from '../test/fixtures';
import { readXlsx, rowOf } from '../test/xlsx-read';
import type { TrendSeries } from '../types/collective';
import type { InstitutionalResult, InstitutionalResults, ResultDetail, Run } from '../types/estimation';
import { buildSummaryXlsx, summaryXlsxFileName } from './collective-summary-xlsx';
import { buildEstimationXlsx, estimationXlsxFileName } from './estimation-xlsx';
import { buildTrendsXlsx, trendsXlsxFileName } from './trends-xlsx';
import { BRAND } from './xlsx-common';

/**
 * Libros Excel del Resumen colectivo, Tendencias y Estimación (defensa,
 * 2026-11-05). Datos sintéticos. Se comprueba la identidad visual (banda verde
 * oscuro, encabezados esmeralda, estados en color), que cada cifra es la del
 * servidor y que ninguna ausencia se escribe como cero.
 */
const EXPORTED_AT = new Date('2026-11-05T17:00:00.000Z');
const HEADER_ROW = 5;

describe('Resumen colectivo (.xlsx)', () => {
  const summary = summaryWith([
    cell({ product_name: 'Herbicida', total_base: '250000', total_presentation: '250', contributors: 5, data_as_of: '2026-11-03T23:28:00.000Z' }),
    cell({ product_name: 'Urea', base_unit: 'G', total_base: '25500', total_presentation: '25.5', contributors: 3, pending_changes: true }),
    cell({ product_name: 'Cero', total_base: '0', total_presentation: '0', contributors: 3 }),
    // Aunque llegara un total en una celda oculta, no se exporta.
    cell({ product_name: 'Insecticida', status: 'SUPPRESSED_UNDER_THRESHOLD', total_base: '7000', contributors: 2 }),
    cell({ product_name: 'Mancozeb', status: 'SUPPRESSED_REVISION' }),
    cell({ projection_type: 'CONSUMPTION_TOTAL', product_name: 'Herbicida', total_base: '116000', total_presentation: '116', contributors: 4 }),
  ]);

  it('portada con la identidad de Agrocuentas, campaña, cobertura y conteos; sin sumas', () => {
    const book = buildSummaryXlsx({ summary, exportedAt: EXPORTED_AT });
    expect(book.fileName).toBe('resumen-campana-sintetica.xlsx');
    expect(summaryXlsxFileName(summary)).toBe(book.fileName);
    const { sheetNames, sheets, colorsOf } = readXlsx(book.bytes);
    expect(sheetNames).toEqual(['Resumen', 'Necesidad declarada', 'Consumo publicado']);
    const cover = sheets.get('Resumen')!;
    expect(cover.cells.get('A1')!.value).toBe(BRAND);
    expect(colorsOf(cover.cells.get('A1')!.style)).toMatchObject({ fill: '0F1D15', bold: true });
    expect(cover.cells.get('A2')!.value).toBe('Resumen colectivo · Campaña sintética');
    expect(colorsOf(cover.cells.get('A2')!.style)).toMatchObject({ font: '047857', bold: true });
    expect(cover.text).toContain('3 de 4 agricultores vinculados con cifras publicadas');
    expect(cover.text).toContain('5 productos: 3 con cifra publicada · 1 oculto por privacidad · 1 sin cifra publicada.');
    expect(cover.text).toContain('3 agricultores como mínimo por cifra publicada');
    // Ningún total: ni 250 + 25,5 ni necesidad + consumo.
    expect(cover.text + sheets.get('Necesidad declarada')!.text).not.toMatch(/275[.,]5|366|Total/);
    expect(cover.xml.getElementsByTagName('mergeCell')).toHaveLength(3);
    expect(cover.xml.getElementsByTagName('sheetView')[0]!.getAttribute('showGridLines')).toBe('0');
  });

  it('necesidad y consumo en hojas distintas, con cifra, unidad, estado en color y explicación', () => {
    const { sheets, numFmtOf, colorsOf } = readXlsx(buildSummaryXlsx({ summary, exportedAt: EXPORTED_AT }).bytes);
    const need = sheets.get('Necesidad declarada')!;
    expect(['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((c) => need.cells.get(`${c}${HEADER_ROW}`)!.value)).toEqual([
      'Producto',
      'Cantidad',
      'Unidad',
      'Estado',
      'Explicación',
      'Aportantes',
      'Datos hasta (hora de Bolivia, UTC−4)',
    ]);
    expect(colorsOf(need.cells.get(`A${HEADER_ROW}`)!.style)).toMatchObject({ fill: '047857', font: 'FFFFFF', bold: true });
    expect(need.xml.getElementsByTagName('autoFilter')[0]!.getAttribute('ref')).toBe(`A${HEADER_ROW}:J${HEADER_ROW + 5}`);
    expect(need.xml.getElementsByTagName('pane')[0]!.getAttribute('ySplit')).toBe(String(HEADER_ROW));
    expect(need.xml.getElementsByTagName('pageSetup')[0]!.getAttribute('orientation')).toBe('landscape');

    const herb = rowOf(need, 'Herbicida');
    expect(need.cells.get(`B${herb}`)).toMatchObject({ type: 'n', value: '250' });
    expect(numFmtOf(need.cells.get(`B${herb}`)!.style)).toBe('#,##0');
    expect(colorsOf(need.cells.get(`B${herb}`)!.style).bold).toBe(true);
    expect(need.cells.get(`C${herb}`)!.value).toBe('L');
    expect(need.cells.get(`D${herb}`)!.value).toBe('Publicado');
    expect(colorsOf(need.cells.get(`D${herb}`)!.style)).toMatchObject({ fill: 'D1FAE5', font: '047857' });
    expect(need.cells.get(`F${herb}`)).toMatchObject({ type: 'n', value: '5' });
    expect(numFmtOf(need.cells.get(`G${herb}`)!.style)).toBe('yyyy-mm-dd hh:mm');

    const urea = rowOf(need, 'Urea');
    expect(need.cells.get(`B${urea}`)).toMatchObject({ type: 'n', value: '25.5' });
    expect(numFmtOf(need.cells.get(`B${urea}`)!.style)).toBe('#,##0.0');
    expect(need.cells.get(`C${urea}`)!.value).toBe('KG');
    expect(need.cells.get(`E${urea}`)!.value).toContain('aún no alcanzan el umbral');

    expect(need.cells.get(`B${rowOf(need, 'Cero')}`)).toMatchObject({ type: 'n', value: '0' });

    const hidden = rowOf(need, 'Insecticida');
    expect(need.cells.has(`B${hidden}`)).toBe(false);
    expect(need.cells.has(`F${hidden}`)).toBe(false);
    expect(need.cells.get(`D${hidden}`)!.value).toBe('Oculto por privacidad');
    expect(colorsOf(need.cells.get(`D${hidden}`)!.style)).toMatchObject({ fill: 'FEF3C7', font: '92400E' });
    expect(need.cells.get(`E${hidden}`)!.value).toContain('Menos de 3 agricultores aportaron');
    expect(need.text).not.toMatch(/7000|\b7\b/);
    expect(need.cells.get(`D${rowOf(need, 'Mancozeb')}`)!.value).toBe('Sin cifra publicada');

    const consumption = sheets.get('Consumo publicado')!;
    expect(consumption.cells.get(`B${rowOf(consumption, 'Herbicida')}`)).toMatchObject({ type: 'n', value: '116' });
    expect(consumption.text).not.toContain('250');
  });

  it('cada columna del antiguo CSV del resumen está en el libro (portada o columna filtrable)', () => {
    const sealed = summaryWith([
      cell({ product_name: 'Herbicida', total_base: '250000', total_presentation: '250', contributors: 5, data_as_of: '2026-11-03T23:28:00.000Z', released_at: '2026-11-04T12:00:00.000Z', pending_changes: true }),
      cell({ product_name: 'Insecticida', status: 'SUPPRESSED_UNDER_THRESHOLD', released_at: '2026-11-04T12:00:00.000Z' }),
    ]);
    const { sheets, numFmtOf } = readXlsx(buildSummaryXlsx({ summary: { ...sealed, seal: SEAL }, exportedAt: EXPORTED_AT }).bytes);
    const cover = sheets.get('Resumen')!;
    // campaign_ref, campaign, threshold, coverage, seal_ref, seal_version, sealed_at.
    for (const value of [sealed.campaign.campaign_ref, sealed.campaign.name, SEAL.seal_ref, 'Versión 1, sellada por', '3 de 4 agricultores', '3 agricultores como mínimo']) {
      expect(cover.text, value).toContain(value);
    }
    const need = sheets.get('Necesidad declarada')!;
    expect(['H', 'I', 'J'].map((c) => need.cells.get(`${c}${HEADER_ROW}`)!.value)).toEqual([
      'Cambios pendientes',
      'Publicado el (hora de Bolivia, UTC−4)',
      'Referencia del producto',
    ]);
    const herb = rowOf(need, 'Herbicida');
    expect(need.cells.get(`H${herb}`)!.value).toBe('Sí');
    expect(numFmtOf(need.cells.get(`I${herb}`)!.style)).toBe('yyyy-mm-dd hh:mm');
    // 2026-11-04T12:00Z → 08:00 en Bolivia.
    expect(Number(need.cells.get(`I${herb}`)!.value)).toBeCloseTo(46330 + 8 / 24, 6);
    expect(need.cells.get(`J${herb}`)!.value).toBe('p-Herbicida');
    // Una fila oculta conserva su producto y su estado, sin fechas de publicación ni cifras.
    const hidden = rowOf(need, 'Insecticida');
    expect(need.cells.get(`H${hidden}`)!.value).toBe('No');
    expect(need.cells.has(`I${hidden}`)).toBe(false);
    expect(need.cells.get(`J${hidden}`)!.value).toBe('p-Insecticida');
  });

  it('política pendiente: sin cifras ni cobertura, con el motivo', () => {
    const { sheets } = readXlsx(buildSummaryXlsx({ summary: summaryWith([], 'POLICY_PENDING'), exportedAt: EXPORTED_AT }).bytes);
    expect(sheets.get('Resumen')!.text).toContain('La política de divulgación no está aprobada: no se exporta ninguna cifra.');
    for (const name of ['Necesidad declarada', 'Consumo publicado']) {
      const sheet = sheets.get(name)!;
      expect([...sheet.cells.values()].some((c) => c.type === 'n')).toBe(false);
      expect(sheet.text).toContain('Sin cifras: la política de divulgación no está aprobada.');
    }
  });

  it('versión sellada: la cobertura es la del sellado', () => {
    const { sheets } = readXlsx(buildSummaryXlsx({ summary: { ...summary, seal: SEAL }, exportedAt: EXPORTED_AT }).bytes);
    const cover = sheets.get('Resumen')!;
    expect(cover.text).toContain('Cobertura al sellar');
    expect(cover.text).toContain('Versión 1, sellada por');
    expect(cover.text).toContain('al sellar.');
  });
});

describe('Tendencias (.xlsx)', () => {
  const herbicida: TrendSeries = {
    projection_type: 'CONSUMPTION_TOTAL',
    product_ref: 'p-herb',
    product_name: 'Herbicida',
    base_unit: 'ML',
    presentation_unit: 'L',
    points: [
      point('c-2024', { total_base: '96000', total_presentation: '96', contributors: 4, data_as_of: '2024-12-01T00:00:00.000Z' }),
      point('c-2025', { status: 'WITHDRAWN_AFTER_SEAL', total_base: '9000' }),
      point('c-2026', { status: 'NOT_SEALED' }),
    ],
  };
  const urea: TrendSeries = {
    ...herbicida,
    product_ref: 'p-urea',
    product_name: 'Urea',
    base_unit: 'G',
    presentation_unit: 'KG',
    points: [point('c-2024', { status: 'SUPPRESSED_UNDER_THRESHOLD' }), point('c-2025', { total_base: '30000', total_presentation: '30', contributors: 4 }), point('c-2026', { status: 'NOT_SEALED' })],
  };

  it('matriz producto × campaña sellada con huecos (no ceros), detalle con estados y campañas en la portada', () => {
    const book = buildTrendsXlsx({ trends: trendsWith([herbicida, urea]), type: 'CONSUMPTION_TOTAL', exportedAt: EXPORTED_AT });
    expect(book.fileName).toBe('tendencias-consumo-publicado.xlsx');
    expect(trendsXlsxFileName('DECLARED_NEED')).toBe('tendencias-necesidad-declarada.xlsx');
    const { sheetNames, sheets } = readXlsx(book.bytes);
    expect(sheetNames).toEqual(['Tendencias', 'Por campaña', 'Detalle', 'Campañas']);
    const cover = sheets.get('Tendencias')!;
    expect(cover.cells.get('A2')!.value).toBe('Tendencias · Consumo publicado');
    expect(cover.text).toContain('Campaña 2024: Cerrada, versión 1 sellada, 4 de 7 con cifras publicadas');
    expect(cover.text).toContain('Campaña 2026: Abierta, sin sellar (no aporta cifras)');

    const matrix = sheets.get('Por campaña')!;
    // Sólo las campañas selladas son columnas; la 2026 abierta no aparece.
    expect(['A', 'B', 'C', 'D'].map((c) => matrix.cells.get(`${c}${HEADER_ROW}`)!.value)).toEqual(['Producto', 'Unidad', 'Campaña 2024', 'Campaña 2025']);
    expect(matrix.cells.has(`E${HEADER_ROW}`)).toBe(false);
    const herb = rowOf(matrix, 'Herbicida');
    expect(matrix.cells.get(`C${herb}`)).toMatchObject({ type: 'n', value: '96' });
    expect(matrix.cells.has(`D${herb}`)).toBe(false);
    const ur = rowOf(matrix, 'Urea');
    expect(matrix.cells.has(`C${ur}`)).toBe(false);
    expect(matrix.cells.get(`D${ur}`)).toMatchObject({ type: 'n', value: '30' });
    expect(matrix.text).not.toMatch(/9000|\b9\b/);

    const detail = sheets.get('Detalle')!;
    const rows = [...detail.cells.entries()].filter(([ref]) => /^E\d+$/.test(ref) && Number(ref.slice(1)) > HEADER_ROW).map(([, c]) => c.value);
    expect(rows).toEqual(['Publicado', 'Retirado tras sellar', 'Sin sellar', 'Oculto por privacidad', 'Publicado', 'Sin sellar']);
    expect(detail.text).toContain('retiró su aporte después del sellado');
    expect(detail.text).toContain('no tiene una versión sellada');
    expect(detail.text).not.toMatch(/Total|Promedio/);
  });

  it('cada columna del antiguo CSV de tendencias está en el libro (portada, «Detalle» o «Campañas»)', () => {
    const trends = trendsWith([herbicida]);
    const { sheets, numFmtOf } = readXlsx(buildTrendsXlsx({ trends, type: 'CONSUMPTION_TOTAL', exportedAt: EXPORTED_AT }).bytes);
    // threshold, projection_type y notice en la portada.
    const cover = sheets.get('Tendencias')!;
    expect(cover.text).toContain(`${trends.disclosure.threshold} agricultores como mínimo por cifra publicada`);
    expect(cover.text).toContain('Consumo publicado');
    expect(cover.text).toContain(trends.notice);

    const detail = sheets.get('Detalle')!;
    expect(['I', 'J', 'K', 'L'].map((c) => detail.cells.get(`${c}${HEADER_ROW}`)!.value)).toEqual([
      'Cambios pendientes',
      'Referencia del producto',
      'Referencia de la campaña',
      'Referencia de la versión sellada',
    ]);
    expect(detail.xml.getElementsByTagName('autoFilter')[0]!.getAttribute('ref')).toBe(`A${HEADER_ROW}:L${HEADER_ROW + 3}`);
    const first = HEADER_ROW + 1;
    expect(detail.cells.get(`I${first}`)!.value).toBe('No');
    expect(detail.cells.get(`J${first}`)!.value).toBe('p-herb');
    expect(detail.cells.get(`K${first}`)!.value).toBe('c-2024');
    const sealOf2024 = trends.campaigns.find((c) => c.campaign_ref === 'c-2024')!.seal!.seal_ref;
    expect(detail.cells.get(`L${first}`)!.value).toBe(sealOf2024);

    const campaigns = sheets.get('Campañas')!;
    expect(Array.from({ length: 10 }, (_, i) => campaigns.cells.get(`${String.fromCharCode(65 + i)}${HEADER_ROW}`)!.value)).toEqual([
      'Campaña',
      'Estado',
      'Inicio (día de calendario)',
      'Versión sellada',
      'Sellada el (hora de Bolivia, UTC−4)',
      'Agricultores vinculados',
      'Con cifras publicadas',
      'Filas sin cifra',
      'Referencia de la campaña',
      'Referencia de la versión sellada',
    ]);
    expect(campaigns.xml.getElementsByTagName('autoFilter')[0]!.getAttribute('ref')).toBe(`A${HEADER_ROW}:J${HEADER_ROW + trends.campaigns.length}`);
    const c2024 = rowOf(campaigns, 'Campaña 2024');
    const source = trends.campaigns.find((c) => c.campaign_ref === 'c-2024')!;
    expect(campaigns.cells.get(`C${c2024}`)!.value).toBe(source.start_date.slice(0, 10));
    expect(campaigns.cells.get(`D${c2024}`)).toMatchObject({ type: 'n', value: String(source.seal!.version) });
    expect(numFmtOf(campaigns.cells.get(`E${c2024}`)!.style)).toBe('yyyy-mm-dd hh:mm');
    expect(campaigns.cells.get(`F${c2024}`)).toMatchObject({ type: 'n', value: String(source.coverage!.linked_members) });
    expect(campaigns.cells.get(`G${c2024}`)).toMatchObject({ type: 'n', value: String(source.coverage!.members_with_contribution) });
    expect(campaigns.cells.get(`I${c2024}`)!.value).toBe('c-2024');
    expect(campaigns.cells.get(`J${c2024}`)!.value).toBe(sealOf2024);
    const open = rowOf(campaigns, 'Campaña 2026');
    expect(campaigns.cells.get(`D${open}`)!.value).toBe('Sin sellar');
    expect(campaigns.cells.has(`E${open}`)).toBe(false);
  });

  it('sin series: lo dice con el filtro aplicado y sin filas a cero', () => {
    const { sheets } = readXlsx(buildTrendsXlsx({ trends: trendsWith([]), type: 'DECLARED_NEED', exportedAt: EXPORTED_AT }).bytes);
    const matrix = sheets.get('Por campaña')!;
    expect(matrix.text).toContain('No hay cifras selladas de necesidad declarada en ninguna campaña. Eso no significa cero.');
    expect([...matrix.cells.values()].some((c) => c.type === 'n')).toBe(false);
  });
});

describe('Estimación del consumo (.xlsx)', () => {
  const target = { campaign_ref: 't-1', name: 'Invierno 2026', status: 'ABIERTA' as const, start_date: '2026-10-14', end_date: null };
  const season = { season_ref: 's-1', key: 'INVIERNO', definition: 'Temporada sintética', duration_days: 180 };
  const coverage = { status: 'IDENTIFIED' as const, unknown_reason: null, members_in_published_figures: 4, linked_members: 6, measures: 'PARTICIPATION_NOT_COMPLETENESS' as const };
  const result = (name: string, overrides: Partial<InstitutionalResult> = {}): InstitutionalResult => ({
    product: { product_ref: `p-${name}`, name },
    base_unit: 'ML',
    presentation_unit: 'L',
    status: 'ESTIMATED',
    reason_code: null,
    method: 'SES_NAIVE',
    run_ref: 'run-1',
    generated_at: '2026-11-05T16:12:55.000Z',
    span_length: 4,
    estimate_base: '111000.000000',
    naive_base: '116000',
    coverage: { status: 'IDENTIFIED', campaigns: [{ campaign_ref: 'c1', coverage }] },
    validity: 'CURRENT',
    validity_reason: null,
    ...overrides,
  });
  const points = (values: (string | null)[]) =>
    values.map((value, i) => ({
      position: i,
      campaign: { campaign_ref: `c${i + 1}`, name: `C${i + 1}`, status: 'CERRADA' as const, start_date: `20${20 + i}-05-01`, end_date: null },
      kind: value === null ? ('HIDDEN' as const) : ('VERIFIED_CONSUMPTION' as const),
      quantity_base: value,
      seal_ref: null,
      classification_ref: 'k',
      coverage,
      in_span: value !== null,
      exclusion_reason: value === null ? ('HIDDEN' as const) : null,
    }));
  const detail = (name: string, overrides: Partial<ResultDetail> = {}): ResultDetail => ({
    ...result(name),
    alpha: '0.50',
    fit_informative: true,
    fit_criterion: 'mae',
    span: { first_position: 0, last_position: 3, length: 4, first_campaign_ref: 'c1', last_campaign_ref: 'c4' },
    series: null,
    points: points(['96000', '120000', '104000', '116000']),
    validations: [],
    metrics: null,
    ...overrides,
  });
  const run: Run = {
    contract_version: 1,
    run_ref: 'run-1',
    job_ref: 'job-1',
    scope: { tenant_ref: 't' },
    requested_by_role: 'DIRECTIVA',
    target,
    season,
    target_classification_ref: 'k',
    method: 'SES_NAIVE',
    method_version: '1',
    outcome: 'CALCULATED',
    failure_code: null,
    previous_run_ref: null,
    content_hash: 'h',
    generated_at: '2026-11-05T16:12:55.000Z',
    counts: { estimated: 1, insufficient_data: 1, incompatible_data: 0, calculation_failed: 0 },
    parameters: {},
    disclosure: { mode: 'PROVISIONAL_SYNTHETIC', policy: 'F07-POL-01', threshold: 3 },
    results: [
      detail('Herbicida'),
      detail('Fungicida', { status: 'INSUFFICIENT_DATA', reason_code: 'SPAN_TOO_SHORT', estimate_base: null, naive_base: null, alpha: null, span: null, points: points(['36000', null]), validity: 'NOT_USABLE', validity_reason: 'NO_FIGURE' }),
    ],
  };
  const results: InstitutionalResults = {
    contract_version: 1,
    profile: 'INSTITUTIONAL',
    scope: { tenant_ref: 't' },
    target,
    season,
    evaluated_at: '2026-11-05T18:00:00.000Z',
    results: [
      result('Herbicida'),
      result('Fungicida', { status: 'INSUFFICIENT_DATA', reason_code: 'SPAN_TOO_SHORT', estimate_base: null, naive_base: null, span_length: 2, validity: 'NOT_USABLE', validity_reason: 'NO_FIGURE' }),
    ],
    notice: 'Aviso fijo del servicio.',
  };

  it('estimación y línea base del servidor, «Datos insuficientes» sin cifra, serie observada con huecos', () => {
    const book = buildEstimationXlsx({ results, details: { 'run-1': run }, exportedAt: EXPORTED_AT });
    expect(book.fileName).toBe('estimacion-invierno-2026.xlsx');
    expect(estimationXlsxFileName(results)).toBe(book.fileName);
    const { sheetNames, sheets, numFmtOf, colorsOf } = readXlsx(book.bytes);
    expect(sheetNames).toEqual(['Estimación', 'Resultados', 'Serie observada']);
    const cover = sheets.get('Estimación')!;
    expect(cover.cells.get('A2')!.value).toBe('Estimación del consumo · Invierno 2026');
    expect(cover.text).toContain('INVIERNO: Temporada sintética');
    expect(cover.text).toContain('2 productos: 1 estimados, 1 sin cifra');
    expect(cover.text).toContain('t-1');

    const res = sheets.get('Resultados')!;
    expect(['A', 'B', 'C', 'D', 'E', 'G', 'I'].map((c) => res.cells.get(`${c}${HEADER_ROW}`)!.value)).toEqual(['Producto', 'Estimación', 'Línea base', 'Unidad', 'Estado', 'Vigencia', 'α']);
    const herb = rowOf(res, 'Herbicida');
    expect(res.cells.get(`B${herb}`)).toMatchObject({ type: 'n', value: '111' });
    expect(numFmtOf(res.cells.get(`B${herb}`)!.style)).toBe('#,##0');
    expect(res.cells.get(`C${herb}`)).toMatchObject({ type: 'n', value: '116' });
    expect(res.cells.get(`E${herb}`)!.value).toBe('Estimado');
    expect(res.cells.get(`G${herb}`)!.value).toBe('Vigente');
    expect(colorsOf(res.cells.get(`G${herb}`)!.style)).toMatchObject({ fill: 'D1FAE5' });
    expect(res.cells.get(`I${herb}`)!.value).toBe('0,50');
    expect(res.cells.get(`J${herb}`)!.value).toBe('4');

    const fung = rowOf(res, 'Fungicida');
    expect(res.cells.has(`B${fung}`)).toBe(false);
    expect(res.cells.has(`C${fung}`)).toBe(false);
    expect(res.cells.get(`E${fung}`)!.value).toBe('Datos insuficientes');
    expect(colorsOf(res.cells.get(`E${fung}`)!.style)).toMatchObject({ fill: 'FEF3C7' });
    expect(res.cells.get(`F${fung}`)!.value).toContain('menos de tres campañas comparables');
    expect(res.cells.get(`G${fung}`)!.value).toBe('No utilizable');
    expect(res.text).not.toMatch(/\b0 L\b/);

    const series = sheets.get('Serie observada')!;
    const values = [...series.cells.entries()].filter(([ref]) => /^C\d+$/.test(ref) && Number(ref.slice(1)) > HEADER_ROW).map(([, c]) => c.value);
    expect(values).toEqual(['96', '120', '104', '116', '36']);
    const kinds = [...series.cells.entries()].filter(([ref]) => /^E\d+$/.test(ref) && Number(ref.slice(1)) > HEADER_ROW).map(([, c]) => c.value);
    expect(kinds).toEqual(['Consumo comprobado', 'Consumo comprobado', 'Consumo comprobado', 'Consumo comprobado', 'Consumo comprobado', 'Oculto']);
    expect(series.text).toContain('4 de 6');
  });

  it('una cifra que llega por error en un resultado sin estimación no se exporta', () => {
    const wrong = { ...results, results: [result('Glifosato', { status: 'INSUFFICIENT_DATA', estimate_base: '5000', naive_base: '5000', validity: 'NOT_USABLE', validity_reason: 'NO_FIGURE' })] };
    const { sheets } = readXlsx(buildEstimationXlsx({ results: wrong, details: {}, exportedAt: EXPORTED_AT }).bytes);
    const res = sheets.get('Resultados')!;
    const row = rowOf(res, 'Glifosato');
    expect(res.cells.has(`B${row}`)).toBe(false);
    expect(res.cells.has(`C${row}`)).toBe(false);
    expect(res.text).not.toMatch(/5000|\b5\b/);
    expect(sheets.get('Serie observada')!.text).toContain('Sin serie observada');
  });
});
