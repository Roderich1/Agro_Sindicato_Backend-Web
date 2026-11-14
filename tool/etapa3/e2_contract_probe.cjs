// N7 y P-C (E2 §11) por la API real del entorno AISLADO, con un agricultor SINTÉTICO (sesión v2 +
// registro de cliente, como la app). Imprime sólo formas y resultados: nunca credenciales,
// nombres ni cantidades. Las contraseñas son de un solo uso y viven en memoria. Desde Back/:
//   node ../tool/etapa3/e2_contract_probe.cjs <agricultorN> shape
//   node ../tool/etapa3/e2_contract_probe.cjs <agricultorN> decide <call_id> <COLLABORATORS|RESPONSIBLE_ONLY> <sequence> [version]
//   node ../tool/etapa3/e2_contract_probe.cjs <agricultorN> modify <call_id> <producto=litros> <sequence> [CONV-1]
// Entorno: DEMO_PG_ADMIN_URL, DEMO_API (tool/etapa3/e3env.sh).
const { createRequire } = require("node:module");
const { randomBytes, randomUUID } = require("node:crypto");
const { resolve } = require("node:path");
const req = createRequire(resolve(process.cwd(), "package.json"));
const { PrismaClient } = req("@prisma/client");
const bcrypt = req("bcrypt");

const [farmerKey, mode, ...rest] = process.argv.slice(2);
const API = process.env.DEMO_API || "http://127.0.0.1:3350/api/v1";
const DB_URL = (() => { const u = new URL(process.env.DEMO_PG_ADMIN_URL); u.pathname = "/agro_demo"; return u.toString(); })();
const call = async (method, path, { token, body, contract } = {}) => {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(contract ? { "X-Joint-Purchase-Contract": String(contract) } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  return { status: r.status, json: (() => { try { return JSON.parse(t); } catch { return null; } })() };
};
const must = (r, ok, what) => { if (!ok.includes(r.status)) throw new Error(`${what}: HTTP ${r.status} ${r.json?.errorCode ?? ""}`); return r.json; };
// El diario guarda la respuesta en jsonb (reordena claves): se compara en forma canónica.
const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));
const scopeOf = (p) => (p ? { status: p.status, consent: p.consent?.version, scope: p.consent_scope ?? "(sin consent_scope)" } : null);

(async () => {
  const db = new PrismaClient({ datasources: { db: { url: DB_URL } } });
  const adminPw = randomBytes(18).toString("base64url");
  await db.user.update({ where: { email: "admin.demo@example.test" }, data: { passwordHash: await bcrypt.hash(adminPw, 10) } });
  const admin = must(await call("POST", "/auth/login", { body: { email: "admin.demo@example.test", password: adminPw } }), [200, 201], "login admin").accessToken;
  const email = `${farmerKey}.demo@example.test`;
  const farmer = await db.user.findUnique({ where: { email } });
  const pw = randomBytes(18).toString("base64url");
  must(await call("PATCH", `/users/${farmer.id}/password`, { token: admin, body: { password: pw } }), [200, 204], "contraseña");
  const login = must(await call("POST", "/auth/v2/login", { body: { email, password: pw, refreshTransport: "BODY" } }), [200], "login v2");
  const reg = must(await call("POST", "/auth/clients", { token: login.accessToken, body: { clientId: randomUUID() } }), [200, 201], "cliente");
  must(await call("POST", "/auth/v2/session/client", { token: login.accessToken, body: { registrationId: reg.registrationId } }), [200, 201], "vínculo");
  const token = login.accessToken;
  try {
    if (mode === "shape") {
      const legacy = must(await call("GET", "/me/joint-purchase-calls", { token }), [200], "lista sin cabecera");
      const v2 = must(await call("GET", "/me/joint-purchase-calls", { token, contract: 2 }), [200], "lista contrato 2");
      const mine = (list) => list.calls.filter((c) => c.participation).map((c) => ({ call: c.call_id.slice(0, 8), ...scopeOf(c.participation), participation_keys: Object.keys(c.participation).sort().join(",") }));
      console.log(JSON.stringify({
        sin_cabecera: { root_keys: Object.keys(legacy).sort().join(","), contractVersion: legacy.contractVersion, consent: legacy.consent.version, participations: mine(legacy) },
        contrato_2: { root_keys: Object.keys(v2).sort().join(","), contractVersion: v2.contractVersion, consent: v2.consent.version, participations: mine(v2) },
      }, null, 1));
    } else if (mode === "decide") {
      const [callId, scope, sequence, version] = rest;
      const body = { operation_id: randomUUID(), sequence: Number(sequence), scope, consent: { version: version || "CONV-3", decided_at: new Date().toISOString() } };
      const r = await call("POST", `/me/joint-purchase-calls/${callId}/participation/consent`, { token, body, contract: 2 });
      const again = await call("POST", `/me/joint-purchase-calls/${callId}/participation/consent`, { token, body, contract: 2 });
      console.log(JSON.stringify({ decide: scope, sequence: Number(sequence), status: r.status, outcome: r.json?.outcome ?? r.json?.errorCode, participation: scopeOf(r.json?.participation), retry_same_operation: again.status, same_answer: canon(again.json) === canon(r.json) }));
    } else if (mode === "modify") {
      const [callId, spec, sequence, consent] = rest;
      const list = must(await call("GET", "/me/joint-purchase-calls", { token, contract: 2 }), [200], "lista");
      const target = list.calls.find((c) => c.call_id === callId);
      const lines = spec.split(",").map((pair) => {
        const [name, liters] = pair.split("=");
        const product = target.products.find((p) => p.name === name);
        return { product_ref: product.product_ref, quantity_base: String(Math.round(Number(liters) * 1000)) };
      });
      const body = { operation_id: randomUUID(), sequence: Number(sequence), ...(consent ? { consent: { version: consent, accepted_at: new Date().toISOString() } } : {}), lines };
      // Sin cabecera si simula un teléfono anterior (lleva consentimiento CONV-1).
      const r = await call("PUT", `/me/joint-purchase-calls/${callId}/participation`, { token, body, contract: consent === "CONV-1" ? undefined : 2 });
      console.log(JSON.stringify({ modify_with_consent: consent ?? "(ninguno)", status: r.status, outcome: r.json?.outcome ?? r.json?.errorCode, participation: scopeOf(r.json?.participation) }));
    }
  } finally {
    await call("POST", "/auth/v2/logout", { body: { refreshToken: login.refreshToken } });
    await db.$disconnect();
  }
})().catch((e) => { console.error(`ERROR ${e.message}`); process.exit(1); });
