// DEMO «rica» de Agrocuentas (defensa, 2026-11-05): la misma Central de DEMOSTRACIÓN
// con datos exclusivamente SINTÉTICOS, pero con muchos más datos para que la Web de la
// Directiva tenga qué mostrar: 14 agricultores con historia (más uno limpio para el teléfono), 11 productos (L y kg), 11 campañas de
// invierno selladas (2015–2025) con consumo publicado, la campaña actual con necesidades
// y consumo, dos borradores de propuesta, una equivalencia confirmada y otra pendiente,
// y dos ejecuciones de la estimación del consumo.
//
// Se ejecuta desde Back/ (usa sus dependencias), DESPUÉS de `demo-central.cjs bootstrap`
// sobre una base VACÍA y desechable (nunca sobre la DEMO oficial):
//
//   node <ruta>/demo-rica.cjs seed            todo por la API REAL (idempotente)
//   node <ruta>/demo-rica.cjs verify          resumen verificable (sólo lectura)
//   node <ruta>/demo-rica.cjs password <rol>       contraseña de un solo uso al portapapeles (no se imprime)
//   node <ruta>/demo-rica.cjs credential-adb <rol> <serial>  la teclea en el campo de contraseña enfocado
//   node <ruta>/demo-rica.cjs password-pipe <rol>  contraseña de un solo uso SÓLO por tubería
//
// Entorno: DEMO_PG_ADMIN_URL (postgres desechable), DEMO_API (p. ej.
// http://127.0.0.1:3342/api/v1), DEMO_DATE (AAAA-MM-DD; por defecto hoy en La Paz),
// DEMO_SEED (por defecto «agrocuentas-demo-rica-1»).
//
// Igual que la DEMO del PR #201: el tenant y el primer Administrador los crea el
// bootstrap (no hay API); todo lo demás —usuarios, productos, temporada, campañas,
// publicaciones de los agricultores (sync v1 push con sesión de app), cierres, sellados,
// clasificaciones, equivalencias, borradores y trabajos de estimación— pasa por la API
// real. No se insertan cifras, ACK, sellados ni estimaciones en la base. Nunca se
// imprimen contraseñas, tokens ni secretos.
const { createRequire } = require("node:module");
const { createHash, randomBytes } = require("node:crypto");
const { resolve } = require("node:path");
const { execFileSync } = require("node:child_process");

const req = createRequire(resolve(process.cwd(), "package.json"));
const { PrismaClient } = req("@prisma/client");
const bcrypt = req("bcrypt");

const DATABASE = "agro_demo";
const TENANT_SLUG = "demo-sintetico";
const SEED = process.env.DEMO_SEED || "agrocuentas-demo-rica-1";
const API = process.env.DEMO_API || "http://127.0.0.1:3342/api/v1";
const pgAdmin = () => {
  if (!process.env.DEMO_PG_ADMIN_URL) throw new Error("falta DEMO_PG_ADMIN_URL");
  return process.env.DEMO_PG_ADMIN_URL;
};
const urlOf = (database) => {
  const url = new URL(pgAdmin());
  url.pathname = `/${database}`;
  return url.toString();
};
const demoDate = () => {
  if (process.env.DEMO_DATE) return new Date(`${process.env.DEMO_DATE}T12:00:00-04:00`);
  const now = new Date();
  return new Date(`${new Date(now.getTime() - 4 * 3600e3).toISOString().slice(0, 10)}T12:00:00-04:00`);
};
const daysFrom = (base, days) => new Date(base.getTime() + days * 86400e3);
const log = (text) => console.log(`${new Date().toISOString()} ${text}`);

