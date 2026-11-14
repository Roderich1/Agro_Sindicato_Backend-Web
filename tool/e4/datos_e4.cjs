/**
 * Verificación E4 (2026-11-13): crea por la API REAL (3400) las convocatorias
 * y las aportaciones colectivas sintéticas de la verificación, sobre el tenant
 * sembrado por `Back/scripts/e4-acc-synthetic-walk.cjs` (E4_LABEL).
 *
 *   node tool/e4/datos_e4.cjs crear     → imprime JSON con referencias y estados (sin secretos)
 *   node tool/e4/datos_e4.cjs aportes    → sólo las aportaciones colectivas (sync v1 push)
 *   node tool/e4/datos_e4.cjs leer <call_id> <D1|A1|…>   → detalle resumido
 *
 * Convocatorias (cantidades en unidades base: ML para L, G para kg):
 *  CA «E4V Abierta D1»       resp. D1 (Directiva). F1 CONV-4 [P1 1000, P2 2000]; F2 CONV-3 [P2 3000]
 *  CB «E4V Cerrada A1»       resp. A1 (Admin). F1 CONV-3 [P1 1000, P2 500]; F2 CONV-4 [P1 2000];
 *                            F3 CONV-1 [P1 3000, P2 700]; cerrada por A1
 *  CC «E4V Abierta D3»       resp. D3 (Directiva creada por A1). F2 CONV-4 [P1 1500]; F3 CONV-1 [P2 800]
 *  CD «E4V Cerrada D3»       resp. D3. F1 CONV-4 [P1 1200]; F2 CONV-4 [P1 1300]; cerrada por D3
 *  CM1 «E4V Movil nueva»     resp. A2. F2 CONV-4 [P1 1000] (F1 participará desde el teléfono)
 *  CM2 «E4V Movil anterior»  resp. A2. F1 CONV-3 con contrato 3 [P1 2000] (escritura de una app anterior)
 *  CX «E4V Cancelada»        resp. D1. F1 CONV-3 [P1 900]; cancelada por D1
 * Después D3 queda DESHABILITADA (PATCH /users/:id/deactivate por A1): CC y CD
 * tienen la responsable no habilitada.
 * Colectivo (sync v1 push, DECLARED_NEED): P1 sólo F1 (1 aportante); P2 F1 y F2 (2 aportantes).
 * Consumo (CONSUMPTION_TOTAL): P1 F1.
 */
const L = require("./e4_lib.cjs");

