// DEMO de Agrocuentas (OE3, 2026-11-03): Central de DEMOSTRACIÓN con datos
// exclusivamente SINTÉTICOS. Se ejecuta desde Back/ (usa sus dependencias):
//
//   node ../tool/demo/demo-central.cjs bootstrap       base, migraciones, tenant y Administrador (directo)
//   node ../tool/demo/demo-central.cjs seed            todo lo demás por la API REAL (idempotente)
//   node ../tool/demo/demo-central.cjs verify          resumen verificable (sólo lectura, salvo un trabajo de estimación si se pide)
//   node ../tool/demo/demo-central.cjs password <rol>  contraseña nueva de un solo uso al portapapeles (no se imprime)
//   node ../tool/demo/demo-central.cjs check-identity  comprueba que la base es la DEMO (antes de un reinicio)
//   node ../tool/demo/demo-central.cjs credential-adb <rol> <serial>  teclea una contraseña de un solo uso en el campo de contraseña enfocado
//   node ../tool/demo/demo-central.cjs references <agricultor> <archivo>  GET /sync/v1/references, como la app
//
// Entorno: DEMO_PG_ADMIN_URL (postgres desechable de la DEMO), DEMO_API (p. ej.
// http://127.0.0.1:3330/api/v1), DEMO_DATE (AAAA-MM-DD; por defecto, hoy en La Paz)
// y DEMO_SEED (texto; por defecto «agrocuentas-demo-1»).
//
// Qué es directo y por qué: el tenant y el primer Administrador (no hay API para
// crearlos) y la contraseña de un solo uso del Administrador (hash en la base
// desechable, como en las herramientas OE3). Todo lo demás —usuarios, campañas,
// productos, publicaciones, cierres, sellados, temporadas y clasificaciones— pasa
// por la API real. No se insertan ACK, sellados, trabajos ni estimaciones.
// Nunca se imprimen contraseñas, tokens ni secretos.
const { createRequire } = require("node:module");
const { createHash, randomBytes } = require("node:crypto");
const { spawnSync, execFileSync } = require("node:child_process");
const { resolve } = require("node:path");

const req = createRequire(resolve(process.cwd(), "package.json"));
const { PrismaClient } = req("@prisma/client");
const bcrypt = req("bcrypt");

const DATABASE = "agro_demo";
const TENANT_SLUG = "demo-sintetico";
const TENANT_NAME = "Sindicato DEMO · datos sintéticos";
const SEED = process.env.DEMO_SEED || "agrocuentas-demo-1";
const API = process.env.DEMO_API || "http://127.0.0.1:3330/api/v1";
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

// ── Identidades sintéticas (sin contraseñas: se fijan en memoria en cada uso) ──
const ADMIN = { key: "admin", name: "Administración DEMO", email: "admin.demo@example.test", role: "ADMINISTRADOR" };
const DIRECTIVA = { key: "directiva", name: "Directiva DEMO", email: "directiva.demo@example.test", role: "DIRECTIVA" };
const FARMERS = [
  ["agricultor1", "Ana Quispe (sintética)"],
  ["agricultor2", "Beto Mamani (sintético)"],
  ["agricultor3", "Carmen Choque (sintética)"],
  ["agricultor4", "Darío Flores (sintético)"],
  ["agricultor5", "Elena Condori (sintética)"],
  ["agricultor6", "Fabián Rojas (sintético)"],
].map(([key, name]) => ({ key, name, email: `${key}.demo@example.test`, role: "AGRICULTOR" }));
const PEOPLE = [ADMIN, DIRECTIVA, ...FARMERS];

const PRODUCTS = [
  ["herbicida", "Herbicida DEMO", "L"],
  ["fungicida", "Fungicida DEMO", "L"],
  ["insecticida", "Insecticida DEMO", "L"],
];

