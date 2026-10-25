/**
 * F10 usabilidad, DS-UX Central/Web: exportaciones nuevas de F07 (sellado y
 * tendencias) sobre un tenant de VERIFICACIÓN sembrado con
 * Back/scripts/f10-dsux-central-seed.cjs. Sólo la API, sin navegador. Es un
 * instrumento aparte: no cambia contraste.mjs, el oráculo ni el generador.
 *
 *   node exportaciones.mjs <salida> <manifiesto.json>
 *
 * Entorno: API_URL, F10_UX_PASSWORD (sólo en el proceso). Una sesión de la
 * Directiva lee el resumen (JSON y CSV), el estado del sellado y las
 * tendencias (JSON y CSV de los dos tipos), y genera un borrador con su CSV.
 * Comprueba las cifras con el oráculo (antes de W3), que las columnas seal_*
 * existen y van vacías sin sellar, que el sellado está bloqueado y que las
 * tendencias no muestran series. Guarda los archivos y su SHA-256: las huellas
 * son nuevas y no se comparan con las de mediciones anteriores. No imprime
 * secretos.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [outDir = '.', manifestPath] = process.argv.slice(2);
const { API_URL, F10_UX_PASSWORD } = process.env;
const here = dirname(fileURLToPath(import.meta.url));
const oracle = JSON.parse(readFileSync(join(here, 'oraculo_web.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const out = resolve(outDir, `${manifest.label}-exportaciones`);
mkdirSync(out, { recursive: true });
const checks = [];
const check = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), detail: String(detail).slice(0, 400) });
const campaignId = manifest.campaign.id;
const E = oracle.esperado.antes_de_W3;
const files = {};

async function login(email) {
  const res = await fetch(`${API_URL}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: F10_UX_PASSWORD }) });
  if (res.status !== 200 && res.status !== 201) throw new Error(`login por la API: HTTP ${res.status}`);
  return (await res.json()).accessToken;
}
async function call(method, path, token) {
  const res = await fetch(`${API_URL}/api/v1${path}`, { method, headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  return { status: res.status, text, type: res.headers.get('content-type') ?? '' };
}
function keep(name, text) {
  writeFileSync(join(out, name), text);
  files[name] = createHash('sha256').update(text).digest('hex');
}
/** Sección de un CSV cuya cabecera empieza por `first`, como objetos por nombre. */
function section(text, first) {
  const lines = text.replace(/\r/g, '').split('\n');
  const start = lines.findIndex((line) => line.startsWith(`${first},`));
  if (start < 0) return { header: [], rows: [] };
  const header = lines[start].split(',');
  const rows = [];
  for (const line of lines.slice(start + 1)) {
    if (line === '') break;
    rows.push(Object.fromEntries(line.split(',').map((v, i) => [header[i], v])));
  }
  return { header, rows };
}
const SEAL_COLUMNS = ['seal_ref', 'seal_version', 'sealed_at'];

const token = await login(manifest.accounts.directiva);

// Resumen: JSON y CSV, antes de W3.
const summary = await call('GET', `/collective/campaigns/${campaignId}/summary`, token);
const summaryCsv = await call('GET', `/collective/campaigns/${campaignId}/summary.csv`, token);
check('Resumen JSON y CSV: HTTP 200', summary.status === 200 && summaryCsv.status === 200, `${summary.status} ${summaryCsv.status}`);
const s = JSON.parse(summary.text);
keep('resumen.json', summary.text);
keep('resumen.csv', summaryCsv.text);
check('Resumen JSON: sin versión sellada (seal = null)', s.seal === null, JSON.stringify(s.seal));
for (const want of E.celdas) {
  const got = (s.cells ?? []).find((c) => c.product_name === want.producto);
  check(`Resumen JSON: ${want.producto} = ${want.total_base} ML, ${want.aportantes} aportantes`,
    got && got.status === 'DISCLOSED' && got.total_base === want.total_base && got.contributors === want.aportantes,
    got ? `${got.status} ${got.total_base} ${got.contributors}` : 'sin fila');
}
check(`Resumen JSON: cobertura ${E.cobertura.members_with_contribution} de ${E.cobertura.linked_members}`,
  s.coverage?.members_with_contribution === E.cobertura.members_with_contribution && s.coverage?.linked_members === E.cobertura.linked_members,
  JSON.stringify(s.coverage));
