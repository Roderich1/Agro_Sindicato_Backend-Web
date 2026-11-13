/**
 * Verificación E4 (2026-11-13): utilidades comunes de las herramientas de
 * `tool/e4/`. Todo es SINTÉTICO y local (API 3400, base `acc_api` en 15440).
 *
 * Secretos: cada inicio de sesión fija una contraseña NUEVA de un solo uso
 * (aleatoria, sólo en la memoria del proceso) en la cuenta sintética y la usa
 * en el acto; nunca se imprime ni se escribe. Los tokens tampoco salen del
 * proceso. Las cuentas las crea `Back/scripts/e4-acc-synthetic-walk.cjs`
 * (etiqueta en E4_LABEL); su E4_PASSWORD inicial se generó en la shell y se
 * descartó al terminar la siembra.
 *
 * Entorno: E4_BACK_DIR (Back/ con node_modules y el cliente Prisma de E4;
 * por defecto _wt/ACC-A/Back), E4_DB_URL, E4_API (http://127.0.0.1:3400), E4_LABEL.
 */
const { createRequire } = require("node:module");
const { randomBytes, randomUUID } = require("node:crypto");
const path = require("node:path");

const ROOT = "C:/Users/MSI/Documents/ProyectoDeGrado/ProyectoAgro";
const BACK = process.env.E4_BACK_DIR ?? `${ROOT}/_wt/ACC-A/Back`;
const DB_URL = process.env.E4_DB_URL ?? "postgresql://postgres@127.0.0.1:15440/acc_api?schema=public";
const API = (process.env.E4_API ?? "http://127.0.0.1:3400").replace(/\/$/, "");
const LABEL = process.env.E4_LABEL ?? "VER1";
if (!["127.0.0.1", "localhost"].includes(new URL(DB_URL).hostname)) throw new Error("Rechazado: la base no es local");
if (!/^http:\/\/127\.0\.0\.1:3400$/.test(API)) throw new Error("Rechazado: sólo la API E4 3400");

const backRequire = createRequire(path.join(BACK, "package.json"));
const { PrismaClient } = backRequire("@prisma/client");
const bcrypt = backRequire("bcrypt");
const db = new PrismaClient({ datasources: { db: { url: DB_URL } } });

const emailOf = (code) => `e4-${LABEL.toLowerCase()}-${code.toLowerCase()}@example.test`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Contraseña nueva de un solo uso en la cuenta (sólo en memoria). */
async function oneTimePassword(email) {
  const password = randomBytes(18).toString("base64url");
  await db.user.update({ where: { email }, data: { passwordHash: await bcrypt.hash(password, 10) } });
  return password;
}

/** HTTP contra la API 3400 con reintento en 429 (límite de 20/min por ruta y 5/min en el login). */
async function call(token, method, apiPath, body, headers = {}) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const h = { ...headers };
    if (token) h.Authorization = `Bearer ${token}`;
    if (body !== undefined) h["Content-Type"] = "application/json";
    const res = await fetch(`${API}/api/v1${apiPath}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    if (res.status === 429) {
      await sleep(1000 * (Number(res.headers.get("retry-after")) || 20) + 500);
      continue;
    }
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { status: res.status, body: json };
  }
  throw new Error(`${method} ${apiPath}: 429 persistente`);
}

async function loginV2(email) {
  const password = await oneTimePassword(email);
  const r = await call(null, "POST", "/auth/v2/login", { email, password, refreshTransport: "BODY" });
  if (r.status !== 200 || !r.body?.accessToken) throw new Error(`login fallido de una cuenta sintética (${r.status} ${r.body?.errorCode ?? r.body?.message ?? ""})`);
  return r.body.accessToken;
}

const tokens = new Map();
/** Sesión institucional (Directiva o Administración). */
async function institutional(code) {
  if (!tokens.has(code)) tokens.set(code, { token: await loginV2(emailOf(code)), at: Date.now() });
  return tokens.get(code).token;
}
/** Sesión del agricultor como una instalación de la app: login V2 BODY + registro de cliente + vínculo. */
async function farmer(code) {
  if (tokens.has(code)) return tokens.get(code).token;
  const token = await loginV2(emailOf(code));
  const reg = await call(token, "POST", "/auth/clients", { clientId: randomUUID() });
  if (![200, 201].includes(reg.status)) throw new Error(`registro de cliente ${code}: ${reg.status}`);
  const bind = await call(token, "POST", "/auth/v2/session/client", { registrationId: reg.body.registrationId });
  if (![200, 201].includes(bind.status)) throw new Error(`vínculo ${code}: ${bind.status}`);
  tokens.set(code, { token, at: Date.now() });
  return token;
}

async function ids() {
  const tenant = await db.tenant.findFirst({ where: { slug: `e4-${LABEL.toLowerCase()}` } });
  if (!tenant) throw new Error(`no existe el tenant e4-${LABEL}`);
  const users = await db.user.findMany({ where: { tenantId: tenant.id }, select: { id: true, email: true, name: true, role: true } });
  const byCode = Object.fromEntries(users.map((u) => [u.email.split("@")[0].split("-").pop().toUpperCase(), u]));
  const campaign = await db.agriculturalCampaign.findFirst({ where: { tenantId: tenant.id }, orderBy: { createdAt: "asc" } });
  const products = await db.product.findMany({ where: { tenantId: tenant.id }, orderBy: { name: "asc" } });
  const P1 = products.find((p) => p.name.startsWith("Herbicida"));
  const P2 = products.find((p) => p.name.startsWith("Fertilizante"));
  return { tenant, users: byCode, campaign, P1, P2 };
}

module.exports = { db, call, institutional, farmer, ids, emailOf, oneTimePassword, sleep, LABEL, API, randomUUID };