// Estimación: ejemplo documentado (F12_EST_04): 96, 120, 104 y 116 L → SES 111 L, naive 116 L.
// Fungicida sólo en las dos últimas: tramo de 2 < 3 → datos insuficientes.
const HISTORY = [
  { year: 2015, rows: { herbicida: ["32000", "32000", "32000"] } },
  { year: 2016, rows: { herbicida: ["40000", "40000", "40000"] } },
  { year: 2017, rows: { herbicida: ["34000", "35000", "35000"], fungicida: ["9000", "10000", "11000"] } },
  { year: 2018, rows: { herbicida: ["38000", "39000", "39000"], fungicida: ["12000", "12000", "12000"] } },
];
const HISTORY_FARMERS = ["agricultor2", "agricultor3", "agricultor4"];
const SEASON = { key: "invierno", definition: "Temporada de invierno (DEMO, sintética)", duration_days: 150 };

// Necesidades de la campaña actual (mL). Herbicida: 5 aportantes (se divulga). Fungicida: 2
// (bajo el umbral provisional de 3; el teléfono de Ana aporta el tercero durante la DEMO).
// Insecticida: 1 (sigue sin cifra toda la DEMO).
const NEEDS = {
  herbicida: { agricultor2: "50000", agricultor3: "45000", agricultor4: "60000", agricultor5: "40000", agricultor6: "55000" },
  fungicida: { agricultor3: "20000", agricultor5: "15000" },
  insecticida: { agricultor4: "10000" },
};
const currentCampaignName = () => `Invierno ${demoDate().getUTCFullYear()} (DEMO)`;

// ── HTTP con reintento en 429 ──
async function call(method, path, { token, body, raw } = {}) {
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
    return { status: response.status, json, text: raw ? text : undefined };
  }
  throw new Error(`${method} ${path}: 429 persistente`);
}
const listOf = (json) => (Array.isArray(json) ? json : json?.data ?? json?.items ?? json?.results ?? []);
const must = (r, ok, what) => {
  if (!ok.includes(r.status)) throw new Error(`${what}: HTTP ${r.status} ${r.json?.message ?? r.json?.errorCode ?? r.json?.error ?? ""}`);
  return r.json;
};

// ── Base y credenciales ──
async function demoDb() {
  const db = new PrismaClient({ datasources: { db: { url: urlOf(DATABASE) } } });
  const tenant = await db.tenant.findUnique({ where: { slug: TENANT_SLUG } });
  if (!tenant) throw new Error(`la base ${DATABASE} no es la DEMO (falta el tenant ${TENANT_SLUG})`);
  return { db, tenant };
}

async function adminPassword(db) {
  const password = randomBytes(18).toString("base64url");
  await db.user.update({ where: { email: ADMIN.email }, data: { passwordHash: await bcrypt.hash(password, 10) } });
  return password;
}

const sessions = new Map();
async function v1Login(person, password) {
  const r = await call("POST", "/auth/login", { body: { email: person.email, password } });
  return must(r, [200, 201], `login ${person.key}`).accessToken;
}

async function adminToken(db) {
  if (!sessions.has("admin")) sessions.set("admin", await v1Login(ADMIN, await adminPassword(db)));
  return sessions.get("admin");
}

const users = new Map();
async function userId(db, person) {
  if (!users.has(person.email)) users.set(person.email, (await db.user.findUnique({ where: { email: person.email } }))?.id ?? null);
  return users.get(person.email);
}

/** Contraseña nueva de un solo uso por la API del Administrador (PATCH users/:id/password). */
async function oneTimePassword(db, person) {
  if (person.key === "admin") return adminPassword(db);
  const password = randomBytes(18).toString("base64url");
  must(await call("PATCH", `/users/${await userId(db, person)}/password`, { token: await adminToken(db), body: { password } }), [200, 204], `contraseña ${person.key}`);
  return password;
}

async function directivaToken(db) {
  if (!sessions.has("directiva")) sessions.set("directiva", await v1Login(DIRECTIVA, await oneTimePassword(db, DIRECTIVA)));
  return sessions.get("directiva");
}

/** Sesión V2 BODY + registro de cliente determinista + vínculo: como una instalación. */
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

