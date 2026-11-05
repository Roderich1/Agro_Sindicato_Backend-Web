// Genera las muestras del exportador «Compra conjunta» con el módulo real (empaquetado con rolldown).
// Uso: node make-samples.mjs <módulo.mjs> <csv de la DEMO> <directorio de salida>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const [modulePath, csvPath, outDir] = process.argv.slice(2);
const { buildJointPurchaseXlsx } = await import(pathToFileURL(modulePath).href);

// CSV RFC 4180 (comillas dobles, comas, saltos dentro de comillas).
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
const nul = (v) => (v === '' ? null : v);
const rows = parseCsv(readFileSync(csvPath, 'utf8'));
const head = Object.fromEntries(rows[0].map((k, i) => [k, rows[1][i]]));
const notice = rows[2][1];
const lineHeader = rows[4];
const lines = rows
  .slice(5)
  .filter((r) => r.length > 1)
  .map((r) => Object.fromEntries(lineHeader.map((k, i) => [k, r[i]])));

const proposal = {
  contractVersion: 1,
  proposal_ref: head.proposal_ref,
  status: head.status,
  basis: head.basis,
  // El CSV no trae el estado de la campaña: se rotula así en la muestra, no se inventa.
  campaign: { campaign_ref: head.campaign_ref, name: head.campaign, status: '(no consta en el CSV)' },
  seal: null,
  generated_at: head.generated_at,
  generated_by: { user_ref: '', name: head.generated_by },
  inputs_fingerprint: nul(head.inputs_fingerprint),
  disclosure: { mode: head.disclosure, policy: head.policy, approved: false },
  coverage:
    head.linked_members === ''
      ? null
      : { linked_members: Number(head.linked_members), members_with_contribution: Number(head.members_with_contribution), basis: nul(head.coverage_basis) },
  lines: lines.map((l) => ({
    position: Number(l.position),
    product_ref: l.product_ref,
    product_name: l.product_name,
    base_unit: l.base_unit,
    presentation_unit: l.presentation_unit,
    status: l.status,
    quantity_base: nul(l.quantity_base),
    quantity_presentation: nul(l.quantity_presentation),
    contributors: l.contributors === '' ? null : Number(l.contributors),
    data_as_of: nul(l.data_as_of),
    released_at: nul(l.released_at),
    pending_changes: l.pending_changes === 'true',
  })),
  notice,
};
const reference = {
  contract_version: 1,
  kind: 'PROPOSAL_ESTIMATION_REFERENCE',
  label: head.estimation_reference,
  proposal_ref: head.proposal_ref,
  proposal_generated_at: head.generated_at,
  target_campaign_ref: head.campaign_ref,
  availability: head.estimation_availability,
  evaluated_at: head.estimation_evaluated_at,
  season: head.estimation_season ? { season_ref: '', key: head.estimation_season, definition: '', duration_days: 0 } : null,
  notice: head.estimation_notice,
  lines: lines.map((l) => ({
    position: Number(l.position),
    product_ref: l.product_ref,
    base_unit: l.base_unit,
    presentation_unit: l.presentation_unit,
    absence: nul(l.estimation_absence),
    estimation:
      l.estimation_status === ''
        ? null
        : {
            status: l.estimation_status,
            reason_code: nul(l.estimation_reason_code),
            estimate_base: nul(l.estimation_estimate_base),
            validity: l.estimation_validity,
            validity_reason: nul(l.estimation_validity_reason),
            method: l.estimation_method,
            run_ref: l.estimation_run_ref,
            generated_at: l.estimation_run_generated_at,
            span_length: null,
            run_relation: l.estimation_run_relation,
          },
  })),
};