const sHead = section(summaryCsv.text, 'campaign_ref');
check('Resumen CSV: cabecera con seal_ref, seal_version y sealed_at, vacías', SEAL_COLUMNS.every((c) => sHead.header.includes(c) && sHead.rows[0]?.[c] === ''), sHead.header.join(','));
const sCells = section(summaryCsv.text, 'projection_type').rows;
for (const want of E.celdas) {
  const row = sCells.find((r) => r.product_name === want.producto);
  check(`Resumen CSV = JSON: ${want.producto}`, row && row.status === 'DISCLOSED' && row.total_base === want.total_base && row.contributors === String(want.aportantes), row ? `${row.status} ${row.total_base} ${row.contributors}` : 'sin fila');
}

// Estado del sellado: bloqueado (sellado desactivado, campaña abierta).
const seal = await call('GET', `/collective/campaigns/${campaignId}/seal`, token);
keep('sellado-estado.json', seal.text);
const st = seal.status === 200 ? JSON.parse(seal.text) : {};
check('Sellado: NOT_SEALED, no se puede sellar, bloqueado por SEALING_DISABLED y CAMPAIGN_NOT_CLOSED',
  seal.status === 200 && st.state === 'NOT_SEALED' && st.can_seal === false && st.blocked_by?.includes('SEALING_DISABLED') && st.blocked_by?.includes('CAMPAIGN_NOT_CLOSED'),
  `${seal.status} ${st.state} ${st.can_seal} ${JSON.stringify(st.blocked_by)}`);

// Tendencias: JSON y CSV de cada tipo; sin versiones selladas no hay series.
for (const [type, name] of [['DECLARED_NEED', 'necesidad'], ['CONSUMPTION_TOTAL', 'consumo']]) {
  const json = await call('GET', `/collective/trends?projection_type=${type}`, token);
  const csv = await call('GET', `/collective/trends.csv?projection_type=${type}`, token);
  keep(`tendencias-${name}.json`, json.text);
  keep(`tendencias-${name}.csv`, csv.text);
  const t = json.status === 200 ? JSON.parse(json.text) : {};
  const camp = (t.campaigns ?? []).find((c) => c.campaign_ref === campaignId);
  check(`Tendencias ${type}: HTTP 200 (JSON y CSV)`, json.status === 200 && csv.status === 200, `${json.status} ${csv.status}`);
  check(`Tendencias ${type}: la campaña figura sin sellar y sin cobertura`, camp && camp.seal === null && camp.coverage === null, JSON.stringify(camp ?? null));
  check(`Tendencias ${type}: ninguna serie`, Array.isArray(t.series) && t.series.length === 0, `${t.series?.length}`);
  check(`Tendencias ${type}: CSV sin cifras ni NaN/undefined`, !/NaN|undefined/.test(csv.text) && !/,DISCLOSED,/.test(csv.text), `${csv.text.split(/\r?\n/).length} líneas`);
}

// Borrador (W4 sin W3) y su CSV.
const draft = await call('POST', `/collective/campaigns/${campaignId}/proposals`, token);
check('Borrador: HTTP 201', draft.status === 201, draft.status);
const d = draft.status === 201 ? JSON.parse(draft.text) : {};
const proposalCsv = await call('GET', `/collective/proposals/${d.proposal_ref}/csv`, token);
keep('propuesta.csv', proposalCsv.text);
check('Borrador CSV: HTTP 200', proposalCsv.status === 200, proposalCsv.status);
const pHead = section(proposalCsv.text, 'proposal_ref');
check('Borrador CSV: cabecera con seal_ref, seal_version y sealed_at, vacías', SEAL_COLUMNS.every((c) => pHead.header.includes(c) && pHead.rows[0]?.[c] === ''), pHead.header.join(','));
const pLines = section(proposalCsv.text, 'position').rows;
for (const want of E.celdas) {
  const row = pLines.find((r) => r.product_name === want.producto);
  check(`Borrador CSV: ${want.producto} = ${want.total_base} ML, ${want.aportantes} aportantes`, row && row.status === 'DISCLOSED' && row.quantity_base === want.total_base && row.contributors === String(want.aportantes), row ? `${row.status} ${row.quantity_base} ${row.contributors}` : 'sin fila');
}
check('Borrador CSV: sin NaN ni undefined', !/NaN|undefined/.test(proposalCsv.text));

const passed = checks.filter((c) => c.ok).length;
writeFileSync(join(out, 'exportaciones.json'), `${JSON.stringify({ label: manifest.label, api_url: API_URL, at: new Date().toISOString(), passed, total: checks.length, checks, sha256: files }, null, 2)}\n`);
console.log(`exportaciones ${manifest.label}: ${passed}/${checks.length}`);
process.exitCode = passed === checks.length ? 0 : 1;
