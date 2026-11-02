// F12-EST-07-WEB (#180): datos SINTÉTICOS para el recorrido de la copia sin
// conexión contra el backend real. Se ejecuta desde Back/ (usa sus dependencias y
// los generadores sintéticos de las suites). No imprime contraseñas ni tokens: la
// contraseña de un solo uso llega por WALK_PASSWORD y sólo se guarda su hash.
//
//   PG_ADMIN_URL=<postgres desechable> node ../docs/evidence/f12_est_07/control-sintetico.cjs seed <ids.json>
//   PG_ADMIN_URL=<postgres desechable> node ../docs/evidence/f12_est_07/control-sintetico.cjs <orden> <ids.json>
// La URL (con su contraseña) sólo vive en el entorno: `ids.json` guarda el nombre de la base, no la URL.
//
// Identidades: Directiva A, Administrador A y Agricultor A del sindicato A, y una
// Directiva del sindicato B. Órdenes:
//   demote | promote   la Directiva A pierde o recupera su rol (permiso perdido)
//   hide-target | show-target   la campaña objetivo de invierno pasa al sindicato B o vuelve al A
//                               (para el sindicato A, «inexistente o de otro sindicato»: 404)
const { createRequire } = require("node:module");
const { randomUUID } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { readFileSync, writeFileSync } = require("node:fs");
const { resolve } = require("node:path");

const req = createRequire(resolve(process.cwd(), "package.json"));
req("ts-node/register/transpile-only");
req("tsconfig-paths/register");
const { PrismaClient } = req("@prisma/client");
const bcrypt = req("bcrypt");
const { seedFixture } = req("./src/modules/sync-v1/test-support/sync-v1-test-app");
const { sealedConsumptionCampaigns } = req("./src/modules/estimation/test-support/synthetic-sources");

const [command, ...args] = process.argv.slice(2);

function urlOf(database) {
  const url = new URL(process.env.PG_ADMIN_URL);
  url.pathname = `/${database}`;
  return url.toString();
}

async function seed(out) {
  if (!process.env.PG_ADMIN_URL) throw new Error("PG_ADMIN_URL");
  if (!process.env.WALK_PASSWORD) throw new Error("WALK_PASSWORD");
  const admin = new PrismaClient({ datasources: { db: { url: process.env.PG_ADMIN_URL } } });
  const name = `f12_copy_${randomUUID().replaceAll("-", "")}`;
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  await admin.$disconnect();
  const deploy = spawnSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: urlOf(name) }, encoding: "utf8",
  });
  if (deploy.status !== 0) throw new Error(`migrate deploy: ${deploy.stderr}`);
  const db = new PrismaClient({ datasources: { db: { url: urlOf(name) } } });
  const f = await seedFixture(db);
  const hash = await bcrypt.hash(process.env.WALK_PASSWORD, 10);
  const memberOf = (id) => db.member.findUniqueOrThrow({ where: { id }, include: { user: true } });
  const director = await memberOf(f.members.directorA);
  const administrator = await memberOf(f.members.adminA);
  const farmer = await memberOf(f.members.farmerA);
  for (const m of [director, administrator, farmer]) await db.user.update({ where: { id: m.userId }, data: { passwordHash: hash } });
  // Otro sindicato: una Directiva de B, para el cambio de identidad y sindicato.
  const userB = randomUUID();
  const memberB = randomUUID();
  await db.user.create({
    data: {
      id: userB, tenantId: f.tenantB, name: "Directiva sintética B", email: `directivaB-${userB}@example.test`, passwordHash: hash, role: "DIRECTIVA",
      members: { create: { id: memberB, tenantId: f.tenantB, role: "DIRECTIVA" } },
    },
  });

  const herbicide = (await db.product.create({ data: { tenantId: f.tenantA, name: "Herbicida de ensayo", unit: "L" } })).id;
  const fungicide = (await db.product.create({ data: { tenantId: f.tenantA, name: "Fungicida de ensayo", unit: "L" } })).id;
  const common = { tenantId: f.tenantA, sealedByUserId: director.userId, baseUnit: "ML", coverage: { status: "IDENTIFIED", membersInPublishedFigures: 3 } };
  // INVIERNO: el ejemplo de 3.12.5 en mL. VERANO: sólo dos campañas de Fungicida (datos insuficientes).
  const winter = await sealedConsumptionCampaigns(db, { ...common, canonicalProductId: herbicide, firstYear: 2015, quantities: [96000n, 120000n, 104000n, 116000n], namePrefix: "Invierno sintético" });
  const summer = await sealedConsumptionCampaigns(db, { ...common, canonicalProductId: fungicide, firstYear: 2012, quantities: [300n, 600n], namePrefix: "Verano sintético" });
  const planned = async (label) =>
    (await db.agriculturalCampaign.create({ data: { tenantId: f.tenantA, name: label, status: "PLANIFICADA", startDate: new Date("2019-09-01T00:00:00.000Z") } })).id;
  const t1 = await planned("Objetivo sintético invierno 2019");
  const t2 = await planned("Objetivo sintético verano 2019");
  const t3 = await planned("Objetivo sintético sin copia");
  const season = async (key) =>
    (await db.comparabilitySeason.create({ data: { tenantId: f.tenantA, key, definition: `Temporada sintética ${key}`, durationDays: 180, createdByUserId: director.userId, createdByRole: "DIRECTIVA" } })).id;
  const seasons = { INVIERNO: await season("INVIERNO"), VERANO: await season("VERANO") };
  const classify = (campaignId, seasonId) =>
    db.campaignSeasonClassification.create({ data: { tenantId: f.tenantA, campaignId, version: 1, seasonId, classifiedByUserId: director.userId, classifiedByRole: "DIRECTIVA" } });
  for (const s of winter) await classify(s.campaignId, seasons.INVIERNO);
  for (const t of [t1, t3]) await classify(t, seasons.INVIERNO);
  for (const s of summer) await classify(s.campaignId, seasons.VERANO);
  await classify(t2, seasons.VERANO);
  const ids = {
    database: name, tenant: f.tenantA, tenantB: f.tenantB,
    directorEmail: director.user.email, directorUser: director.userId, directorMember: director.id,
    adminEmail: administrator.user.email, adminUser: administrator.userId,
    farmerEmail: farmer.user.email, farmerMember: farmer.id,
    directorBEmail: `directivaB-${userB}@example.test`, directorBUser: userB,
    products: { herbicide, fungicide }, t1, t2, t3,
  };
  writeFileSync(out, `${JSON.stringify(ids, null, 2)}\n`);
  await db.$disconnect();
}

async function act(name, idsFile) {
  const ids = JSON.parse(readFileSync(idsFile, "utf8"));
  const db = new PrismaClient({ datasources: { db: { url: urlOf(ids.database) } } });
  try {
    if (name === "demote" || name === "promote") {
      await db.member.update({ where: { id: ids.directorMember }, data: { role: name === "demote" ? "AGRICULTOR" : "DIRECTIVA" } });
    } else if (name === "hide-target" || name === "show-target") {
      await db.agriculturalCampaign.update({ where: { id: ids.t1 }, data: { tenantId: name === "hide-target" ? ids.tenantB : ids.tenant } });
    } else {
      throw new Error(`orden desconocida: ${name}`);
    }
  } finally {
    await db.$disconnect();
  }
}

(command === "seed" ? seed(args[0]) : act(command, args[0])).catch((error) => {
  process.stderr.write(`${String(error && error.message ? error.message : error).replace(/postgresql:\/\/[^@\s]+@/g, "postgresql://***@")}\n`);
  process.exit(1);
});