/** UUID v4 determinista: misma semilla y clave, mismo id (repetir no duplica). */
function uuidFor(key) {
  const h = createHash("sha256").update(`${SEED}|${key}`).digest("hex");
  const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Números pseudoaleatorios deterministas por clave (mulberry32). */
function rng(key) {
  let a = parseInt(createHash("sha256").update(`${SEED}|rng|${key}`).digest("hex").slice(0, 8), 16);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (random, list, count) => {
  const copy = [...list];
  const out = [];
  while (out.length < count && copy.length) out.push(copy.splice(Math.floor(random() * copy.length), 1)[0]);
  return out.sort();
};

// ── Identidades sintéticas ──
const ADMIN = { key: "admin", name: "Administración DEMO", email: "admin.demo@example.test", role: "ADMINISTRADOR" };
const DIRECTIVA = { key: "directiva", name: "Directiva DEMO", email: "directiva.demo@example.test", role: "DIRECTIVA" };
const FARMERS = [
  ["agricultor1", "Ana Quispe (sintética)"],
  ["agricultor2", "Beto Mamani (sintético)"],
  ["agricultor3", "Carmen Choque (sintética)"],
  ["agricultor4", "Darío Flores (sintético)"],
  ["agricultor5", "Elena Condori (sintética)"],
  ["agricultor6", "Fabián Rojas (sintético)"],
  ["agricultor7", "Gabriela Ticona (sintética)"],
  ["agricultor8", "Hugo Apaza (sintético)"],
  ["agricultor9", "Inés Huanca (sintética)"],
  ["agricultor10", "Julio Limachi (sintético)"],
  ["agricultor11", "Karina Poma (sintética)"],
  ["agricultor12", "Luis Calle (sintético)"],
  ["agricultor13", "Marta Yujra (sintética)"],
  ["agricultor14", "Néstor Copa (sintético)"],
].map(([key, name]) => ({ key, name, email: `${key}.demo@example.test`, role: "AGRICULTOR" }));
const FARMER_KEYS = FARMERS.map((f) => f.key);
// Cuenta LIMPIA para el teléfono: se da de alta pero no publica nada, para que el flujo
// completo (activar la app, declarar, sincronizar y verlo en la Web) empiece desde cero.
const PHONE_FARMER = { key: "agricultor15", name: "Rosa Vargas (sintética)", email: "agricultor15.demo@example.test", role: "AGRICULTOR" };
const PEOPLE = [ADMIN, DIRECTIVA, ...FARMERS, PHONE_FARMER];

// ── Productos (L → mL, kg → g) ──
const PRODUCTS = [
  { key: "herbicida", name: "Herbicida DEMO", unit: "L", category: "Herbicida", activeIngredient: "Glifosato 48 %", perFarmer: 12, trend: 0.03 },
  { key: "fungicida", name: "Fungicida DEMO", unit: "L", category: "Fungicida", activeIngredient: "Azoxistrobina", perFarmer: 7, trend: 0.05 },
  { key: "insecticida", name: "Insecticida DEMO", unit: "L", category: "Insecticida", activeIngredient: "Cipermetrina", perFarmer: 4, trend: 0.02 },
  { key: "coadyuvante", name: "Coadyuvante DEMO", unit: "L", category: "Coadyuvante", activeIngredient: "Aceite metilado", perFarmer: 3, trend: 0.04 },
  { key: "foliar", name: "Fertilizante foliar DEMO", unit: "L", category: "Fertilizante", activeIngredient: "NPK + micronutrientes", perFarmer: 6, trend: 0.06 },
  { key: "urea", name: "Urea DEMO", unit: "kg", category: "Fertilizante", activeIngredient: "Nitrógeno 46 %", perFarmer: 90, trend: 0.02 },
  { key: "npk", name: "Abono NPK 15-15-15 DEMO", unit: "kg", category: "Fertilizante", activeIngredient: "N-P-K", perFarmer: 70, trend: 0.03 },
  { key: "mancozeb", name: "Mancozeb DEMO", unit: "kg", category: "Fungicida", activeIngredient: "Mancozeb 80 %", perFarmer: 5, trend: 0.01 },
  { key: "azufre", name: "Azufre mojable DEMO", unit: "kg", category: "Fungicida", activeIngredient: "Azufre 80 %", perFarmer: 8, trend: 0.0 },
  // Denominaciones con otro nombre: una se asocia a Herbicida DEMO; la otra queda pendiente.
  { key: "herbicida48", name: "Herbicida 48 DEMO", unit: "L", category: "Herbicida", activeIngredient: "Glifosato 48 %", denomination: true },
  { key: "fungiplus", name: "Fungicida Plus DEMO", unit: "L", category: "Fungicida", denomination: true },
];
const baseUnitOf = (product) => (product.unit === "L" ? "ML" : "G");

// Historia sellada 2015–2025: qué productos hay cada año y cuántos aportan.
// Huecos a propósito (nunca son ceros): insecticida empieza en 2019 y en 2025 sólo
// aportan 2 (oculto → sin estimación); azufre sólo 2024–2025 (tramo corto); coadyuvante
// tiene 2017 con 2 aportantes (oculto en la versión sellada).
const YEARS = Array.from({ length: 11 }, (_, i) => 2015 + i);
function contributorsFor(product, year) {
  if (product.denomination) return 0;
  if (product.key === "insecticida") return year < 2019 ? 0 : year === 2025 ? 2 : 3 + (year % 3);
  if (product.key === "azufre") return year < 2024 ? 0 : 4;
  if (product.key === "foliar") return year < 2018 ? 0 : 3 + (year % 4);
  if (product.key === "coadyuvante") return year === 2017 ? 2 : 3 + (year % 2);
  if (product.key === "mancozeb") return 3 + ((year + 1) % 3);
  return 4 + (year % 3);
}
function historyRows() {
  const rows = [];
  for (const year of YEARS) {
    for (const product of PRODUCTS) {
      const count = contributorsFor(product, year);
      if (count === 0) continue;
      const random = rng(`hist|${year}|${product.key}`);
      const farmers = pick(random, FARMER_KEYS, count);
      for (const farmer of farmers) {
        const growth = 1 + product.trend * (year - 2015);
        const value = product.perFarmer * growth * (0.75 + random() * 0.5);
        rows.push({ year, product: product.key, farmer, quantity: String(Math.round(value * 10) * 100) });
      }
    }
  }
  return rows;
}

// Campaña actual: necesidades declaradas (cuántos declaran) y consumo ya registrado.
const CURRENT_NEEDS = { herbicida: 10, fungicida: 7, insecticida: 2, coadyuvante: 5, foliar: 6, urea: 9, npk: 8, mancozeb: 4, azufre: 1, herbicida48: 2, fungiplus: 1 };
const CURRENT_CONSUMPTION = { herbicida: 5, urea: 4, foliar: 3, npk: 3, fungicida: 2 };
// Necesidades que llegan después del primer borrador (el segundo borrador las incluye).
const LATE_NEEDS = { mancozeb: 2, coadyuvante: 1 };
const SEASON = { key: "invierno", definition: "Temporada de invierno (DEMO, sintética)", duration_days: 150 };
const currentCampaignName = () => `Invierno ${demoDate().getUTCFullYear()} (DEMO)`;

// ── HTTP con reintento en 429 ──
async function call(method, path, { token, body } = {}) {
  for (let attempt = 0; attempt < 20; attempt++) {
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
  if (!ok.includes(r.status)) throw new Error(`${what}: HTTP ${r.status} ${r.json?.message ?? r.json?.errorCode ?? r.json?.error ?? ""}`);
  return r.json;
};

// ── Base y credenciales (como demo-central.cjs) ──
async function demoDb() {
  const db = new PrismaClient({ datasources: { db: { url: urlOf(DATABASE) } } });
  const tenant = await db.tenant.findUnique({ where: { slug: TENANT_SLUG } });
  if (!tenant) throw new Error(`la base ${DATABASE} no es una DEMO (falta el tenant ${TENANT_SLUG}); ejecute antes demo-central.cjs bootstrap`);
  return { db, tenant };
}
async function adminPassword(db) {
  const password = randomBytes(18).toString("base64url");
  await db.user.update({ where: { email: ADMIN.email }, data: { passwordHash: await bcrypt.hash(password, 10) } });
  return password;
}
const sessions = new Map();
async function v1Login(person, password) {
  return must(await call("POST", "/auth/login", { body: { email: person.email, password } }), [200, 201], `login ${person.key}`).accessToken;
}
// Los tokens de acceso duran 15 min (JWT_EXPIRES_IN): cada sesión se renueva a los 10.
const FRESH_MS = 10 * 60 * 1000;
const fresh = (key) => sessions.has(key) && Date.now() - sessions.get(key).at < FRESH_MS;
async function adminToken(db) {
  if (!fresh("admin")) sessions.set("admin", { token: await v1Login(ADMIN, await adminPassword(db)), at: Date.now() });
  return sessions.get("admin").token;
}
const users = new Map();
async function userId(db, person) {
  if (!users.has(person.email)) users.set(person.email, (await db.user.findUnique({ where: { email: person.email } }))?.id ?? null);
  return users.get(person.email);
}
async function oneTimePassword(db, person) {
  if (person.key === "admin") return adminPassword(db);
  const password = randomBytes(18).toString("base64url");
  must(await call("PATCH", `/users/${await userId(db, person)}/password`, { token: await adminToken(db), body: { password } }), [200, 204], `contraseña ${person.key}`);
  return password;
}
async function directivaToken(db) {
  if (!fresh("directiva")) sessions.set("directiva", { token: await v1Login(DIRECTIVA, await oneTimePassword(db, DIRECTIVA)), at: Date.now() });
  return sessions.get("directiva").token;
}
/** Sesión V2 BODY + registro de cliente determinista + vínculo: como una instalación de la app. */
async function farmerSession(db, farmer) {
  if (fresh(farmer.key)) return sessions.get(farmer.key);
  if (sessions.has(farmer.key)) {
    await call("POST", "/auth/v2/logout", { body: { refreshToken: sessions.get(farmer.key).refresh } });
    sessions.delete(farmer.key);
  }
  const login = must(
    await call("POST", "/auth/v2/login", { body: { email: farmer.email, password: await oneTimePassword(db, farmer), refreshTransport: "BODY" } }),
    [200],
    `login v2 ${farmer.key}`,
  );
  const registration = must(await call("POST", "/auth/clients", { token: login.accessToken, body: { clientId: uuidFor(`client|${farmer.key}`) } }), [200, 201], `cliente ${farmer.key}`);
  must(await call("POST", "/auth/v2/session/client", { token: login.accessToken, body: { registrationId: registration.registrationId } }), [200, 201], `vínculo ${farmer.key}`);
  const session = { token: login.accessToken, refresh: login.refreshToken, at: Date.now() };
  sessions.set(farmer.key, session);
  return session;
}
async function closeSessions() {
  for (const [key, value] of sessions) {
    if (typeof value === "object" && value.refresh) await call("POST", "/auth/v2/logout", { body: { refreshToken: value.refresh } });
    sessions.delete(key);
  }
}

/** Push real con operationId determinista; si Central ya lo tiene, no se reenvía. */
let pushes = 0;
async function push(db, farmerKey, projectionType, campaignId, product, productId, quantity, key) {
  const session = await farmerSession(db, FARMERS.find((f) => f.key === farmerKey));
  const operationId = uuidFor(`op|${key}|${farmerKey}`);
  if ((await call("GET", `/sync/v1/operations/${operationId}`, { token: session.token })).status === 200) return;
  const ack = must(
    await call("POST", "/sync/v1/push", {
      token: session.token,
      body: {
        contractVersion: 1,
        operationId,
        projectionType,
        action: "PUBLISH",
        causal: { predecessorOperationId: null, reconciliationReference: null },
        payload: { campaign_ref: campaignId, product_ref: productId, base_unit: baseUnitOf(product), quantity_base: quantity },
      },
    }),
    [200],
    `push ${key} ${farmerKey}`,
  );
  if (ack.outcome !== "APPLIED" && ack.outcome !== "ALREADY_APPLIED") throw new Error(`push ${key} ${farmerKey}: ${ack.outcome}/${ack.code}`);
  pushes++;
}

/** Cantidad sintética de una necesidad o consumo actual, por agricultor. */
function currentQuantity(product, farmer, kind) {
  const random = rng(`${kind}|${product.key}|${farmer}`);
  const per = product.perFarmer ?? (product.unit === "L" ? 10 : 50);
  const factor = kind === "need" ? 1.1 + random() * 0.6 : 0.3 + random() * 0.3;
  return String(Math.round(per * factor * 10) * 100);
}

async function waitJob(dirToken, job) {
  for (let i = 0; i < 120; i++) {
    const state = must(await call("GET", `/estimation/jobs/${job.job_ref}`, { token: await dirToken() }), [200], "trabajo");
    if (state.status === "COMPLETED" || state.status === "NOT_EXECUTED") return state;
    await new Promise((done) => setTimeout(done, 1000));
  }
  throw new Error(`trabajo ${job.job_ref}: no terminó a tiempo`);
}

async function seed() {
  const { db, tenant } = await demoDb();
  const base = demoDate();
  log(`siembra rica con semilla «${SEED}» y fecha ${base.toISOString().slice(0, 10)}`);

  // 1. Personas.
  for (const person of PEOPLE.slice(1)) {
    if (await userId(db, person)) continue;
    must(
      await call("POST", "/users", { token: await adminToken(db), body: { name: person.name, email: person.email, password: randomBytes(18).toString("base64url"), role: person.role } }),
      [200, 201],
      `alta ${person.key}`,
    );
    users.delete(person.email);
    log(`alta ${person.role} ${person.key}`);
  }
  const dirToken = () => directivaToken(db);

  // 2. Productos.
  const existing = listOf((await call("GET", "/inventory/products", { token: await dirToken() })).json);
  const productId = {};
  for (const product of PRODUCTS) {
    const found = existing.find((p) => p.name === product.name);
    productId[product.key] =
      found?.id ??
      must(
        await call("POST", "/inventory/products", {
          token: await dirToken(),
          body: { name: product.name, unit: product.unit, category: product.category, ...(product.activeIngredient ? { activeIngredient: product.activeIngredient } : {}) },
        }),
        [200, 201],
        `producto ${product.key}`,
      ).id;
  }
  log(`productos: ${PRODUCTS.length}`);

  // 3. Temporada.
  const seasons = listOf((await call("GET", "/estimation/seasons", { token: await dirToken() })).json);
  const season = seasons.find((s) => s.season?.key === SEASON.key) ?? must(await call("POST", "/estimation/seasons", { token: await dirToken(), body: { contract_version: 1, ...SEASON } }), [200, 201], "temporada");
  const seasonRef = season.season.season_ref;

  // 4. Historia: abrir, consumo de los agricultores (push real), cerrar y sellar.
  const campaigns = async () => call("GET", "/campaigns", { token: await dirToken() }).then((r) => listOf(r.json));
  const byName = async (name) => (await campaigns()).find((c) => c.name === name);
  const rows = historyRows();
  for (const year of YEARS) {
    const name = `Invierno ${year} (DEMO)`;
    let campaign = await byName(name);
    if (!campaign) campaign = must(await call("POST", "/campaigns", { token: await dirToken(), body: { name, startDate: `${year}-05-01T12:00:00.000Z`, estimatedEndDate: `${year}-09-28T12:00:00.000Z` } }), [200, 201], name);
    if ((await call("GET", `/collective/campaigns/${campaign.id}/seal`, { token: await dirToken() })).json?.state === "SEALED") {
      log(`${name}: ya sellada`);
      continue;
    }
    if (campaign.status === "PLANIFICADA") must(await call("POST", `/campaigns/${campaign.id}/open`, { token: await dirToken(), body: {} }), [200, 201], `abrir ${name}`);
    if ((await byName(name)).status === "ABIERTA") {
      for (const row of rows.filter((r) => r.year === year)) {
        const product = PRODUCTS.find((p) => p.key === row.product);
        await push(db, row.farmer, "CONSUMPTION_TOTAL", campaign.id, product, productId[product.key], row.quantity, `hist|${year}|${product.key}`);
      }
      must(await call("POST", `/campaigns/${campaign.id}/close`, { token: await dirToken(), body: {} }), [200], `cerrar ${name}`);
    }
    const state = must(await call("GET", `/collective/campaigns/${campaign.id}/seal`, { token: await dirToken() }), [200], `revisión ${name}`);
    if (!state.can_seal) throw new Error(`${name}: no se puede sellar (${JSON.stringify(state.blocked_by)})`);
    must(await call("POST", `/collective/campaigns/${campaign.id}/seal`, { token: await dirToken(), body: { confirmed: true, review_ref: state.review.review_ref } }), [200, 201], `sellar ${name}`);
    log(`${name}: ${rows.filter((r) => r.year === year).length} publicaciones de consumo, cerrada y sellada`);
  }

  // 5. Campaña actual.
  const currentName = currentCampaignName();
  let current = await byName(currentName);
  if (!current) current = must(await call("POST", "/campaigns", { token: await dirToken(), body: { name: currentName, startDate: daysFrom(base, -20).toISOString(), estimatedEndDate: daysFrom(base, 130).toISOString() } }), [200, 201], currentName);
  if ((await byName(currentName)).status === "PLANIFICADA") must(await call("POST", `/campaigns/${current.id}/open`, { token: await dirToken(), body: {} }), [200, 201], `abrir ${currentName}`);

  // 6. Clasificación en la temporada.
  const classified = listOf((await call("GET", `/estimation/campaign-classifications?season_ref=${seasonRef}`, { token: await dirToken() })).json);
  for (const c of await campaigns()) {
    if (!/^Invierno \d{4} \(DEMO\)$/.test(c.name) || classified.some((x) => x.campaign?.campaign_ref === c.id)) continue;
    must(await call("POST", "/estimation/campaign-classifications", { token: await dirToken(), body: { contract_version: 1, campaign_ref: c.id, season_ref: seasonRef } }), [200, 201], `clasificar ${c.name}`);
  }
  log("campañas clasificadas en la temporada de invierno");

  // 7. Necesidades y consumo de la campaña actual.
  const declare = async (table, kind, projectionType, keyPrefix) => {
    for (const [productKey, count] of Object.entries(table)) {
      const product = PRODUCTS.find((p) => p.key === productKey);
      for (const farmer of pick(rng(`${keyPrefix}|${productKey}`), FARMER_KEYS, count)) {
        await push(db, farmer, projectionType, current.id, product, productId[productKey], currentQuantity(product, farmer, kind), `${keyPrefix}|${currentName}|${productKey}`);
      }
    }
  };
  await declare(CURRENT_NEEDS, "need", "DECLARED_NEED", "need");
  await declare(CURRENT_CONSUMPTION, "use", "CONSUMPTION_TOTAL", "use");
  log(`campaña actual: necesidades y consumo publicados (${pushes} publicaciones nuevas en total)`);

  // 8. Equivalencia: «Herbicida 48 DEMO» se agrupa bajo «Herbicida DEMO» (confirmada por la Directiva).
  const associations = must(await call("GET", "/collective/product-associations", { token: await dirToken() }), [200], "equivalencias");
  if (!(associations.current ?? []).some((a) => a.product_ref === productId.herbicida48)) {
    must(
      await call("POST", "/collective/product-associations", {
        token: await dirToken(),
        body: { productId: productId.herbicida48, canonicalProductId: productId.herbicida, reason: "Misma formulación y fabricante (DEMO sintética)", confirmed: true },
      }),
      [200, 201],
      "asociar Herbicida 48 DEMO",
    );
    log("equivalencia: Herbicida 48 DEMO → Herbicida DEMO");
  }

  // 9. Borradores: uno con lo recibido y otro después de las necesidades tardías.
  const proposals = listOf((await call("GET", `/collective/campaigns/${current.id}/proposals`, { token: await dirToken() })).json);
  if (proposals.length < 2) {
    if (proposals.length === 0) must(await call("POST", `/collective/campaigns/${current.id}/proposals`, { token: await dirToken() }), [200, 201], "borrador 1");
    for (const [productKey, count] of Object.entries(LATE_NEEDS)) {
      const product = PRODUCTS.find((p) => p.key === productKey);
      const already = new Set(pick(rng(`need|${productKey}`), FARMER_KEYS, CURRENT_NEEDS[productKey]));
      const late = pick(rng(`late|${productKey}`), FARMER_KEYS.filter((f) => !already.has(f)), count);
      for (const farmer of late) await push(db, farmer, "DECLARED_NEED", current.id, product, productId[productKey], currentQuantity(product, farmer, "need"), `late|${currentName}|${productKey}`);
    }
    must(await call("POST", `/collective/campaigns/${current.id}/proposals`, { token: await dirToken() }), [200, 201], "borrador 2");
    log("dos borradores de propuesta generados");
  }

  // 10. Estimación: una ejecución parcial (herbicida y urea) y otra completa.
  const runs = listOf((await call("GET", `/estimation/runs?target_campaign_ref=${current.id}`, { token: await dirToken() })).json);
  if (runs.length < 2) {
    const first = must(
      await call("POST", "/estimation/jobs", { token: await dirToken(), body: { contract_version: 1, request_id: uuidFor("job|parcial"), target_campaign_ref: current.id, product_refs: [productId.herbicida, productId.urea] } }),
      [200, 201, 202],
      "estimación parcial",
    );
    log(`estimación parcial: ${(await waitJob(dirToken, first)).status}`);
    const second = must(await call("POST", "/estimation/jobs", { token: await dirToken(), body: { contract_version: 1, request_id: uuidFor("job|completa"), target_campaign_ref: current.id } }), [200, 201, 202], "estimación completa");
    log(`estimación completa: ${(await waitJob(dirToken, second)).status}`);
  }

  await closeSessions();
  log(`siembra rica terminada; tenant ${tenant.id.slice(0, 8)}`);
  await db.$disconnect();
}

async function verify() {
  const { db, tenant } = await demoDb();
  const dirToken = () => directivaToken(db);
  const roles = await db.member.groupBy({ by: ["role"], where: { tenantId: tenant.id, isActive: true }, _count: true });
  log(`Members activos: ${roles.map((r) => `${r.role} ${r._count}`).join(", ")}`);
  const all = listOf((await call("GET", "/campaigns", { token: await dirToken() })).json).sort((a, b) => a.startDate.localeCompare(b.startDate));
  let sealed = 0;
  for (const c of all) if ((await call("GET", `/collective/campaigns/${c.id}/seal`, { token: await dirToken() })).json?.state === "SEALED") sealed++;
  log(`campañas: ${all.length} (${sealed} selladas)`);
  log(`productos: ${listOf((await call("GET", "/inventory/products", { token: await dirToken() })).json).length}`);
  const current = all.find((c) => c.name === currentCampaignName());
  const summary = must(await call("GET", `/collective/campaigns/${current.id}/summary`, { token: await dirToken() }), [200], "resumen");
  log(`resumen de ${current.name}: cobertura ${summary.coverage?.members_with_contribution} de ${summary.coverage?.linked_members}`);
  for (const cell of summary.cells ?? []) {
    log(`  ${cell.projection_type === "DECLARED_NEED" ? "necesidad" : "consumo  "} · ${cell.product_name}: ${cell.status} ${cell.total_presentation ?? "(sin cifra)"} ${cell.presentation_unit} · aportantes ${cell.contributors ?? "-"}`);
  }
  for (const type of ["CONSUMPTION_TOTAL", "DECLARED_NEED"]) {
    const trends = must(await call("GET", `/collective/trends?projection_type=${type}`, { token: await dirToken() }), [200], "tendencias");
    log(`tendencias ${type}: ${trends.series.length} series sobre ${trends.campaigns.filter((c) => c.seal).length} campañas selladas`);
  }
  const proposals = listOf((await call("GET", `/collective/campaigns/${current.id}/proposals`, { token: await dirToken() })).json);
  log(`borradores: ${proposals.length}`);
  const results = must(await call("GET", `/estimation/results?target_campaign_ref=${current.id}`, { token: await dirToken() }), [200], "estimación");
  for (const r of results.results) log(`  estimación ${r.product.name}: ${r.status} ${r.estimate_base ?? "-"} (base ${r.naive_base ?? "-"}) ${r.validity}`);
  const associations = must(await call("GET", "/collective/product-associations", { token: await dirToken() }), [200], "equivalencias");
  log(`equivalencias vigentes: ${(associations.current ?? []).length}`);
  await closeSessions();
  await db.$disconnect();
}

/** Para otro proceso (el recorrido de la Web): la contraseña sale SÓLO por una tubería. */
async function passwordPipe(roleKey) {
  if (process.stdout.isTTY) throw new Error("ABORTADO: password-pipe sólo escribe en una tubería, nunca en la terminal");
  const person = PEOPLE.find((p) => p.key === roleKey);
  if (!person) throw new Error(`rol desconocido: ${roleKey}`);
  const { db } = await demoDb();
  process.stdout.write(await oneTimePassword(db, person));
  await closeSessions();
  await db.$disconnect();
}

/** Contraseña nueva de un solo uso al portapapeles de Windows (no se imprime). */
async function password(roleKey) {
  const person = PEOPLE.find((p) => p.key === roleKey);
  if (!person) throw new Error(`rol desconocido: ${roleKey} (use ${PEOPLE.map((p) => p.key).join(", ")})`);
  const { db } = await demoDb();
  execFileSync("clip.exe", { input: await oneTimePassword(db, person) });
  log(`contraseña nueva de un solo uso de ${person.email} copiada al portapapeles (no se muestra); la anterior deja de servir`);
  await closeSessions();
  await db.$disconnect();
}

/** Teclea una contraseña nueva de un solo uso SÓLO si el campo enfocado del dispositivo es de contraseña. */
async function credentialAdb(roleKey, serial) {
  const person = PEOPLE.find((p) => p.key === roleKey);
  if (!person) throw new Error(`rol desconocido: ${roleKey}`);
  const dump = execFileSync("adb", ["-s", serial, "exec-out", "uiautomator", "dump", "/dev/tty"], { encoding: "utf8" });
  const focused = (dump.match(/<node[^>]*>/g) ?? []).find((n) => n.includes('class="android.widget.EditText"') && n.includes('focused="true"'));
  if (!focused || !focused.includes('password="true"')) throw new Error("ABORTADO: el campo enfocado no es de contraseña");
  const { db } = await demoDb();
  execFileSync("adb", ["-s", serial, "shell", "input", "text", await oneTimePassword(db, person)]);
  log(`contraseña de un solo uso de ${person.key} tecleada en el campo de contraseña (no se muestra ni se guarda)`);
  await closeSessions();
  await db.$disconnect();
}

const [command, arg, arg2] = process.argv.slice(2);
const commands = { seed, verify, "password-pipe": () => passwordPipe(arg), password: () => password(arg), "credential-adb": () => credentialAdb(arg, arg2) };
if (!commands[command]) {
  console.error(`orden desconocida: ${command} (use seed, verify o password-pipe <rol>)`);
  process.exit(2);
}
commands[command]().catch((error) => {
  console.error(`ERROR ${error.message}`);
  process.exit(1);
});