// Casos sintéticos: decimales, kg, miles, oculta, revisión, cambios pendientes, cero publicado, 9 decimales.
const L = (o) => ({
  position: 0,
  product_ref: `p-${o.product_name}`,
  base_unit: 'ML',
  presentation_unit: o.base_unit === 'G' ? 'KG' : 'L',
  status: 'DISCLOSED',
  quantity_base: null,
  quantity_presentation: null,
  contributors: null,
  data_as_of: '2026-11-03T23:54:25.043Z',
  released_at: null,
  pending_changes: false,
  ...o,
});
const casesProposal = {
  ...proposal,
  proposal_ref: 'cafe0000-0000-4000-8000-000000000001',
  campaign: { campaign_ref: 'c-sintetica', name: 'Campaña sintética de casos', status: 'ABIERTA' },
  generated_by: { user_ref: '', name: 'Directiva sintética' },
  inputs_fingerprint: 'f'.repeat(64),
  coverage: { linked_members: 6, members_with_contribution: 5, basis: 'PUBLISHED_FIGURES' },
  lines: [
    L({ position: 0, product_name: 'Herbicida sintético', quantity_base: '11500', quantity_presentation: '11.5', contributors: 5, pending_changes: true }),
    L({ position: 1, product_name: 'Adherente sintético', base_unit: 'G', quantity_base: '25', quantity_presentation: '0.025', contributors: 4 }),
    L({ position: 2, product_name: 'Fungicida sintético', quantity_base: '1234567500', quantity_presentation: '1234567.5', contributors: 6 }),
    L({ position: 3, product_name: 'Insecticida sintético', status: 'SUPPRESSED_UNDER_THRESHOLD', data_as_of: null }),
    L({ position: 4, product_name: 'Acaricida sintético', status: 'SUPPRESSED_REVISION', data_as_of: null }),
    L({ position: 5, product_name: 'Cero sintético', quantity_base: '0', quantity_presentation: '0', contributors: 3 }),
  ],
};
const E = (o) => ({
  status: 'ESTIMATED',
  reason_code: null,
  estimate_base: '111000.000000',
  validity: 'CURRENT',
  validity_reason: null,
  method: 'SES_NAIVE',
  run_ref: 'run-sintetico',
  generated_at: '2026-11-05T16:12:55.510Z',
  span_length: 3,
  run_relation: 'AFTER_PROPOSAL',
  ...o,
});
const R = (position, name, unit, o) => ({
  position,
  product_ref: `p-${name}`,
  base_unit: unit,
  presentation_unit: unit === 'G' ? 'KG' : 'L',
  absence: null,
  ...o,
});
const casesReference = {
  ...reference,
  proposal_ref: casesProposal.proposal_ref,
  lines: [
    R(0, 'Herbicida sintético', 'ML', { estimation: E({ estimate_base: '10750.250000' }) }),
    R(1, 'Adherente sintético', 'G', { estimation: E({ estimate_base: '0.292613', validity: 'OUTDATED', validity_reason: 'SOURCES_CHANGED', run_relation: 'BEFORE_PROPOSAL' }) }),
    R(2, 'Fungicida sintético', 'ML', {
      estimation: E({ status: 'INSUFFICIENT_DATA', reason_code: 'SPAN_TOO_SHORT', estimate_base: null, validity: 'NOT_USABLE', validity_reason: 'NO_FIGURE' }),
    }),
    R(3, 'Insecticida sintético', 'ML', { estimation: E({ estimate_base: '48000.500000' }) }),
    R(4, 'Acaricida sintético', 'ML', { absence: 'NO_RESULT', estimation: null }),
    R(5, 'Cero sintético', 'ML', { estimation: E({ estimate_base: null, validity: 'NOT_USABLE', validity_reason: 'SOURCES_WITHDRAWN' }) }),
  ],
};

mkdirSync(outDir, { recursive: true });
const exportedAt = new Date();
const demo = buildJointPurchaseXlsx({ proposal, reference, exportedAt });
writeFileSync(join(outDir, 'muestra-demo-borrador.xlsx'), demo.bytes);
const cases = buildJointPurchaseXlsx({ proposal: casesProposal, reference: casesReference, exportedAt });
writeFileSync(join(outDir, 'muestra-casos-sinteticos.xlsx'), cases.bytes);
writeFileSync(
  join(outDir, 'muestra-entradas.json'),
  `${JSON.stringify({ exportedAt: exportedAt.toISOString(), demo: { proposal, reference }, cases: { proposal: casesProposal, reference: casesReference } }, null, 2)}\n`,
);
console.log(
  JSON.stringify({
    exportedAt: exportedAt.toISOString(),
    demo: { bytes: demo.bytes.length, includesReference: demo.includesReference },
    cases: { bytes: cases.bytes.length, includesReference: cases.includesReference },
  }),
);
