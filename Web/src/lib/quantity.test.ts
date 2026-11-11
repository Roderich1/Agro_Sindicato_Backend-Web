import { describe, expect, it } from 'vitest';
import { formatQuantity, formatRoundedEstimate, groupDecimal, isBaseQuantity, toPresentation } from './quantity';

describe('estimación redondeada sólo para presentar (E3 §5)', () => {
  it('redondea a la décima, mitad hacia arriba, sin pasar por Number', () => {
    expect(formatRoundedEstimate('428929.385090', 'G')).toBe('≈ 428,9 KG');
    expect(formatRoundedEstimate('70500.000000', 'ML')).toBe('70,5 L');
    expect(formatRoundedEstimate('111000.000000', 'ML')).toBe('111 L');
    expect(formatRoundedEstimate('14150.000000', 'ML')).toBe('≈ 14,2 L');
    expect(formatRoundedEstimate('14149.999999', 'ML')).toBe('≈ 14,1 L');
    expect(formatRoundedEstimate('123456800000.000250', 'ML')).toBe('≈ 123.456.800 L');
  });
  it('por debajo de 1 L/KG usa mL/g para no mostrar «≈ 0»; el cero es cero', () => {
    expect(formatRoundedEstimate('30.123456', 'G')).toBe('≈ 30,1 g');
    expect(formatRoundedEstimate('0.292613', 'ML')).toBe('≈ 0,3 mL');
    expect(formatRoundedEstimate('999.960000', 'ML')).toBe('≈ 1.000 mL');
    expect(formatRoundedEstimate('0.000000', 'ML')).toBe('0 L');
  });
  it('rechaza lo que no es un decimal válido', () => {
    expect(formatRoundedEstimate(null, 'ML')).toBeNull();
    expect(formatRoundedEstimate('-1', 'ML')).toBeNull();
    expect(formatRoundedEstimate('1.1234567', 'ML')).toBeNull();
  });
});

describe('cantidades exactas (BigInt/strings)', () => {
  it('convierte base → L/KG sin redondeo', () => {
    expect(toPresentation('25000')).toBe('25');
    expect(toPresentation('11500')).toBe('11.5');
    expect(toPresentation('25')).toBe('0.025');
    expect(toPresentation('0')).toBe('0');
    expect(toPresentation('1001')).toBe('1.001');
  });

  it('no pierde precisión por encima de 2^53 ni en el límite int64', () => {
    expect(toPresentation('9007199254740993')).toBe('9007199254740.993');
    expect(toPresentation('9223372036854775807')).toBe('9223372036854775.807');
    expect(formatQuantity('9223372036854775807', 'G')).toBe('9.223.372.036.854.775,807 KG');
  });

  it('un cero explícito se muestra como cero', () => {
    expect(formatQuantity('0', 'ML')).toBe('0 L');
  });

  it('rechaza valores no exactos o con formato dudoso', () => {
    for (const bad of ['-1', '1.5', '1e3', ' 10', '010', '', 'NaN', 'Infinity', '0x10']) {
      expect(isBaseQuantity(bad)).toBe(false);
      expect(formatQuantity(bad, 'ML')).toBeNull();
    }
    expect(formatQuantity(null, 'ML')).toBeNull();
  });

  it('si la presentación del servidor no coincide, no muestra ninguna cifra', () => {
    expect(formatQuantity('11500', 'G', '11.5')).toBe('11,5 KG');
    expect(formatQuantity('11500', 'G', '11.6')).toBeNull();
  });

  it('agrupa miles con punto y usa coma decimal', () => {
    expect(groupDecimal('1234567.5')).toBe('1.234.567,5');
    expect(groupDecimal('999')).toBe('999');
  });
});
