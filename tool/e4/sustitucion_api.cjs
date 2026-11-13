/**
 * Verificación E4: comprobaciones por la API real de la sustitución (antes de
 * ejecutarla en la Web) y lectura de cantidades y consolidado antes/después.
 *   node tool/e4/sustitucion_api.cjs prohibiciones <CALL_KEY>   D1 (Directiva) → 403; A1 a sí misma → 422
 *   node tool/e4/sustitucion_api.cjs estado <CALL_KEY>...       detalle (A1 y D1) y cierre (A1)
 */
const L = require("./e4_lib.cjs");
const calls = require("../../docs/evidence/E4/datos/03_convocatorias.json").calls;
const out = [];
async function detail(code, id) {
  const d = await L.call(await L.institutional(code), "GET", `/joint-purchase-calls/${id}`);
  return d;
}
async function prohibiciones(key) {
  const id = calls[key].call_ref;
  const s = await L.ids();
  const d = await detail("A1", id);
  const version = d.body.responsible.version;
  const sub = async (code, to) => L.call(await L.institutional(code), "POST", `/joint-purchase-calls/${id}/responsible`, {
    request_id: L.randomUUID(), expected_responsible_version: version, new_responsible_ref: s.users[to].id, reason: "Prueba de prohibicion E4", confirmed: true,
  });
  let r = await sub("D1", "D2");
  out.push({ key, what: "D1 (Directiva) intenta sustituir", status: r.status, body: r.body });
  r = await sub("A1", "A1");
  out.push({ key, what: "A1 intenta nombrarse a sí misma", status: r.status, body: r.body });
  const after = await detail("A1", id);
  out.push({ key, what: "responsable tras los intentos", responsible: after.body.responsible.name, version: after.body.responsible.version });
}
async function estado(keys) {
  for (const key of keys) {
    const id = calls[key].call_ref;
    for (const code of ["A1", "D1"]) {
      const d = await detail(code, id);
      out.push({ key, code, status: d.status, state: d.body?.status, responsible: d.body?.responsible?.name, version: d.body?.responsible?.version,
        participant_count: d.body?.participant_count, totals: (d.body?.products ?? []).map((p) => [p.name, p.totals.participant_count, p.totals.total_quantity_base, p.totals.visibility, p.totals.totals_basis]) });
    }
    const pa = await L.call(await L.institutional("A1"), "GET", `/joint-purchase-calls/${id}/participants`);
    out.push({ key, code: "A1", participants_status: pa.status, quantities: (pa.body?.participants ?? []).map((p) => (p.lines ?? []).map((l) => l.quantity_base)) });
    if (calls[key].name.includes("Cerrada")) {
      const c = await L.call(await L.institutional("A1"), "GET", `/joint-purchase-calls/${id}/closing`);
      out.push({ key, code: "A1", closing: { status: c.status, cutoff_at: c.body?.cutoff_at, lines: (c.body?.lines ?? []).map((l) => [l.participant_count, l.total_quantity_base, l.visibility]) } });
    }
  }
}
const [cmd, ...args] = process.argv.slice(2);
(cmd === "prohibiciones" ? prohibiciones(args[0]) : estado(args))
  .then(() => process.stdout.write(`${JSON.stringify(out, null, 1)}\n`))
  .catch((e) => { process.stderr.write(`ERROR ${e.message}\n`); process.exitCode = 1; })
  .finally(() => L.db.$disconnect());
