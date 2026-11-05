// Experimento (2026-11-05): variante «threshold-only» de divulgación para la NECESIDAD
// DECLARADA, contra el Backend REAL de una copia sintética de la DEMO (PR #201). Nada se
// simula en el navegador: cada paso publica por POST /sync/v1/push (sesión v2 de cada
// agricultor sintético) y lee GET /collective/campaigns/:id/summary como la Directiva.
//
//   node ../tool/experiments/necesidad-umbral.cjs <nombre del producto>
//
// Se ejecuta desde Back/ (usa sus dependencias). Entorno: DEMO_PG_ADMIN_URL y DEMO_API
// de la copia (nunca la DEMO oficial), DEMO_SEED opcional. Derivado de tool/demo/demo-central.cjs:
// mismas identidades sintéticas, mismo arranque de identidad; las contraseñas de un solo
// uso viven sólo en memoria y no se imprimen.
//
// Secuencia (mL en unidad base; 1 L = 1000 mL): Beto 10 L, Carmen 15 L → oculto; Darío 5 L →
// 30 L con 3 aportantes; Elena 8 L → ¿38 L al instante? (variante) o 30 L con cambios
// pendientes (regla vigente); reenvío de Elena → no duplica; CANCEL de Elena → 30 L;
// CANCEL de Darío → menos de 3 → oculto de nuevo.

const { createRequire } = require("node:module");
const { createHash, randomBytes } = require("node:crypto");
const { resolve } = require("node:path");

const req = createRequire(resolve(process.cwd(), "package.json"));
const { PrismaClient } = req("@prisma/client");
const bcrypt = req("bcrypt");

const DATABASE = "agro_demo";
const TENANT_SLUG = "demo-sintetico";
const SEED = process.env.DEMO_SEED || "agrocuentas-demo-1";
const API = process.env.DEMO_API || "http://127.0.0.1:3341/api/v1";
const PRODUCT_NAME = process.argv[2] || "Acaricida VAR (DEMO)";
/** Último paso a ejecutar (1–7); por defecto, toda la secuencia. Útil para dejar la celda en 38 L y verla en la Web. */
const UNTIL = Number(process.argv[3] || 7);
const urlOf = (database) => {
  if (!process.env.DEMO_PG_ADMIN_URL) throw new Error("falta DEMO_PG_ADMIN_URL");
  const url = new URL(process.env.DEMO_PG_ADMIN_URL);
  url.pathname = `/${database}`;
  return url.toString();
};
const log = (text) => console.log(`${new Date().toISOString()} ${text}`);
function uuidFor(key) {
  const h = createHash("sha256").update(`${SEED}|${key}`).digest("hex");
  const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const ADMIN = { key: "admin", email: "admin.demo@example.test" };
const DIRECTIVA = { key: "directiva", email: "directiva.demo@example.test" };
const FARMER = (n, name) => ({ key: `agricultor${n}`, name, email: `agricultor${n}.demo@example.test` });
const BETO = FARMER(2, "Beto");
const CARMEN = FARMER(3, "Carmen");
const DARIO = FARMER(4, "Darío");
const ELENA = FARMER(5, "Elena");

async function call(method, path, { token, body } = {}) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const response = await fetch(`${API}${path}`, {
      method,
      headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (response.status === 429) {
      await new Promise((done) => setTimeout(done, 1000 * (Number(response.headers.get("retry-after")) || 30) + 500));
      continue;
    }
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // sin JSON
    }
    return { status: response.status, json };
  }
  throw new Error(`${method} ${path}: 429 persistente`);
}
const listOf = (json) => (Array.isArray(json) ? json : json?.data ?? json?.items ?? json?.results ?? []);
const must = (r, ok, what) => {
  if (!ok.includes(r.status)) throw new Error(`${what}: HTTP ${r.status} ${r.json?.message ?? r.json?.errorCode ?? ""}`);
  return r.json;
};

