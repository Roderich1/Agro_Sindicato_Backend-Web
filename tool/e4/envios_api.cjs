/**
 * Verificación E4: envíos ATRASADOS y REPETIDOS del agricultor F1 sobre CM1, por la API real con una
 * sesión de app propia (otra instalación de F1), después de que el teléfono aplicara TOTALS_ONLY
 * (secuencia 1). Comprueba que un envío atrasado no restablece el acceso y que repetir el mismo
 * operation_id devuelve lo mismo. No cambia el estado si el servidor se comporta según E4 §4.2.
 */
const L = require("./e4_lib.cjs");
const calls = require("../../docs/evidence/E4/datos/03_convocatorias.json").calls;
(async () => {
  const id = calls.CM1.call_ref;
  const t = await L.farmer("F1");
  const H = { "X-Joint-Purchase-Contract": "4" };
  const op = L.randomUUID();
  const body = { operation_id: op, sequence: 1, scope: "ADMINISTRATION", consent: { version: "CONV-4", decided_at: new Date(Date.now() - 3600e3).toISOString() } };
  const out = [];
  const pick = (r) => ({ status: r.status, errorCode: r.body?.errorCode ?? null, scope: r.body?.participation?.consent_scope?.scope ?? r.body?.current?.consent_scope?.scope ?? null });
  out.push({ what: "decisión ADMINISTRATION atrasada (secuencia 1, ya usada por TOTALS_ONLY)", ...pick(await L.call(t, "POST", `/me/joint-purchase-calls/${id}/participation/consent`, body, H)) });
  out.push({ what: "el mismo envío repetido (mismo operation_id y cuerpo)", ...pick(await L.call(t, "POST", `/me/joint-purchase-calls/${id}/participation/consent`, body, H)) });
  out.push({ what: "mismo operation_id con otro cuerpo (TOTALS_ONLY)", ...pick(await L.call(t, "POST", `/me/joint-purchase-calls/${id}/participation/consent`, { ...body, scope: "TOTALS_ONLY" }, H)) });
  const pa = await L.call(await L.institutional("A1"), "GET", `/joint-purchase-calls/${id}/participants`);
  out.push({ what: "A1 participantes de CM1 después", status: pa.status, names: (pa.body?.participants ?? []).map((p) => p.name.split(" ")[0]), pending_consent_count: pa.body?.pending_consent_count });
  process.stdout.write(`${JSON.stringify(out, null, 1)}\n`);
})().catch((e) => { process.stderr.write(`ERROR ${e.message}\n`); process.exitCode = 1; }).finally(() => L.db.$disconnect());
