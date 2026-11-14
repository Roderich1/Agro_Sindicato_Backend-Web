// Cuerpo literal de GET /api/v1/sync/v1/references de un agricultor de la Central ET1
// (sesión v2 + registro de cliente, como la app). Sólo datos sintéticos; la contraseña
// de un solo uso vive en memoria y la sesión se cierra al terminar.
// Se ejecuta desde Back/:  node references_e1.cjs <agricultorN> <salida.json>
// Entorno: DEMO_PG_ADMIN_URL, DEMO_API.
const { createRequire } = require("node:module");
const { randomBytes, randomUUID } = require("node:crypto");
const { resolve } = require("node:path");
const { writeFileSync } = require("node:fs");
const req = createRequire(resolve(process.cwd(), "package.json"));
const { PrismaClient } = req("@prisma/client");
const bcrypt = req("bcrypt");

const [farmerKey, outPath] = process.argv.slice(2);
const API = process.env.DEMO_API || "http://127.0.0.1:3350/api/v1";
const DB_URL = (() => { const u = new URL(process.env.DEMO_PG_ADMIN_URL); u.pathname = "/agro_demo"; return u.toString(); })();
const call = async (method, path, { token, body } = {}) => {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  return { status: r.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
};
const must = (r, ok, what) => { if (!ok.includes(r.status)) throw new Error(`${what}: HTTP ${r.status}`); return r; };

(async () => {
  const db = new PrismaClient({ datasources: { db: { url: DB_URL } } });
  const adminPw = randomBytes(18).toString("base64url");
  await db.user.update({ where: { email: "admin.demo@example.test" }, data: { passwordHash: await bcrypt.hash(adminPw, 10) } });
  const admin = must(await call("POST", "/auth/login", { body: { email: "admin.demo@example.test", password: adminPw } }), [200, 201], "login admin").json.accessToken;
  const email = `${farmerKey}.demo@example.test`;
  const farmer = await db.user.findUnique({ where: { email } });
  const pw = randomBytes(18).toString("base64url");
  must(await call("PATCH", `/users/${farmer.id}/password`, { token: admin, body: { password: pw } }), [200, 204], "contraseña");
  const login = must(await call("POST", "/auth/v2/login", { body: { email, password: pw, refreshTransport: "BODY" } }), [200], "login v2").json;
  const reg = must(await call("POST", "/auth/clients", { token: login.accessToken, body: { clientId: randomUUID() } }), [200, 201], "cliente").json;
  must(await call("POST", "/auth/v2/session/client", { token: login.accessToken, body: { registrationId: reg.registrationId } }), [200, 201], "vínculo");
  const refs = must(await call("GET", "/sync/v1/references", { token: login.accessToken }), [200], "references");
  writeFileSync(outPath, refs.text);
  await call("POST", "/auth/v2/logout", { body: { refreshToken: login.refreshToken } });
  await db.$disconnect();
  console.log(`references de ${farmerKey}: ${refs.json.campaigns.length} campañas, ${refs.json.products.length} productos → ${outPath}`);
})().catch((e) => { console.error(`ERROR ${e.message}`); process.exit(1); });