// ── Órdenes ──
async function bootstrap() {
  const admin = new PrismaClient({ datasources: { db: { url: pgAdmin() } } });
  const exists = await admin.$queryRawUnsafe(`SELECT 1 FROM pg_database WHERE datname = '${DATABASE}'`);
  if (exists.length === 0) {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${DATABASE}"`);
    log(`base ${DATABASE} creada`);
  }
  await admin.$disconnect();
  const deploy = spawnSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: urlOf(DATABASE) },
    encoding: "utf8",
  });
  if (deploy.status !== 0) throw new Error(`migrate deploy: ${deploy.stderr.slice(-400)}`);
  log("migraciones aplicadas (prisma migrate deploy)");
  const db = new PrismaClient({ datasources: { db: { url: urlOf(DATABASE) } } });
  const tenant =
    (await db.tenant.findUnique({ where: { slug: TENANT_SLUG } })) ??
    (await db.tenant.create({ data: { name: TENANT_NAME, slug: TENANT_SLUG } }));
  if (!(await db.user.findUnique({ where: { email: ADMIN.email } }))) {
    await db.user.create({
      data: {
        tenantId: tenant.id,
        name: ADMIN.name,
        email: ADMIN.email,
        passwordHash: await bcrypt.hash(randomBytes(24).toString("base64url"), 10),
        role: "ADMINISTRADOR",
        members: { create: { tenantId: tenant.id, role: "ADMINISTRADOR" } },
      },
    });
    log("Administrador DEMO creado (directo: no existe API para el primero)");
  }
  log(`identidad: tenant ${TENANT_SLUG} (${tenant.id.slice(0, 8)}) en la base ${DATABASE}`);
  await db.$disconnect();
}