const sessions = new Map();
async function adminPassword(db) {
  const password = randomBytes(18).toString("base64url");
  await db.user.update({ where: { email: ADMIN.email }, data: { passwordHash: await bcrypt.hash(password, 10) } });
  return password;
}
async function v1Login(person, password) {
  return must(await call("POST", "/auth/login", { body: { email: person.email, password } }), [200, 201], `login ${person.key}`).accessToken;
}
async function adminToken(db) {
  if (!sessions.has("admin")) sessions.set("admin", await v1Login(ADMIN, await adminPassword(db)));
  return sessions.get("admin");
}
async function oneTimePassword(db, person) {
  const user = await db.user.findUnique({ where: { email: person.email } });
  const password = randomBytes(18).toString("base64url");
  must(await call("PATCH", `/users/${user.id}/password`, { token: await adminToken(db), body: { password } }), [200, 204], `contraseña ${person.key}`);
  return password;
}
async function directivaToken(db) {
  if (!sessions.has("directiva")) sessions.set("directiva", await v1Login(DIRECTIVA, await oneTimePassword(db, DIRECTIVA)));
  return sessions.get("directiva");
}
async function farmerSession(db, farmer) {
  if (sessions.has(farmer.key)) return sessions.get(farmer.key);
  const login = must(
    await call("POST", "/auth/v2/login", { body: { email: farmer.email, password: await oneTimePassword(db, farmer), refreshTransport: "BODY" } }),
    [200],
    `login v2 ${farmer.key}`,
  );
  const registration = must(await call("POST", "/auth/clients", { token: login.accessToken, body: { clientId: uuidFor(`client|${farmer.key}`) } }), [200, 201], `cliente ${farmer.key}`);
  must(await call("POST", "/auth/v2/session/client", { token: login.accessToken, body: { registrationId: registration.registrationId } }), [200, 201], `vínculo ${farmer.key}`);
  const session = { token: login.accessToken, refresh: login.refreshToken };
  sessions.set(farmer.key, session);
  return session;
}
async function closeSessions() {
  for (const [key, value] of sessions) {
    if (typeof value === "object" && value.refresh) await call("POST", "/auth/v2/logout", { body: { refreshToken: value.refresh } });
    sessions.delete(key);
  }
}

/** Publica (o reenvía, con el mismo operationId) la necesidad declarada de un agricultor. */
async function publish(db, farmer, campaignId, productRef, quantityBase, key) {
  const session = await farmerSession(db, farmer);
  const operationId = uuidFor(`exp|${PRODUCT_NAME}|${key}|${farmer.key}`);
  const ack = must(
    await call("POST", "/sync/v1/push", {
      token: session.token,
      body: {
        contractVersion: 1,
        operationId,
        projectionType: "DECLARED_NEED",
        action: "PUBLISH",
        causal: { predecessorOperationId: null, reconciliationReference: null },
        payload: { campaign_ref: campaignId, product_ref: productRef, base_unit: "ML", quantity_base: quantityBase },
      },
    }),
    [200],
    `push ${farmer.key}`,
  );
  log(`  push ${farmer.name} ${Number(quantityBase) / 1000} L → ${ack.outcome}${ack.code ? "/" + ack.code : ""}`);
  return operationId;
}

/** Retira la necesidad declarada vigente de un agricultor (CANCEL causal sobre su PUBLISH). */
async function cancel(db, farmer, campaignId, productRef, predecessorOperationId, key) {
  const session = await farmerSession(db, farmer);
  const ack = must(
    await call("POST", "/sync/v1/push", {
      token: session.token,
      body: {
        contractVersion: 1,
        operationId: uuidFor(`exp|${PRODUCT_NAME}|${key}|cancel|${farmer.key}`),
        projectionType: "DECLARED_NEED",
        action: "CANCEL",
        causal: { predecessorOperationId, reconciliationReference: null },
        payload: { campaign_ref: campaignId, product_ref: productRef, base_unit: "ML" },
      },
    }),
    [200],
    `cancel ${farmer.key}`,
  );
  log(`  cancel ${farmer.name} → ${ack.outcome}${ack.code ? "/" + ack.code : ""}`);
}

