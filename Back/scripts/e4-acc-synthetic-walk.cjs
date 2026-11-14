/**
 * E4 (acceso por rol y totales sin umbral): siembra SINTÉTICA y recorrido de
 * la API real en marcha, para la evidencia del Backend y para que la Web
 * (sesión B) y el orquestador tengan datos con que probar.
 *
 * Siembra un tenant NUEVO por ejecución (E4_LABEL), con:
 * - Directiva D1 y D2, Administración A1 y A2 (inician sesión con E4_PASSWORD,
 *   contraseña que sólo vive en el proceso; nunca se imprime);
 * - agricultores F1, F2 y F3 (también con E4_PASSWORD; en el recorrido, sus
 *   sesiones del canal del agricultor se firman con el JWT_SECRET de la API
 *   en marcha, sólo en memoria);
 * - una campaña ABIERTA y dos productos (L y KG).
 *
 * Con E4_WALK=yes recorre después, por HTTP: Directiva frente a
 * Administración, contratos 1–4 del agricultor, códigos retirados, cambio de
 * rol y deshabilitación en la petición siguiente, sustitución y cierre.
 * Imprime sólo estados y extractos sin tokens ni contraseñas.
 *
 * Sólo desarrollo: se niega con NODE_ENV=production, con una base que no sea
 * local o sin E4_SYNTHETIC_SEED=yes. Nada se borra.
 *
 * Entorno: DATABASE_URL, E4_PASSWORD, E4_LABEL (1–12 letras o dígitos),
 * E4_SYNTHETIC_SEED=yes; con E4_WALK=yes además JWT_SECRET (el de la API) y
 * API_URL (por ejemplo http://127.0.0.1:3400).
 */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { randomBytes, randomUUID } = require("node:crypto");

const env = process.env;
if (env.NODE_ENV === "production") throw new Error("Refused: NODE_ENV=production");
if (env.E4_SYNTHETIC_SEED !== "yes") throw new Error("Refused: set E4_SYNTHETIC_SEED=yes");
if (!["127.0.0.1", "localhost"].includes(new URL(env.DATABASE_URL).hostname)) throw new Error("Refused: database is not local");
for (const key of ["E4_PASSWORD", "E4_LABEL"]) if (!env[key]) throw new Error(`Missing ${key}`);
if (env.E4_WALK === "yes") for (const key of ["JWT_SECRET", "API_URL"]) if (!env[key]) throw new Error(`Missing ${key} (needed by E4_WALK)`);
const LABEL = env.E4_LABEL;
if (!/^[A-Za-z0-9]{1,12}$/.test(LABEL)) throw new Error("E4_LABEL: 1–12 letters or digits");
const API = (env.API_URL ?? "").replace(/\/$/, "");
const prisma = new PrismaClient();

function farmerToken(member, user, sessionId) {
  return jwt.sign(
    { sub: user.id, email: user.email, tenantId: member.tenantId, role: member.role, memberId: member.id, sessionId, ver: 2 },
    env.JWT_SECRET,
    { expiresIn: "15m" },
  );
}

async function person(tenantId, code, role, passwordHash) {
  const user = await prisma.user.create({
    data: {
      tenantId,
      name: `${code} sintético ${LABEL}`,
      email: `e4-${LABEL.toLowerCase()}-${code.toLowerCase()}@example.test`,
      passwordHash,
      role,
      members: { create: { tenantId, role } },
    },
    include: { members: true },
  });
  return { user, member: user.members[0] };
}

