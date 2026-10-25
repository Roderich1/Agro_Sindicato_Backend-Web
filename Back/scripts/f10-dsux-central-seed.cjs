/**
 * F10 usabilidad (RNF-07), dataset DS-UX del Central (protocolo v1.4 §3.3.1 y
 * docs/evaluation/usabilidad/09_fixture_y_valores_esperados.md §3): datos
 * SINTÉTICOS sobre una base local desechable, por el patrón de
 * f07-synthetic-seed.cjs. Las necesidades declaradas se publican por la API
 * real (`POST /api/v1/sync/v1/push`); la base sólo recibe la identidad
 * (tenant, cuentas, Members, registro de cliente y sesión de los aportantes),
 * la campaña y el catálogo.
 *
 *   F10_UX_TARGET=web    tenant de la evaluación Web: «Verano Demo»; Glifosato
 *                        Demo, Bellator y Belator (sin asociar) en L; seis
 *                        AGRICULTOR M1–M6 y ningún otro; Directiva y
 *                        Administrador. Composición fijada por Roderich Rendón
 *                        el 2026-10-18: Glifosato M1 20, M2 35, M3 45, M4 50 L;
 *                        Bellator M1 3, M2 4, M3 5 L; Belator M1 1, M2 2, M3 3 L;
 *                        M5 y M6 nada. Sin asociaciones ni borradores.
 *   F10_UX_TARGET=movil  tenant de las sesiones Móvil: «Verano Demo» ABIERTA y
 *                        activa desde el día de sesión − 30 y sin fin;
 *                        Glifosato Demo y Bellator activos en L; cuentas
 *                        AGRICULTOR para los participantes. Escribe el JSON
 *                        literal de GET /api/v1/sync/v1/references en
 *                        F10_UX_REFERENCES con una cuenta lectora propia, que
 *                        queda revocada y desactivada al terminar.
 *
 * «Restablecer» = sembrar un tenant NUEVO con otra etiqueta (F10_UX_LABEL: D01,
 * D02, X01…). Nada se borra: las asociaciones y las divulgaciones colectivas no
 * admiten DELETE (disparadores de la migración 20261016043000) y no se
 * desactiva ninguna protección. Si el tenant de la etiqueta ya existe, se niega.
 *
 * Sólo desarrollo: se niega con NODE_ENV=production, con una base que no sea
 * local o sin F10_UX_SYNTHETIC_SEED=yes. Nunca imprime contraseñas ni tokens.
 *
 * Entorno: DATABASE_URL, JWT_SECRET (el de la API en marcha), API_URL,
 * F10_UX_PASSWORD (contraseña de las cuentas que inician sesión, sólo en el
 * proceso), F10_UX_TARGET, F10_UX_LABEL, F10_UX_SESSION_DATE (AAAA-MM-DD, día
 * civil en America/La_Paz), F10_UX_SEED (por defecto 20261018),
 * F10_UX_ACCOUNTS (movil: códigos separados por comas, por defecto
 * X01,P01,P02,P03,P04,P05), F10_UX_REFERENCES (movil: ruta del JSON),
 * F10_UX_MANIFEST (opcional: ruta del manifiesto).
 */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { createHash, randomBytes } = require("node:crypto");
const { mkdirSync, writeFileSync } = require("node:fs");
const { dirname } = require("node:path");

const GENERATOR = "f10-dsux-central-seed v1";
const env = process.env;
if (env.NODE_ENV === "production") throw new Error("Refused: NODE_ENV=production");
if (env.F10_UX_SYNTHETIC_SEED !== "yes") throw new Error("Refused: set F10_UX_SYNTHETIC_SEED=yes");
const host = new URL(env.DATABASE_URL).hostname;
if (!["127.0.0.1", "localhost"].includes(host)) throw new Error("Refused: database is not local");
for (const key of ["JWT_SECRET", "API_URL", "F10_UX_PASSWORD", "F10_UX_TARGET", "F10_UX_LABEL", "F10_UX_SESSION_DATE"]) {
  if (!env[key]) throw new Error(`Missing ${key}`);
}
const TARGET = env.F10_UX_TARGET;
if (!["web", "movil"].includes(TARGET)) throw new Error("F10_UX_TARGET must be web or movil");
const LABEL = env.F10_UX_LABEL;
if (!/^[A-Za-z0-9]{1,12}$/.test(LABEL)) throw new Error("F10_UX_LABEL: 1–12 letters or digits");
const SEED = env.F10_UX_SEED ?? "20261018";
const SESSION_DATE = env.F10_UX_SESSION_DATE;
/**
 * A real calendar date AAAA-MM-DD, never normalized: built in UTC, its year,
 * month and day must come back unchanged (2026-02-31 or 2026-02-29 are
 * refused, 2024-02-29 is accepted). Checked before any connection or write,
 * and for every target.
 */
function isCalendarDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
if (!isCalendarDate(SESSION_DATE)) {
  throw new Error(`F10_UX_SESSION_DATE must be a real calendar date AAAA-MM-DD (got "${SESSION_DATE}")`);
}
if (TARGET === "movil" && !env.F10_UX_REFERENCES) throw new Error("Missing F10_UX_REFERENCES");

/** Composición Web fijada (litros por miembro). M5 y M6 existen y no aportan. */
const WEB_NEEDS = [
  ["M1", "Glifosato Demo", 20], ["M2", "Glifosato Demo", 35], ["M3", "Glifosato Demo", 45], ["M4", "Glifosato Demo", 50],
  ["M1", "Bellator", 3], ["M2", "Bellator", 4], ["M3", "Bellator", 5],
  ["M1", "Belator", 1], ["M2", "Belator", 2], ["M3", "Belator", 3],
];
const WEB_MEMBERS = ["M1", "M2", "M3", "M4", "M5", "M6"];
const WEB_PRODUCTS = ["Glifosato Demo", "Bellator", "Belator"];
const MOBILE_PRODUCTS = ["Glifosato Demo", "Bellator"];
const CAMPAIGN = "Verano Demo";

const prisma = new PrismaClient();
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const slugLabel = LABEL.toLowerCase();

