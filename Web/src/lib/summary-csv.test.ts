import { describe, expect, it } from 'vitest';
import { latestDataAsOf, splitCsvLine } from './summary-csv';

const CSV = [
  'campaign_ref,campaign,disclosure,policy,approved,threshold,linked_members,members_with_contribution,suppressed_cells,seal_ref,seal_version,sealed_at',
  'c-1,"Verano, 2026",PROVISIONAL_SYNTHETIC,F07-POL-01,false,3,7,5,true,,,2026-12-31T23:59:59.000Z',
  '',
  'projection_type,product_ref,product_name,base_unit,presentation_unit,status,total_base,total_presentation,contributors,data_as_of,released_at,pending_changes',
  'DECLARED_NEED,p-1,"Bellator, 500 mL",ML,L,DISCLOSED,17000,17,3,2026-10-29T14:19:00.000Z,2026-10-29T14:19:00.000Z,false',
  'CONSUMPTION_TOTAL,p-2,Glifosato,ML,L,SUPPRESSED_UNDER_THRESHOLD,,,,,,false',
  'DECLARED_NEED,p-3,Mancozeb,G,KG,DISCLOSED,85000,85,4,2026-10-29T19:53:00.000Z,2026-10-29T19:53:00.000Z,true',
].join('\n');

describe('CSV del resumen', () => {
  it('toma la fecha más reciente de data_as_of entre las filas de cifras, no la del sellado', () => {
    expect(latestDataAsOf(CSV)).toBe('2026-10-29T19:53:00.000Z');
  });

  it('sin filas con fecha devuelve null', () => {
    expect(latestDataAsOf('projection_type,data_as_of\nX,\n')).toBeNull();
    expect(latestDataAsOf('')).toBeNull();
  });

  it('respeta comillas y comas dentro de un campo', () => {
    expect(splitCsvLine('a,"b, c","d ""e""",f')).toEqual(['a', 'b, c', 'd "e"', 'f']);
  });
});
