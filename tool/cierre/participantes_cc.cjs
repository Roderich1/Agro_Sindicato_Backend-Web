/**
 * Cierre (2026-11-13), recorrido Mobile M3: quién ve a quién en CC (y CA) por la API real 3400.
 * A1 (Administración) y D1 (Directiva) piden /participants y el detalle. Sólo imprime estado HTTP,
 * el primer nombre de cada participante, el alcance que la API informa y los contadores; nunca tokens.
 *   E4_LABEL=VER1 E4_BACK_DIR=<CIERRE-BE>/Back node tool/cierre/participantes_cc.cjs <etiqueta>
 */
const L = require("../e4/e4_lib.cjs");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const calls = JSON.parse(readFileSync(path.join(__dirname, "../../docs/evidence/E4/datos/03_convocatorias.json"), "utf8")).calls;
(async () => {
  const out = { label: process.argv[2] ?? "", at: new Date().toISOString(), checks: [] };
  for (const key of ["CC", "CA"]) {
    const id = calls[key].call_ref;
    for (const code of ["A1", "D1"]) {
      const t = await L.institutional(code);
      const pa = await L.call(t, "GET", `/joint-purchase-calls/${id}/participants`);
      const de = await L.call(t, "GET", `/joint-purchase-calls/${id}`);
      out.checks.push({
        call: key, code,
        participants_status: pa.status,
        participants: pa.status === 200 ? (pa.body?.participants ?? []).map((p) => ({ name: String(p.name ?? "").split(" ")[0], scope: p.consent_scope ?? p.consentScope ?? null, lines: (p.lines ?? []).map((l) => l.quantity_base) })) : null,
        error: pa.status === 200 ? null : (pa.body?.errorCode ?? pa.body?.error ?? null),
        detail_status: de.status,
        can_view_participants: de.body?.can_view_participants,
        pending_consent_count: de.body?.pending_consent_count,
      });
    }
  }
  console.log(JSON.stringify(out, null, 1));
})()
  .catch((e) => { console.error(e.message); process.exitCode = 1; })
  .finally(() => L.db.$disconnect());
