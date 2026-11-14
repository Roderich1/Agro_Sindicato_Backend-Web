// Recorrido del AGRICULTOR por la API real del entorno aislado ET1 (etapa 1): sesión v2 +
// registro de cliente (como una instalación de la app), PUT de solicitudes de
// identificación, foto, idempotencia, retiro y lectura. Sólo datos sintéticos; la
// contraseña de un solo uso vive en memoria. Se ejecuta desde Back/ (usa sus dependencias).
//   node farmer_e1.cjs <png-de-prueba> <salida.json>
// Entorno: DEMO_PG_ADMIN_URL, DEMO_API.
const { createRequire } = require("node:module");
const { createHash, randomBytes, randomUUID } = require("node:crypto");
const { resolve } = require("node:path");
const { readFileSync, writeFileSync } = require("node:fs");
const req = createRequire(resolve(process.cwd(), "package.json"));
const { PrismaClient } = req("@prisma/client");
const bcrypt = req("bcrypt");

const [pngPath, outPath = "farmer_e1.json"] = process.argv.slice(2);
const API = process.env.DEMO_API || "http://127.0.0.1:3350/api/v1";
const ADMIN = { email: "admin.demo@example.test" };
const FARMER = { key: "agricultor15", email: "agricultor15.demo@example.test" };
const DB_URL = (() => { const u = new URL(process.env.DEMO_PG_ADMIN_URL); u.pathname = "/agro_demo"; return u.toString(); })();
const out = { steps: [] };
const step = (name, r, extra = {}) => { const row = { name, status: r.status, code: r.json?.errorCode ?? null, ...extra }; out.steps.push(row); console.log(JSON.stringify(row)); return r; };

async function call(method, path, { token, body, raw, headers } = {}) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const response = await fetch(`${API}${path}`, {
      method,
      headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(raw ? { "Content-Type": "application/octet-stream" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(headers ?? {}) },
      body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
    if (response.status === 429) { await new Promise((d) => setTimeout(d, 1000 * (Number(response.headers.get("retry-after")) || 30) + 500)); continue; }
    const text = await response.text();
    let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* sin JSON */ }
    return { status: response.status, json, headers: response.headers };
  }
  throw new Error(`${method} ${path}: 429 persistente`);
}
const must = (r, ok, what) => { if (!ok.includes(r.status)) throw new Error(`${what}: HTTP ${r.status} ${r.json?.errorCode ?? ""}`); return r.json; };

