import { describe, expect, it } from 'vitest';
import { fmtCalendarDate, fmtPercent } from './format';

/** Contrato del rediseño §5: sin denominador válido no hay porcentaje. */
describe('fmtPercent', () => {
  it('formatea con es-BO, sin decimales', () => {
    expect(fmtPercent(3, 4)).toMatch(/^75\s?%$/);
    expect(fmtPercent(1, 3)).toMatch(/^33\s?%$/);
    expect(fmtPercent(4, 4)).toMatch(/^100\s?%$/);
  });

  it('un numerador 0 con denominador válido es un 0 % real (dato del servidor)', () => {
    expect(fmtPercent(0, 4)).toMatch(/^0\s?%$/);
  });

  it('denominador 0 → null: la vista no muestra porcentaje', () => {
    expect(fmtPercent(0, 0)).toBeNull();
    expect(fmtPercent(3, 0)).toBeNull();
    expect(fmtPercent(3, -0)).toBeNull();
  });

  it('valores no finitos → null', () => {
    expect(fmtPercent(Number.NaN, 4)).toBeNull();
    expect(fmtPercent(3, Number.NaN)).toBeNull();
    expect(fmtPercent(Number.POSITIVE_INFINITY, 4)).toBeNull();
    expect(fmtPercent(3, Number.NEGATIVE_INFINITY)).toBeNull();
  });
});

/** Etapa 2: días de calendario a medianoche UTC (fechas de campaña). */
describe('fmtCalendarDate', () => {
  it('muestra el mismo día guardado, aunque la zona local esté detrás de UTC', () => {
    const text = fmtCalendarDate('2026-10-15T00:00:00.000Z')!;
    expect(text).toMatch(/15/);
    expect(text).toMatch(/oct/i);
    expect(text).toMatch(/2026/);
    expect(text).not.toMatch(/14/);
  });

  it('sin valor o con una fecha no válida devuelve null', () => {
    expect(fmtCalendarDate(null)).toBeNull();
    expect(fmtCalendarDate(undefined)).toBeNull();
    expect(fmtCalendarDate('')).toBeNull();
    expect(fmtCalendarDate('no-es-fecha')).toBeNull();
  });
});