/** UUID v4 determinista: sha256(semilla, destino, etiqueta, nombre). */
function uuid(...parts) {
  const h = createHash("sha256").update([SEED, TARGET, LABEL, ...parts].join("\u0000")).digest("hex").split("");
  h[12] = "4";
  h[16] = "89ab"[parseInt(h[16], 16) % 4];
  const s = h.slice(0, 32).join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

/** Medianoche del día civil de La Paz (UTC−4, sin horario de verano), desplazada en días. */
function laPazDay(offsetDays) {
  const d = new Date(`${SESSION_DATE}T04:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d;
}

async function user(tenantId, code, name, role, passwordHash) {
  const id = uuid("user", code);
  const memberId = uuid("member", code);
  const email = `${code.toLowerCase()}-${slugLabel}@f10ux.example.test`;
  await prisma.user.create({
    data: { id, tenantId, name, email, passwordHash, role, members: { create: { id: memberId, tenantId, role } } },
  });
  return { code, id, memberId, email, role, tenantId };
}

/** Registro de cliente y sesión Auth V2 reales, y un token de acceso sólo en memoria (patrón f07). */
async function farmerToken(person, minutes) {
  const registration = await prisma.clientRegistration.create({
    data: {
      id: uuid("registration", person.code),
      tenantId: person.tenantId,
      memberId: person.memberId,
      clientIdHash: createHash("sha256").update(uuid("client", person.code)).digest("hex"),
    },
  });
  const session = await prisma.authSession.create({
    data: {
      id: uuid("session", person.code),
      memberId: person.memberId,
      clientRegistrationId: registration.id,
      refreshTransport: "BODY",
      expiresAt: new Date(Date.now() + minutes * 60 * 1000),
    },
  });
  const token = jwt.sign(
    { sub: person.id, email: person.email, tenantId: person.tenantId, role: "AGRICULTOR", memberId: person.memberId, sessionId: session.id, ver: 2 },
    env.JWT_SECRET,
    { expiresIn: `${minutes}m` },
  );
  return { token, registrationId: registration.id, sessionId: session.id };
}

async function push(token, body) {
  for (;;) {
    const res = await fetch(`${env.API_URL}/api/v1/sync/v1/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (res.status === 429) {
      await sleep(5000);
      continue;
    }
    const json = await res.json();
    if (res.status !== 200 || json.outcome !== "APPLIED") throw new Error(`push ${res.status} ${json.outcome ?? ""} ${json.code ?? ""}`);
    await sleep(3200); // 20 peticiones por minuto y ruta (ThrottlerGuard)
    return json;
  }
}

async function tenant(kind) {
  const slug = `f10ux-${TARGET}-${slugLabel}`;
  if (await prisma.tenant.findUnique({ where: { slug } })) {
    throw new Error(`Refused: tenant ${slug} already exists (seed a new F10_UX_LABEL; nothing is deleted)`);
  }
  const id = uuid("tenant");
  await prisma.tenant.create({ data: { id, slug, name: `Sindicato Demo (${kind}, ${LABEL})` } });
  return { id, slug };
}

async function campaign(tenantId) {
  const id = uuid("campaign", CAMPAIGN);
  await prisma.agriculturalCampaign.create({
    data: { id, tenantId, name: CAMPAIGN, status: "ABIERTA", isActive: true, startDate: laPazDay(-30), estimatedEndDate: null },
  });
  return { id, name: CAMPAIGN, start_date: laPazDay(-30).toISOString(), end_date: null };
}

async function products(tenantId, names) {
  const ids = {};
  for (const name of names) {
    ids[name] = (await prisma.product.create({ data: { id: uuid("product", name), tenantId, name, unit: "L" } })).id;
  }
  return ids;
}

function fingerprint(manifest) {
  return createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
}

async function seedWeb() {
  const password = await bcrypt.hash(env.F10_UX_PASSWORD, 10);
  const unusable = `unusable-${randomBytes(16).toString("hex")}`;
  const t = await tenant("Web");
  const directiva = await user(t.id, "directiva", "Directiva Demo", "DIRECTIVA", password);
  const presidente = await user(t.id, "presidente", "Presidente Demo", "ADMINISTRADOR", password);
  const members = {};
  for (const code of WEB_MEMBERS) members[code] = await user(t.id, code, `Socio Demo ${code}`, "AGRICULTOR", unusable);
  const c = await campaign(t.id);
  const p = await products(t.id, WEB_PRODUCTS);
  const tokens = {};
  for (const code of new Set(WEB_NEEDS.map(([m]) => m))) tokens[code] = (await farmerToken(members[code], 30)).token;
  const contributions = [];
  for (const [member, product, litres] of WEB_NEEDS) {
    const operationId = uuid("operation", member, product);
    await push(tokens[member], {
      contractVersion: 1,
      operationId,
      projectionType: "DECLARED_NEED",
      action: "PUBLISH",
      causal: { predecessorOperationId: null, reconciliationReference: null },
      payload: { campaign_ref: c.id, product_ref: p[product], base_unit: "ML", quantity_base: String(litres * 1000) },
    });
    contributions.push({ member, product, projection_type: "DECLARED_NEED", base_unit: "ML", quantity_base: String(litres * 1000) });
  }
  const dataset = {
    target: TARGET, seed: SEED, session_date: SESSION_DATE, campaign: CAMPAIGN,
    products: WEB_PRODUCTS.map((name) => ({ name, unit: "L" })),
    agricultores: WEB_MEMBERS, contributions,
  };
  return {
    generator: GENERATOR, label: LABEL, tenant: t, campaign: c, products: p,
    accounts: { directiva: directiva.email, administrador: presidente.email },
    members: Object.fromEntries(WEB_MEMBERS.map((code) => [code, members[code].memberId])),
    pushes: contributions.length, dataset, dataset_sha256: fingerprint(dataset),
  };
}

async function seedMobile() {
  const password = await bcrypt.hash(env.F10_UX_PASSWORD, 10);
  const unusable = `unusable-${randomBytes(16).toString("hex")}`;
  const codes = (env.F10_UX_ACCOUNTS ?? "X01,P01,P02,P03,P04,P05").split(",").map((s) => s.trim()).filter(Boolean);
  for (const code of codes) if (!/^[A-Za-z0-9]{1,8}$/.test(code)) throw new Error(`F10_UX_ACCOUNTS: invalid code ${code}`);
  const t = await tenant("Móvil");
  const accounts = {};
  for (const code of codes) accounts[code] = (await user(t.id, code, `Participante ${code}`, "AGRICULTOR", password)).email;
  const c = await campaign(t.id);
  const p = await products(t.id, MOBILE_PRODUCTS);
  // Lectura de las referencias con la API real, desde una cuenta propia que no participa.
  const reader = await user(t.id, "lector", "Lector de referencias (no participa)", "AGRICULTOR", unusable);
  const { token, registrationId, sessionId } = await farmerToken(reader, 5);
  const res = await fetch(`${env.API_URL}/api/v1/sync/v1/references`, { headers: { Authorization: `Bearer ${token}` } });
  const literal = await res.text();
  if (res.status !== 200) throw new Error(`references ${res.status}`);
  const refs = JSON.parse(literal);
  const now = new Date();
  await prisma.authSession.update({ where: { id: sessionId }, data: { status: "REVOKED", revokedAt: now } });
  await prisma.clientRegistration.update({ where: { id: registrationId }, data: { status: "REVOKED", revokedAt: now } });
  await prisma.member.update({ where: { id: reader.memberId }, data: { isActive: false } });
  await prisma.user.update({ where: { id: reader.id }, data: { isActive: false } });
  // Comprobación del requisito de C antes de entregar el archivo.
  const camp = refs.campaigns.find((x) => x.name === CAMPAIGN);
  const from = laPazDay(-14).getTime();
  const to = laPazDay(30).getTime();
  const ok =
    camp && camp.status === "ABIERTA" && camp.accepts_contributions === true &&
    Date.parse(camp.start_date) <= from && (camp.end_date === null || Date.parse(camp.end_date) >= to) &&
    MOBILE_PRODUCTS.every((name) => refs.products.filter((x) => x.name === name && x.unit === "L" && x.base_unit === "ML" && x.is_active && x.linkable).length === 1);
  if (!ok) throw new Error("references do not meet the DS-UX mobile requirement");
  // Mismo tenant que las cuentas: las referencias leídas son exactamente la
  // campaña y los productos creados aquí, y no hay otros en ese tenant.
  const sameTenant =
    refs.campaigns.length === 1 && camp.campaign_ref === c.id &&
    refs.products.length === MOBILE_PRODUCTS.length &&
    MOBILE_PRODUCTS.every((name) => refs.products.find((x) => x.name === name).product_ref === p[name]);
  if (!sameTenant) throw new Error("references are not exactly this tenant's campaign and products");
  mkdirSync(dirname(env.F10_UX_REFERENCES), { recursive: true });
  writeFileSync(env.F10_UX_REFERENCES, literal);
  const dataset = {
    target: TARGET, seed: SEED, session_date: SESSION_DATE, campaign: CAMPAIGN,
    campaign_period: { start_date: c.start_date, end_date: null },
    products: MOBILE_PRODUCTS.map((name) => ({ name, unit: "L" })), participants: codes,
  };
  return {
    generator: GENERATOR, label: LABEL, tenant: t, campaign: c, products: p, accounts,
    references: {
      path_written: true,
      sha256: createHash("sha256").update(literal).digest("hex"),
      read_by: "a reader account of this same tenant (the tenant of every participant account), revoked and deactivated afterwards",
      tenant_slug: t.slug,
      same_tenant_as_accounts: true,
      campaign_ref_is_this_tenant: true,
      product_refs_are_this_tenant: true,
    },
    dataset, dataset_sha256: fingerprint(dataset),
  };
}

async function main() {
  const manifest = TARGET === "web" ? await seedWeb() : await seedMobile();
  const text = `${JSON.stringify(manifest, null, 2)}\n`;
  if (env.F10_UX_MANIFEST) {
    mkdirSync(dirname(env.F10_UX_MANIFEST), { recursive: true });
    writeFileSync(env.F10_UX_MANIFEST, text);
  }
  // Ids, nombres, correos sintéticos y conteos: ningún secreto.
  process.stdout.write(text);
}

main()
  .catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