(async () => {
  const db = new PrismaClient({ datasources: { db: { url: DB_URL } } });
  // Administrador: contraseña de un solo uso (hash directo en la base sintética), login v1.
  const adminPw = randomBytes(18).toString("base64url");
  await db.user.update({ where: { email: ADMIN.email }, data: { passwordHash: await bcrypt.hash(adminPw, 10) } });
  const adminToken = must(await call("POST", "/auth/login", { body: { email: ADMIN.email, password: adminPw } }), [200, 201], "login admin").accessToken;
  // Agricultor 15: contraseña de un solo uso por la API, sesión v2 BODY, registro de cliente y vínculo.
  const farmer = await db.user.findUnique({ where: { email: FARMER.email } });
  const farmerPw = randomBytes(18).toString("base64url");
  must(await call("PATCH", `/users/${farmer.id}/password`, { token: adminToken, body: { password: farmerPw } }), [200, 204], "contraseña agricultor");
  const login = must(await call("POST", "/auth/v2/login", { body: { email: FARMER.email, password: farmerPw, refreshTransport: "BODY" } }), [200], "login v2");
  const reg = must(await call("POST", "/auth/clients", { token: login.accessToken, body: { clientId: randomUUID() } }), [200, 201], "cliente");
  must(await call("POST", "/auth/v2/session/client", { token: login.accessToken, body: { registrationId: reg.registrationId } }), [200, 201], "vínculo de cliente");
  const T = login.accessToken;
  const base = "/catalog/identification-requests";
  const ids = { conFoto: randomUUID(), nuevo: randomUUID(), pendiente: randomUUID() };
  out.ids = ids;
  const now = new Date().toISOString();

  // 1. Solicitud con consentimiento de foto (nombre parecido a un producto del catálogo).
  const body1 = { contractVersion: 1, local_name: "Herbicida 48 SL del agro (etiqueta)", active_ingredient: "Glifosato", unit: "L", photo_consent: { version: "FOTO-1", accepted_at: now } };
  step("PUT solicitud 1 (con consentimiento)", await call("PUT", `${base}/${ids.conFoto}`, { token: T, body: body1 }));
  step("PUT solicitud 1 reenvío idéntico (idempotente)", await call("PUT", `${base}/${ids.conFoto}`, { token: T, body: body1 }));
  step("PUT solicitud 1 con unidad distinta (inmutable)", await call("PUT", `${base}/${ids.conFoto}`, { token: T, body: { ...body1, unit: "KG" } }));
  step("PUT con clave extra (rechazo cerrado)", await call("PUT", `${base}/${randomUUID()}`, { token: T, body: { ...body1, local_id: 7 } }));
  // 2. Foto: antes del consentimiento (otra solicitud), tipo falso, hash distinto, válida, misma (no-op), retiro.
  const png = readFileSync(pngPath);
  const sha = createHash("sha256").update(png).digest("hex");
  const body2 = { contractVersion: 1, local_name: "Fertilizante foliar artesanal ZZ", active_ingredient: null, unit: "KG", photo_consent: null };
  step("PUT solicitud 2 (sin consentimiento de foto)", await call("PUT", `${base}/${ids.nuevo}`, { token: T, body: body2 }));
  step("PUT foto sin consentimiento → 409", await call("PUT", `${base}/${ids.nuevo}/photo`, { token: T, raw: png, headers: { "X-Content-SHA256": sha } }));
  const fake = Buffer.from("no soy una imagen aunque lo diga el nombre");
  step("PUT foto con tipo falso → 422", await call("PUT", `${base}/${ids.conFoto}/photo`, { token: T, raw: fake, headers: { "X-Content-SHA256": createHash("sha256").update(fake).digest("hex") } }));
  step("PUT foto con hash distinto → 422", await call("PUT", `${base}/${ids.conFoto}/photo`, { token: T, raw: png, headers: { "X-Content-SHA256": "0".repeat(64) } }));
  const okPhoto = step("PUT foto válida → 201", await call("PUT", `${base}/${ids.conFoto}/photo`, { token: T, raw: png, headers: { "X-Content-SHA256": sha } }));
  out.photoView = okPhoto.json?.photo ?? null;
  step("PUT misma foto → 200 sin reescribir", await call("PUT", `${base}/${ids.conFoto}/photo`, { token: T, raw: png, headers: { "X-Content-SHA256": sha } }));
  step("PUT foto como JSON → 415", await call("PUT", `${base}/${ids.conFoto}/photo`, { token: T, body: { data: "x" } }));
  // 3. Tercera solicitud (para «dejar pendiente» en la Web).
  step("PUT solicitud 3", await call("PUT", `${base}/${ids.pendiente}`, { token: T, body: { contractVersion: 1, local_name: "Polvo azul sin etiqueta", active_ingredient: null, unit: "KG", photo_consent: null } }));
  // 4. Lectura propia: ¿aparece la identidad? ¿cuántas?
  const list = step("GET propias", await call("GET", base, { token: T }));
  const text = JSON.stringify(list.json);
  out.ownList = { count: list.json?.requests?.length ?? null, leaksEmail: /@/.test(text), leaksMember: /memberId|member_id/.test(text) };
  console.log(JSON.stringify(out.ownList));
  // 5. El agricultor NO puede usar rutas institucionales.
  step("GET /{id}/candidates como agricultor → 401/403", await call("GET", `${base}/${ids.conFoto}/candidates`, { token: T }));
  step("GET propias con ?status (agricultor) → 400", await call("GET", `${base}?status=PENDING`, { token: T }));
  await db.$disconnect();
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`listo: ${outPath}`);
})().catch((e) => { console.error(`ERROR: ${String(e).slice(0, 300)}`); writeFileSync(outPath, JSON.stringify(out, null, 2)); process.exit(1); });
