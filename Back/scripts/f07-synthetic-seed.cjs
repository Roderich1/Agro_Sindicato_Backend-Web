/**
 * F07: datos SINTÉTICOS para el recorrido Web (Directiva/Administrador) sobre
 * una base local desechable. Publica las aportaciones del dataset D4 por la
 * API real (`POST /api/v1/sync/v1/push`), al ritmo que permite el throttler.
 *
 * Sólo para desarrollo: se niega con NODE_ENV=production, con una base que no
 * sea local o sin F07_SYNTHETIC_SEED=yes. Nunca imprime contraseñas ni tokens.
 *
 * Entorno: DATABASE_URL, JWT_SECRET (el de la API en marcha), API_URL y
 * WALK_PASSWORD (contraseña de las cuentas sintéticas, sólo en el proceso).
 */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { randomBytes, randomUUID } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

const env = process.env;
if (env.NODE_ENV === "production") throw new Error("Refused: NODE_ENV=production");
if (env.F07_SYNTHETIC_SEED !== "yes") throw new Error("Refused: set F07_SYNTHETIC_SEED=yes");
const host = new URL(env.DATABASE_URL).hostname;
if (!["127.0.0.1", "localhost"].includes(host)) throw new Error("Refused: database is not local");
for (const key of ["JWT_SECRET", "API_URL", "WALK_PASSWORD"]) {
  if (!env[key]) throw new Error(`Missing ${key}`);
}

const prisma = new PrismaClient();
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function csv(name) {
  const [header, ...rows] = readFileSync(resolve(__dirname, "../src/modules/collective/test-support/d4", name), "utf8")
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(","));
  return rows.map((row) => Object.fromEntries(header.map((key, i) => [key, row[i] ?? ""])));
}

async function user(tenantId, name, email, role, passwordHash) {
  const id = randomUUID();
  const memberId = randomUUID();
  await prisma.user.create({
    data: { id, tenantId, name, email, passwordHash, role, members: { create: { id: memberId, tenantId, role } } },
  });
  return { id, memberId, email, role, tenantId };
}

/** Real ClientRegistration + AuthSession and an Auth V2 access token (in memory only). */
async function farmerToken(person) {
  const registration = await prisma.clientRegistration.create({
    data: { tenantId: person.tenantId, memberId: person.memberId, clientIdHash: randomBytes(32).toString("hex") },
  });
  const session = await prisma.authSession.create({
    data: {
      memberId: person.memberId,
      clientRegistrationId: registration.id,
      refreshTransport: "BODY",
      expiresAt: new Date(Date.now() + 3600 * 1000),
    },
  });
  return jwt.sign(
    { sub: person.id, email: person.email, tenantId: person.tenantId, role: "AGRICULTOR", memberId: person.memberId, sessionId: session.id, ver: 2 },
    env.JWT_SECRET,
    { expiresIn: "60m" },
  );
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
    if (res.status !== 200 || json.outcome !== "APPLIED") throw new Error(`push ${res.status} ${json.outcome ?? ""}`);
    await sleep(3200); // 20 requests per minute per route (ThrottlerGuard)
    return body.operationId;
  }
}

async function main() {
  const hash = await bcrypt.hash(env.WALK_PASSWORD, 10);
  const unusable = `unusable-${randomBytes(16).toString("hex")}`;
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  await prisma.tenant.createMany({
    data: [
      { id: tenantA, name: "Sindicato sintético", slug: `f07-sintetico-${tenantA.slice(0, 8)}` },
      { id: tenantB, name: "Sindicato ajeno sintético", slug: `f07-ajeno-${tenantB.slice(0, 8)}` },
    ],
  });
  const people = {
    directiva: await user(tenantA, "Directiva sintética", "directiva@f07.example.test", "DIRECTIVA", hash),
    admin: await user(tenantA, "Presidente sintético", "presidente@f07.example.test", "ADMINISTRADOR", hash),
    F1: await user(tenantA, "Agricultor sintético F1", "f1@f07.example.test", "AGRICULTOR", hash),
    F2: await user(tenantA, "Agricultor sintético F2", "f2@f07.example.test", "AGRICULTOR", unusable),
    F3: await user(tenantA, "Agricultor sintético F3", "f3@f07.example.test", "AGRICULTOR", unusable),
    F4: await user(tenantA, "Agricultor sintético F4 (sin aportes)", "f4@f07.example.test", "AGRICULTOR", unusable),
    other: await user(tenantB, "Directiva ajena sintética", "ajena@f07.example.test", "DIRECTIVA", hash),
  };
  const campaigns = { C1: randomUUID(), C2: randomUUID() };
  await prisma.agriculturalCampaign.createMany({
    data: [
      { id: campaigns.C1, tenantId: tenantA, name: "Campaña Verano 2026 (sintética)", status: "ABIERTA", isActive: true, startDate: new Date("2026-09-01T00:00:00.000Z") },
      { id: campaigns.C2, tenantId: tenantA, name: "Campaña Invierno 2026 (sintética)", status: "ABIERTA", isActive: true, startDate: new Date("2026-05-01T00:00:00.000Z") },
    ],
  });
  const products = {};
  for (const [name, unit] of [["Belator", "L"], ["Bellator", "L"], ["Glifosato F06", "L"], ["Urea F06", "kg"], ["Mancozeb F06", "kg"]]) {
    products[name] = (await prisma.product.create({ data: { tenantId: tenantA, name, unit } })).id;
  }
  const tokens = { F1: await farmerToken(people.F1), F2: await farmerToken(people.F2), F3: await farmerToken(people.F3) };
  let pushes = 0;
  for (const row of csv("F06_EXPECTED_CONTRIBUTIONS.csv")) {
    const base = {
      contractVersion: 1,
      projectionType: row.projection_type,
      payload: { campaign_ref: campaigns[row.campaign], product_ref: products[row.product], base_unit: row.base_unit },
    };
    const publish = (quantity) => ({
      ...base,
      operationId: randomUUID(),
      action: "PUBLISH",
      causal: { predecessorOperationId: null, reconciliationReference: null },
      payload: { ...base.payload, quantity_base: quantity },
    });
    if (row.status === "CANCELLED") {
      const published = await push(tokens[row.farmer], publish("1000"));
      await push(tokens[row.farmer], {
        ...base,
        operationId: randomUUID(),
        action: "CANCEL",
        causal: { predecessorOperationId: published, reconciliationReference: null },
      });
      pushes += 2;
    } else {
      await push(tokens[row.farmer], publish(row.quantity_base));
      pushes += 1;
    }
  }
  // Ids and counts only: no secret.
  process.stdout.write(`${JSON.stringify({ tenantA, tenantB, campaigns, products, pushes }, null, 2)}\n`);
}

main()
  .catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