const out = { label: L.LABEL, created_at: new Date().toISOString(), calls: {}, steps: [] };
const step = (what, r, extract) => {
  out.steps.push({ what, status: r.status, ...(extract !== undefined ? { extract } : {}) });
  return r;
};
const must = (r, ok, what) => {
  if (!ok.includes(r.status)) throw new Error(`${what}: HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
  return r.body;
};
const totals = (b) => (b?.products ?? []).map((p) => [p.name.split(" ")[0], p.totals?.participant_count, p.totals?.total_quantity_base, p.totals?.visibility, p.totals?.totals_basis]);

/** Productos propios de cada convocatoria (un producto sólo puede estar en una convocatoria abierta). */
async function productsFor(s, key) {
  if (key === "CA") return { P1: s.P1, P2: s.P2 };
  const A1 = await L.institutional("A1");
  const pair = {};
  for (const [code, name, unit] of [["P1", `Herbicida E4V ${key}`, "L"], ["P2", `Fertilizante E4V ${key}`, "kg"]]) {
    let p = await L.db.product.findFirst({ where: { tenantId: s.tenant.id, name } });
    if (!p) {
      const r = await L.call(A1, "POST", "/inventory/products", { name, category: code === "P1" ? "Herbicida" : "Fertilizante", unit });
      step(`A1 crea el producto ${name} (POST /inventory/products)`, r, { unit: r.body?.unit });
      must(r, [200, 201], `producto ${name}`);
      p = await L.db.product.findFirst({ where: { tenantId: s.tenant.id, name } });
    }
    pair[code] = p;
  }
  return pair;
}

async function createCall(s, key, name, respCode, contributions, after) {
  const D = await L.institutional(respCode);
  const pr = await productsFor(s, key);
  const products = [{ product_ref: pr.P1.id }, { product_ref: pr.P2.id }];
  const existing = await L.db.jointPurchaseCall.findFirst({ where: { tenantId: s.tenant.id, name } });
  let id;
  if (existing && existing.status !== "DRAFT") {
    out.calls[key] = { call_ref: existing.id, name, responsible: respCode, reused: true };
    return existing.id;
  }
  if (existing) {
    id = existing.id;
    must(step(`${key} actualiza el borrador existente con sus productos (${respCode})`, await L.call(D, "PATCH", `/joint-purchase-calls/${id}`, { products })), [200], `${key} patch`);
  } else {
    const created = must(
      step(`${key} crea borrador (${respCode})`, await L.call(D, "POST", "/joint-purchase-calls", {
        campaign_id: s.campaign.id,
        name,
        deadline_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        responsible_user_id: s.users[respCode].id,
        products,
      })),
      [201],
      `${key} crear`,
    );
    id = created.call_id;
  }
  out.calls[key] = { call_ref: id, name, responsible: respCode };
  must(step(`${key} abre`, await L.call(D, "POST", `/joint-purchase-calls/${id}/open`, { confirmed: true })), [200], `${key} abrir`);
  for (const [farmerCode, consent, contract, lines] of contributions) {
    const t = await L.farmer(farmerCode);
    const headers = contract ? { "X-Joint-Purchase-Contract": contract } : {};
    const r = await L.call(t, "PUT", `/me/joint-purchase-calls/${id}/participation`, {
      operation_id: L.randomUUID(),
      sequence: 1,
      consent: { version: consent, accepted_at: new Date().toISOString() },
      lines: lines.map(([p, q]) => ({ product_ref: pr[p].id, quantity_base: q })),
    }, headers);
    step(`${key} ${farmerCode} confirma con ${consent} (contrato ${contract ?? "1"})`, r, {
      contractVersion: r.body?.contractVersion,
      scope: r.body?.participation?.consent_scope?.scope ?? null,
    });
    must(r, [200], `${key} ${farmerCode}`);
  }
  if (after) await after(id, D);
  return id;
}

async function crear() {
  const s = await L.ids();
  const A1 = await L.institutional("A1");
  // D3: Directiva creada por la Administración por la API (será la responsable deshabilitada).
  let d3 = await L.db.user.findUnique({ where: { email: L.emailOf("D3") } });
  if (!d3) {
    const r = await L.call(A1, "POST", "/users", {
      name: `D3 sintético ${L.LABEL}`,
      email: L.emailOf("D3"),
      password: require("node:crypto").randomBytes(18).toString("base64url"),
      role: "DIRECTIVA",
    });
    step("A1 crea la Directiva D3 (POST /users)", r, { role: r.body?.role });
    must(r, [200, 201], "crear D3");
    s.users.D3 = await L.db.user.findUnique({ where: { email: L.emailOf("D3") } });
  } else s.users.D3 = d3;

  await createCall(s, "CA", "E4V Abierta D1", "D1", [
    ["F1", "CONV-4", "4", [["P1", "1000"], ["P2", "2000"]]],
    ["F2", "CONV-3", "3", [["P2", "3000"]]],
  ]);
  await createCall(s, "CB", "E4V Cerrada A1", "A1", [
    ["F1", "CONV-3", "3", [["P1", "1000"], ["P2", "500"]]],
    ["F2", "CONV-4", "4", [["P1", "2000"]]],
    ["F3", "CONV-1", null, [["P1", "3000"], ["P2", "700"]]],
  ], async (id, D) => {
    const r = step("CB cierra A1", await L.call(D, "POST", `/joint-purchase-calls/${id}/close`, { confirmed: true }), undefined);
    must(r, [200], "CB cerrar");
    out.steps[out.steps.length - 1].extract = { lines: r.body?.lines?.map((l) => [l.participant_count, l.total_quantity_base, l.visibility, l.totals_basis]), participants: (r.body?.participants ?? null)?.length ?? null };
  });
  await createCall(s, "CC", "E4V Abierta D3", "D3", [
    ["F2", "CONV-4", "4", [["P1", "1500"]]],
    ["F3", "CONV-1", null, [["P2", "800"]]],
  ]);
  await createCall(s, "CD", "E4V Cerrada D3", "D3", [
    ["F1", "CONV-4", "4", [["P1", "1200"]]],
    ["F2", "CONV-4", "4", [["P1", "1300"]]],
  ], async (id, D) => {
    must(step("CD cierra D3", await L.call(D, "POST", `/joint-purchase-calls/${id}/close`, { confirmed: true })), [200], "CD cerrar");
  });
  await createCall(s, "CM1", "E4V Movil nueva", "A2", [["F2", "CONV-4", "4", [["P1", "1000"]]]]);
  await createCall(s, "CM2", "E4V Movil anterior", "A2", [["F1", "CONV-3", "3", [["P1", "2000"]]]]);
  await createCall(s, "CX", "E4V Cancelada", "D1", [["F1", "CONV-3", "3", [["P1", "900"]]]], async (id, D) => {
    must(step("CX cancela D1", await L.call(D, "POST", `/joint-purchase-calls/${id}/cancel`, { confirmed: true, reason: "Cancelada para la verificacion E4" })), [200], "CX cancelar");
  });

  // D3 deshabilitada por la Administración (API real).
  const r = await L.call(A1, "PATCH", `/users/${s.users.D3.id}/deactivate`);
  step("A1 deshabilita a D3 (PATCH /users/:id/deactivate)", r, { isActive: r.body?.isActive });
  must(r, [200], "deshabilitar D3");

  await aportes(s);

  for (const key of Object.keys(out.calls)) {
    for (const code of ["D1", "A1"]) {
      const d = await L.call(await L.institutional(code), "GET", `/joint-purchase-calls/${out.calls[key].call_ref}`);
      out.calls[key][`detalle_${code}`] = { status: d.status, state: d.body?.status, pending_consent_count: d.body?.pending_consent_count, can_view_participants: d.body?.can_view_participants, can_substitute_responsible: d.body?.can_substitute_responsible, totals: totals(d.body) };
    }
  }
  out.campaign_ref = s.campaign.id;
  process.stdout.write(`${JSON.stringify(out, null, 1)}\n`);
}

async function aportes(s0) {
  const s = s0 ?? (await L.ids());
  // Aportaciones colectivas por sync v1 (DECLARED_NEED y CONSUMPTION_TOTAL).
  const pushes = [
    ["F1", "DECLARED_NEED", s.P1, "5000"],
    ["F1", "DECLARED_NEED", s.P2, "4000"],
    ["F2", "DECLARED_NEED", s.P2, "6000"],
    ["F1", "CONSUMPTION_TOTAL", s.P1, "2000"],
  ];
  for (const [code, projectionType, product, q] of pushes) {
    const t = await L.farmer(code);
    const r2 = await L.call(t, "POST", "/sync/v1/push", {
      contractVersion: 1,
      operationId: L.randomUUID(),
      projectionType,
      action: "PUBLISH",
      causal: { predecessorOperationId: null, reconciliationReference: null },
      payload: { campaign_ref: s.campaign.id, product_ref: product.id, base_unit: product.unit === "L" ? "ML" : "G", quantity_base: q },
    });
    step(`push ${code} ${projectionType} ${product.name.split(" ")[0]} ${q}`, r2, { outcome: r2.body?.outcome, code: r2.body?.code });
    await L.sleep(3200);
  }

}

async function aportesCmd() {
  await aportes();
  process.stdout.write(`${JSON.stringify(out, null, 1)}
`);
}

async function leer(id, code) {
  const d = await L.call(await L.institutional(code), "GET", `/joint-purchase-calls/${id}`);
  process.stdout.write(`${JSON.stringify({ status: d.status, state: d.body?.status, responsible: d.body?.responsible?.name, version: d.body?.responsible?.version, pending_consent_count: d.body?.pending_consent_count, totals: totals(d.body) }, null, 1)}\n`);
}

const [cmd, a, b] = process.argv.slice(2);
(cmd === "crear" ? crear() : cmd === "aportes" ? aportesCmd() : cmd === "leer" ? leer(a, b) : Promise.reject(new Error("orden: crear | leer <id> <rol>")))
  .catch((e) => {
    process.stderr.write(`ERROR ${e.message}\n`);
    process.stdout.write(`${JSON.stringify(out, null, 1)}\n`);
    process.exitCode = 1;
  })
  .finally(() => L.db.$disconnect());