/** La celda de necesidad declarada del producto, tal como la sirve el servidor a la Directiva. */
async function cellOf(dir, campaignId, productRef) {
  const summary = must(await call("GET", `/collective/campaigns/${campaignId}/summary`, { token: dir }), [200], "summary");
  const cell = summary.cells.find((c) => c.projection_type === "DECLARED_NEED" && c.product_ref === productRef);
  if (!cell) return "(sin celda: ninguna aportación)";
  const figure = cell.status === "DISCLOSED" ? `${cell.total_presentation} ${cell.presentation_unit} · aportantes ${cell.contributors}` : "sin cifra";
  return `${cell.status} · ${figure}${cell.pending_changes ? " · cambios pendientes" : ""} · datos hasta ${cell.data_as_of ?? "—"}`;
}

async function main() {
  const db = new PrismaClient({ datasources: { db: { url: urlOf(DATABASE) } } });
  const tenant = await db.tenant.findUnique({ where: { slug: TENANT_SLUG } });
  if (!tenant) throw new Error(`la base ${DATABASE} no es la DEMO (falta el tenant ${TENANT_SLUG})`);
  const others = await db.tenant.count({ where: { slug: { not: TENANT_SLUG } } });
  if (others > 0) throw new Error("la base tiene otros tenants: no es una copia sintética limpia");
  const dir = await directivaToken(db);
  const campaign = listOf((await call("GET", "/campaigns", { token: dir })).json).find((c) => c.status === "ABIERTA");
  if (!campaign) throw new Error("no hay campaña abierta");
  const products = listOf((await call("GET", "/inventory/products", { token: dir })).json);
  const product = products.find((p) => p.name === PRODUCT_NAME) ?? must(await call("POST", "/inventory/products", { token: dir, body: { name: PRODUCT_NAME, unit: "L" } }), [200, 201], "producto");
  log(`API ${API} · campaña «${campaign.name}» · producto «${PRODUCT_NAME}» (${product.id.slice(0, 8)})`);
  const read = async (label) => log(`${label}: ${await cellOf(dir, campaign.id, product.id)}`);

  const steps = [
    async () => {
      await publish(db, BETO, campaign.id, product.id, "10000", "p1");
      await read("1. un agricultor (10 L)");
    },
    async () => {
      await publish(db, CARMEN, campaign.id, product.id, "15000", "p2");
      await read("2. dos agricultores (10 + 15 L)");
    },
    async () => {
      await publish(db, DARIO, campaign.id, product.id, "5000", "p3");
      await read("3. tres agricultores (10 + 15 + 5 = 30 L)");
    },
    async () => {
      await publish(db, ELENA, campaign.id, product.id, "8000", "p4");
      await read("4. cuarto agricultor (+8 L = 38 L)");
    },
    async () => {
      await publish(db, ELENA, campaign.id, product.id, "8000", "p4");
      await read("5. reenvío del cuarto (mismo operationId)");
    },
    async () => {
      await cancel(db, ELENA, campaign.id, product.id, uuidFor(`exp|${PRODUCT_NAME}|p4|${ELENA.key}`), "c4");
      await read("6. retirada del cuarto (quedan 3)");
    },
    async () => {
      await cancel(db, DARIO, campaign.id, product.id, uuidFor(`exp|${PRODUCT_NAME}|p3|${DARIO.key}`), "c3");
      await read("7. retirada del tercero (quedan 2)");
    },
  ];
  await read("0. antes");
  for (const step of steps.slice(0, UNTIL)) await step();
  await closeSessions();
  await db.$disconnect();
}

main().catch((error) => {
  console.error(`ERROR ${error.message}`);
  process.exit(1);
});