async function seed() {
  if (await prisma.tenant.findFirst({ where: { slug: `e4-${LABEL.toLowerCase()}` } })) throw new Error(`Tenant e4-${LABEL} already exists`);
  const hash = await bcrypt.hash(env.E4_PASSWORD, 10);
  const tenant = await prisma.tenant.create({ data: { name: `Sindicato sintético E4 ${LABEL}`, slug: `e4-${LABEL.toLowerCase()}` } });
  const other = await prisma.tenant.create({ data: { name: `Otro sindicato sintético E4 ${LABEL}`, slug: `e4-${LABEL.toLowerCase()}-b` } });
  const people = {};
  for (const [code, role] of [["D1", "DIRECTIVA"], ["D2", "DIRECTIVA"], ["A1", "ADMINISTRADOR"], ["A2", "ADMINISTRADOR"]]) {
    people[code] = await person(tenant.id, code, role, hash);
  }
  people.DB = await person(other.id, "DB", "DIRECTIVA", hash);
  for (const code of ["F1", "F2", "F3"]) {
    // Farmers also log in with E4_PASSWORD (the phone, or the orchestrator's own checks).
    people[code] = await person(tenant.id, code, "AGRICULTOR", hash);
  }
  const campaign = await prisma.agriculturalCampaign.create({
    data: { tenantId: tenant.id, name: `Campaña sintética E4 ${LABEL}`, status: "ABIERTA", isActive: true, startDate: new Date("2026-09-01T00:00:00.000Z") },
  });
  const p1 = await prisma.product.create({ data: { tenantId: tenant.id, name: `Herbicida sintético E4 ${LABEL}`, unit: "L" } });
  const p2 = await prisma.product.create({ data: { tenantId: tenant.id, name: `Fertilizante sintético E4 ${LABEL}`, unit: "kg" } });
  return { tenant, other, people, campaign, p1, p2 };
}

async function farmerSession({ user, member }) {
  const registration = await prisma.clientRegistration.create({
    data: { tenantId: member.tenantId, memberId: member.id, clientIdHash: randomBytes(32).toString("hex") },
  });
  const session = await prisma.authSession.create({
    data: { memberId: member.id, clientRegistrationId: registration.id, refreshTransport: "BODY", expiresAt: new Date(Date.now() + 3600 * 1000) },
  });
  return farmerToken(member, user, session.id);
}

async function login(email) {
  const res = await fetch(`${API}/api/v1/auth/v2/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: env.E4_PASSWORD, refreshTransport: "BODY" }),
  });
  const body = await res.json();
  if (!res.ok || !body.accessToken) throw new Error(`Login failed for a synthetic account (${res.status})`);
  return body.accessToken;
}

const out = [];
function log(step, res, extract) {
  out.push({ step, status: res.status, ...(extract ? { extract } : {}) });
}

async function call(token, method, path, body, contract) {
  const headers = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (contract) headers["X-Joint-Purchase-Contract"] = contract;
  const res = await fetch(`${API}/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, body: json };
}

const totals = (detail) => (detail.body?.products ?? []).map((p) => [p.name.split(" ")[0], p.totals.participant_count, p.totals.total_quantity_base, p.totals.visibility, p.totals.totals_basis]);
const names = (res) => (res.body?.participants ?? null)?.map((p) => p.name.split(" ")[0]) ?? null;

