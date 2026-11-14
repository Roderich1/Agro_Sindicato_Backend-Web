// Participación de un agricultor SINTÉTICO en una convocatoria abierta, por la API real (sesión v2
// + registro de cliente, como la app), con el consentimiento CONV-1. La contraseña de un solo
// uso vive en memoria. Se ejecuta desde Back/:
//   node participate_e2.cjs <agricultorN> <call_id> <producto=litros>[,producto=litros...]
// Entorno: DEMO_PG_ADMIN_URL, DEMO_API.
const { createRequire } = require("node:module");
const { randomBytes, randomUUID } = require("node:crypto");
const { resolve } = require("node:path");
const req = createRequire(resolve(process.cwd(), "package.json"));
const { PrismaClient } = req("@prisma/client");
const bcrypt = req("bcrypt");

const [farmerKey, callId, spec] = process.argv.slice(2);
const API = process.env.DEMO_API || "http://127.0.0.1:3350/api/v1";
const DB_URL = (() => { const u = new URL(process.env.DEMO_PG_ADMIN_URL); u.pathname = "/agro_demo"; return u.toString(); })();
const call = async (method, path, { token, body } = {}) => {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  return { status: r.status, json: (() => { try { return JSON.parse(t); } catch { return null; } })() };
};
const must = (r, ok, what) => { if (!ok.includes(r.status)) throw new Error(`${what}: HTTP ${r.status} ${r.json?.errorCode ?? ""}`); return r.json; };

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
  const list = must(await call("GET", "/me/joint-purchase-calls", { token: login.accessToken }), [200], "lista");
  const target = list.calls.find((c) => c.call_id === callId);
  if (!target) throw new Error("convocatoria no visible para este agricultor");
  const lines = spec.split(",").map((pair) => {
    const [name, liters] = pair.split("=");
    const product = target.products.find((p) => p.name === name);
    if (!product) throw new Error(`producto ${name} no está en la convocatoria`);
    return { product_ref: product.product_ref, quantity_base: String(Math.round(Number(liters) * 1000)) };
  });
  // E2 §10.2: CONV-2 es el vigente; E2_CONSENT=CONV-1 simula un teléfono sin actualizar.
  const consentVersion = process.env.E2_CONSENT || list.consent?.version || "CONV-2";
  const body = { operation_id: randomUUID(), sequence: 1, consent: { version: consentVersion, accepted_at: new Date().toISOString() }, lines };
  const first = await call("PUT", `/me/joint-purchase-calls/${callId}/participation`, { token: login.accessToken, body });
  const retry = await call("PUT", `/me/joint-purchase-calls/${callId}/participation`, { token: login.accessToken, body });
  console.log(JSON.stringify({ farmer: farmerKey, consent: consentVersion, first: first.status, outcome: first.json?.outcome ?? first.json?.errorCode, retry_same_operation: retry.status, same_participation: JSON.stringify(first.json) === JSON.stringify(retry.json) }));
  await call("POST", "/auth/v2/logout", { body: { refreshToken: login.refreshToken } });
  await db.$disconnect();
})().catch((e) => { console.error(`ERROR ${e.message}`); process.exit(1); });