async function seed() {
  const { db, tenant } = await demoDb();
  const base = demoDate();
  log(`siembra con semilla «${SEED}» y fecha de DEMO ${base.toISOString().slice(0, 10)}`);

  // 1. Personas (POST /users del Administrador; no se duplican: se comprueba el correo).
  for (const person of PEOPLE.slice(1)) {
    if (await userId(db, person)) continue;
    must(
      await call("POST", "/users", {
        token: await adminToken(db),
        body: { name: person.name, email: person.email, password: randomBytes(18).toString("base64url"), role: person.role },
      }),
      [200, 201],
      `alta ${person.key}`,
    );
    users.delete(person.email);
    log(`alta ${person.role} ${person.key}`);
  }

  const dir = await directivaToken(db);
  // 2. Productos centrales.
  const existingProducts = listOf((await call("GET", "/inventory/products", { token: dir })).json);
  const productId = {};
  for (const [key, name, unit] of PRODUCTS) {
    const found = existingProducts.find((p) => p.name === name);
    productId[key] = found ? found.id : must(await call("POST", "/inventory/products", { token: dir, body: { name, unit } }), [200, 201], `producto ${key}`).id;
  }

  // 3. Temporada.
  const seasons = listOf((await call("GET", "/estimation/seasons", { token: dir })).json);
  const season =
    seasons.find((s) => s.season?.key === SEASON.key) ??
    must(await call("POST", "/estimation/seasons", { token: dir, body: { contract_version: 1, ...SEASON } }), [200, 201], "temporada");
  const seasonRef = season.season.season_ref;

  // 4. Campañas históricas: abrir, consumo de 3 agricultores (push real), cerrar y sellar (API real).
  const campaigns = () => call("GET", "/campaigns", { token: dir }).then((r) => listOf(r.json));
  const byName = async (name) => (await campaigns()).find((c) => c.name === name);
  for (const { year, rows } of HISTORY) {
    const name = `Invierno ${year} (DEMO)`;
    let campaign = await byName(name);
    if (!campaign) {
      campaign = must(await call("POST", "/campaigns", { token: dir, body: { name, startDate: `${year}-05-01T12:00:00.000Z`, estimatedEndDate: `${year}-09-28T12:00:00.000Z` } }), [200, 201], name);
    }
    const seal = await call("GET", `/collective/campaigns/${campaign.id}/seal`, { token: dir });
    if (seal.json?.state === "SEALED") {
      log(`${name}: ya sellada`);
      continue;
    }
    if (campaign.status === "PLANIFICADA") must(await call("POST", `/campaigns/${campaign.id}/open`, { token: dir, body: {} }), [200, 201], `abrir ${name}`);
    if ((await byName(name)).status === "ABIERTA") {
      for (const [product, quantities] of Object.entries(rows)) {
        for (const [i, quantity] of quantities.entries()) {
          await push(db, FARMERS.find((f) => f.key === HISTORY_FARMERS[i]), "CONSUMPTION_TOTAL", campaign.id, productId[product], quantity, `hist|${year}|${product}`);
        }
      }
      must(await call("POST", `/campaigns/${campaign.id}/close`, { token: dir, body: {} }), [200], `cerrar ${name}`);
    }
    const state = must(await call("GET", `/collective/campaigns/${campaign.id}/seal`, { token: dir }), [200], `revisión ${name}`);
    if (!state.can_seal) throw new Error(`${name}: no se puede sellar (${JSON.stringify(state.blocked_by)})`);
    must(await call("POST", `/collective/campaigns/${campaign.id}/seal`, { token: dir, body: { confirmed: true, review_ref: state.review.review_ref } }), [200, 201], `sellar ${name}`);
    log(`${name}: consumo publicado, cerrada y sellada`);
  }

  // 5. Campaña actual (objetivo de la estimación y destino de las necesidades).
  const currentName = currentCampaignName();
  let current = await byName(currentName);
  if (!current) {
    current = must(
      await call("POST", "/campaigns", { token: dir, body: { name: currentName, startDate: daysFrom(base, -20).toISOString(), estimatedEndDate: daysFrom(base, 130).toISOString() } }),
      [200, 201],
      currentName,
    );
  }
  if ((await byName(currentName)).status === "PLANIFICADA") must(await call("POST", `/campaigns/${current.id}/open`, { token: dir, body: {} }), [200, 201], `abrir ${currentName}`);

  // 6. Clasificación en la temporada (API real); sólo las que falten.
  const classified = listOf((await call("GET", `/estimation/campaign-classifications?season_ref=${seasonRef}`, { token: dir })).json);
  const isClassified = (id) => classified.some((c) => c.campaign?.campaign_ref === id);
  for (const c of await campaigns()) {
    if (!/^Invierno \d{4} \(DEMO\)$/.test(c.name) || isClassified(c.id)) continue;
    must(await call("POST", "/estimation/campaign-classifications", { token: dir, body: { contract_version: 1, campaign_ref: c.id, season_ref: seasonRef } }), [200, 201], `clasificar ${c.name}`);
    log(`clasificada ${c.name}`);
  }

  // 7. Necesidades declaradas de la campaña actual (push real de cada agricultor).
  for (const [product, byFarmer] of Object.entries(NEEDS)) {
    for (const [farmerKey, quantity] of Object.entries(byFarmer)) {
      await push(db, FARMERS.find((f) => f.key === farmerKey), "DECLARED_NEED", current.id, productId[product], quantity, `need|${currentName}|${product}`);
    }
  }
  await closeSessions();
  log(`siembra central terminada; tenant ${tenant.id.slice(0, 8)}`);
  await db.$disconnect();
}

/** Push real con operationId determinista; si Central ya lo tiene, no se reenvía. */
async function push(db, farmer, projectionType, campaignId, productRef, quantity, key) {
  const session = await farmerSession(db, farmer);
  const operationId = uuidFor(`op|${key}|${farmer.key}`);
  const known = await call("GET", `/sync/v1/operations/${operationId}`, { token: session.token });
  if (known.status === 200) return;
  const ack = must(
    await call("POST", "/sync/v1/push", {
      token: session.token,
      body: {
        contractVersion: 1,
        operationId,
        projectionType,
        action: "PUBLISH",
        causal: { predecessorOperationId: null, reconciliationReference: null },
        payload: { campaign_ref: campaignId, product_ref: productRef, base_unit: "ML", quantity_base: quantity },
      },
    }),
    [200],
    `push ${key} ${farmer.key}`,
  );
  if (ack.outcome !== "APPLIED" && ack.outcome !== "ALREADY_APPLIED") throw new Error(`push ${key} ${farmer.key}: ${ack.outcome}/${ack.code}`);
}