async function walk(s) {
  const t = {};
  for (const code of ["D1", "D2", "A1", "A2", "DB"]) t[code] = await login(s.people[code].user.email);
  for (const code of ["F1", "F2", "F3"]) t[code] = await farmerSession(s.people[code]);
  const P1 = s.p1.id;
  const P2 = s.p2.id;
  const created = await call(t.D1, "POST", "/joint-purchase-calls", {
    campaign_id: s.campaign.id,
    name: `Compra conjunta sintética E4 ${LABEL}`,
    deadline_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    responsible_user_id: s.people.D1.user.id,
    products: [{ product_ref: P1 }, { product_ref: P2 }],
  });
  log("D1 crea el borrador", created, { contractVersion: created.body?.contractVersion, totals: totals(created) });
  const id = created.body.call_id;
  const opened = await call(t.D1, "POST", `/joint-purchase-calls/${id}/open`, { confirmed: true });
  log("D1 abre", opened, { opened_detail: opened.body?.history?.find((e) => e.kind === "OPENED")?.detail });
  const op = () => randomUUID();
  const confirm = (token, lines, consent, contract, sequence = 1) =>
    call(token, "PUT", `/me/joint-purchase-calls/${id}/participation`, {
      operation_id: op(), sequence, ...(consent ? { consent: { version: consent, accepted_at: new Date().toISOString() } } : {}),
      lines: lines.map(([product_ref, quantity_base]) => ({ product_ref, quantity_base })),
    }, contract);
  let r = await confirm(t.F1, [[P1, "1000"], [P2, "200"]], "CONV-4", "4");
  log("F1 confirma con CONV-4 (contrato 4)", r, { scope: r.body?.participation?.consent_scope?.scope, keys: Object.keys(r.body?.participation ?? {}).sort() });
  r = await confirm(t.F2, [[P1, "2000"]], "CONV-3", "3");
  log("F2 confirma con CONV-3 (contrato 3)", r, { scope: r.body?.participation?.consent_scope?.scope, has_responsible_authorization: "responsible_authorization" in (r.body?.participation ?? {}) });
  r = await confirm(t.F3, [[P2, "300"]], "CONV-1", null);
  log("F3 confirma con CONV-1 (sin cabecera, contrato 1)", r, { keys: Object.keys(r.body?.participation ?? {}).sort() });

  for (const code of ["D1", "A1"]) {
    const d = await call(t[code], "GET", `/joint-purchase-calls/${id}`);
    log(`${code} lee el detalle`, d, { can_view_participants: d.body?.can_view_participants, pending_consent_count: d.body?.pending_consent_count, totals: totals(d) });
    const pa = await call(t[code], "GET", `/joint-purchase-calls/${id}/participants`);
    log(`${code} pide participantes`, pa, pa.status === 200 ? { participants: names(pa), pending_consent_count: pa.body.pending_consent_count } : pa.body);
  }
  for (const contract of [null, "2", "3", "4"]) {
    const l = await call(t.F1, "GET", "/me/joint-purchase-calls", undefined, contract);
    log(`F1 lee la lista con contrato ${contract ?? "1 (sin cabecera)"}`, l, { contractVersion: l.body?.contractVersion, consent_version: l.body?.consent?.version, has_help: typeof l.body?.consent?.help === "string" });
  }
  r = await call(t.F2, "POST", `/me/joint-purchase-calls/${id}/participation/consent`, { operation_id: op(), sequence: 1, scope: "COLLABORATORS", consent: { version: "CONV-3", decided_at: new Date().toISOString() } }, "2");
  log("F2 amplía a colaboradores (contrato 2)", r, r.body);
  r = await confirm(t.F1, [[P1, "1100"]], null, "3", 2);
  log("F1 modifica desde una app de contrato 3 sobre ADMINISTRATION", r, r.body);
  r = await call(t.D1, "POST", `/joint-purchase-calls/${id}/collaborators`, { user_ref: s.people.D2.user.id, grant: "PARTICIPANTS", confirmed: true });
  log("D1 concede PARTICIPANTS", r, r.body);
  r = await call(t.A1, "POST", "/joint-purchase-substitution-permissions", { user_ref: s.people.D2.user.id, reason: "Sintético", confirmed: true });
  log("A1 concede «Sustituir responsable»", r, r.body);
  r = await call(t.A1, "GET", "/joint-purchase-substitution-permissions");
  log("A1 lee la historia del permiso", r, { contractVersion: r.body?.contractVersion, can_grant: r.body?.can_grant, notice: r.body?.notice });
  r = await call(t.DB, "GET", `/joint-purchase-calls/${id}`);
  log("Directiva de otro sindicato lee el detalle", r, r.body);
  r = await call(t.F1, "GET", `/joint-purchase-calls/${id}`);
  log("Agricultor en una ruta institucional", r, r.body);

  // Cambio de rol y deshabilitación: rigen desde la petición siguiente, con el mismo token.
  const a2 = s.people.A2;
  log("A2 pide participantes", await call(t.A2, "GET", `/joint-purchase-calls/${id}/participants`));
  await prisma.member.update({ where: { id: a2.member.id }, data: { role: "DIRECTIVA" } });
  await prisma.user.update({ where: { id: a2.user.id }, data: { role: "DIRECTIVA" } });
  r = await call(t.A2, "GET", `/joint-purchase-calls/${id}/participants`);
  log("A2 pasa a Directiva: siguiente petición", r, r.body);
  await prisma.member.update({ where: { id: a2.member.id }, data: { role: "ADMINISTRADOR" } });
  await prisma.user.update({ where: { id: a2.user.id }, data: { role: "ADMINISTRADOR" } });
  log("A2 vuelve a Administración", await call(t.A2, "GET", `/joint-purchase-calls/${id}/participants`));
  await prisma.member.update({ where: { id: a2.member.id }, data: { isActive: false } });
  r = await call(t.A2, "GET", `/joint-purchase-calls/${id}/participants`);
  log("A2 deshabilitada: siguiente petición", r, r.body);
  await prisma.member.update({ where: { id: a2.member.id }, data: { isActive: true } });

  // Sustitución por la Administración habilitada.
  await prisma.member.update({ where: { id: s.people.D1.member.id }, data: { isActive: false } });
  const sub = (token, to) =>
    call(token, "POST", `/joint-purchase-calls/${id}/responsible`, { request_id: randomUUID(), expected_responsible_version: 1, new_responsible_ref: s.people[to].user.id, reason: "Responsable sintética de baja", confirmed: true });
  r = await sub(t.D2, "A1");
  log("D2 (Directiva) intenta sustituir", r, r.body);
  r = await sub(t.A1, "A1");
  log("A1 intenta nombrarse a sí misma", r, r.body);
  r = await sub(t.A1, "D2");
  log("A1 sustituye a D1 por D2", r, { responsible: r.body?.responsible?.name?.split(" ")[0], version: r.body?.responsible?.version, suspended: r.body?.responsible_changes?.[0]?.suspended_delegations });
  r = await call(t.D2, "GET", `/joint-purchase-calls/${id}/participants`);
  log("D2 (nueva responsable, Directiva) pide participantes", r, r.body);
  r = await call(t.A1, "GET", `/joint-purchase-calls/${id}/participants`);
  log("A1 pide participantes tras la sustitución", r, { participants: names(r) });

  r = await call(t.F2, "POST", `/me/joint-purchase-calls/${id}/participation/consent`, { operation_id: op(), sequence: 1, scope: "ADMINISTRATION", consent: { version: "CONV-4", decided_at: new Date().toISOString() } }, "4");
  log("F2 autoriza a la Administración (contrato 4)", r, { scope: r.body?.participation?.consent_scope?.scope, lines: r.body?.participation?.lines?.map((l) => l.quantity_base) });
  r = await call(t.A1, "GET", `/joint-purchase-calls/${id}/participants`);
  log("A1 pide participantes", r, { participants: names(r), pending_consent_count: r.body?.pending_consent_count });
  r = await call(t.D2, "POST", `/joint-purchase-calls/${id}/close`, { confirmed: true });
  log("D2 cierra", r, { participants: r.body?.participants, lines: r.body?.lines?.map((l) => [l.participant_count, l.total_quantity_base, l.visibility, l.totals_basis]) });
  r = await call(t.A1, "GET", `/joint-purchase-calls/${id}/closing`);
  log("A1 lee el cierre", r, { participants: names(r), lines: r.body?.lines?.map((l) => [l.participant_count, l.total_quantity_base, l.visibility, l.totals_basis]) });
  await prisma.member.update({ where: { id: s.people.D1.member.id }, data: { isActive: true } });
  return id;
}

(async () => {
  const s = await seed();
  const summary = {
    label: LABEL,
    tenant_ref: s.tenant.id,
    campaign_ref: s.campaign.id,
    accounts: Object.fromEntries(Object.entries(s.people).map(([code, p]) => [code, { email: p.user.email, role: p.member.role }])),
  };
  let callId = null;
  if (env.E4_WALK === "yes") callId = await walk(s);
  process.stdout.write(`${JSON.stringify({ seed: summary, call_ref: callId, walk: out }, null, 2)}\n`);
})()
  .catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
