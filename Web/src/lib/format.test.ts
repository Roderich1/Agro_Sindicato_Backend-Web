import { describe, expect, it } from 'vitest';
import { fmtPercent } from './format';

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