async function verify() {
  const { db, tenant } = await demoDb();
  const dir = await directivaToken(db);
  const roles = await db.member.groupBy({ by: ["role"], where: { tenantId: tenant.id, isActive: true }, _count: true });
  log(`Members activos: ${roles.map((r) => `${r.role} ${r._count}`).join(", ")}`);
  for (const c of listOf((await call("GET", "/campaigns", { token: dir })).json).sort((a, b) => a.startDate.localeCompare(b.startDate))) {
    const seal = await call("GET", `/collective/campaigns/${c.id}/seal`, { token: dir });
    log(`campaña ${c.name}: ${c.status}${seal.json?.state === "SEALED" ? ", sellada" : ""}`);
  }
  const current = listOf((await call("GET", "/campaigns", { token: dir })).json).find((c) => c.name === currentCampaignName());
  const summary = await call("GET", `/collective/campaigns/${current.id}/summary`, { token: dir });
  log(`consolidado de ${current.name}: HTTP ${summary.status}`);
  for (const cell of summary.json?.cells ?? []) {
    log(`  ${cell.product_name} · ${cell.projection_type}: ${cell.status} ${cell.total_presentation ?? "(sin cifra)"} ${cell.presentation_unit} · aportantes ${cell.contributors ?? "-"}${cell.pending_changes ? " · cambios pendientes" : ""}`);
  }
  const contributions = await db.syncV1Contribution.groupBy({ by: ["projectionType", "status"], where: { tenantId: tenant.id }, _count: true });
  log(`aportaciones: ${contributions.map((r) => `${r.projectionType} ${r.status} ${r._count}`).join(", ")}`);
  const seals = await db.collectiveSeal.count({ where: { tenantId: tenant.id } });
  const jobs = await db.estimationJob.groupBy({ by: ["status"], where: { tenantId: tenant.id }, _count: true });
  log(`sellados: ${seals}; trabajos de estimación: ${jobs.map((j) => `${j.status} ${j._count}`).join(", ") || "ninguno"}`);
  await closeSessions();
  await db.$disconnect();
}

async function password(roleKey) {
  const person = PEOPLE.find((p) => p.key === roleKey);
  if (!person) throw new Error(`rol desconocido: ${roleKey} (use ${PEOPLE.map((p) => p.key).join(", ")})`);
  const { db } = await demoDb();
  const value = await oneTimePassword(db, person);
  execFileSync("clip.exe", { input: value });
  log(`contraseña nueva de un solo uso de ${person.email} copiada al portapapeles (no se muestra); la anterior deja de servir`);
  await closeSessions();
  await db.$disconnect();
}

async function checkIdentity() {
  const { db, tenant } = await demoDb();
  const others = await db.tenant.count({ where: { slug: { not: TENANT_SLUG } } });
  if (others > 0) throw new Error("la base tiene otros tenants: no es una DEMO limpia");
  log(`identidad DEMO confirmada: base ${DATABASE}, tenant ${tenant.slug}`);
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
  let value = await oneTimePassword(db, person);
  execFileSync("adb", ["-s", serial, "shell", "input", "text", value]);
  value = null;
  log(`contraseña de un solo uso de ${person.key} tecleada en el campo de contraseña (no se muestra ni se guarda)`);
  await closeSessions();
  await db.$disconnect();
}

/** Cuerpo de GET /sync/v1/references de un agricultor, como lo lee la app. */
async function references(roleKey, out) {
  const farmer = FARMERS.find((f) => f.key === roleKey);
  if (!farmer) throw new Error(`agricultor desconocido: ${roleKey}`);
  const { db } = await demoDb();
  const session = await farmerSession(db, farmer);
  const r = await call("GET", "/sync/v1/references", { token: session.token, raw: true });
  must(r, [200], "referencias");
  require("node:fs").writeFileSync(out, r.text);
  log(`referencias de ${farmer.key} guardadas en ${out}`);
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

const [command, arg, arg2] = process.argv.slice(2);
const commands = { bootstrap, seed, verify, password: () => password(arg), "check-identity": checkIdentity, "credential-adb": () => credentialAdb(arg, arg2), references: () => references(arg, arg2), "password-pipe": () => passwordPipe(arg) };
if (!commands[command]) {
  console.error(`orden desconocida: ${command}`);
  process.exit(2);
}
commands[command]().catch((error) => {
  console.error(`ERROR ${error.message}`);
  process.exit(1);
});
