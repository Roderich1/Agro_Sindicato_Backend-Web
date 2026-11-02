// F12-EST-06 (#179): datos SINTÉTICOS para el recorrido Web de la estimación
// contra el backend real. Se ejecuta desde Back/ (usa sus dependencias y los
// generadores sintéticos de las suites). No imprime contraseñas ni tokens: la
// contraseña de un solo uso llega por WALK_PASSWORD y sólo se guarda su hash.
//
//   PG_ADMIN_URL=<postgres desechable> node ../docs/evidence/f12_est_06/control-sintetico.cjs seed <ids.json>
//   PG_ADMIN_URL=<postgres desechable> node ../docs/evidence/f12_est_06/control-sintetico.cjs <orden> <ids.json>
// La URL (con su contraseña) sólo vive en el entorno: `ids.json` guarda el nombre de la base, no la URL.
//
// Órdenes, que simulan lo que haría la operación real sobre la misma base:
//   classify-extra   clasifica otra campaña en INVIERNO (la serie cambia: SOURCES_CHANGED)
//   crash-last-attempt  deja un trabajo de T1 en su último intento con el plazo vencido, como
//                    un proceso caído; el trabajador real lo registra FAILED/RETRIES_EXHAUSTED
//   withdraw         retira la visibilidad de la cifra sellada de C4, como hace F07 cuando un
//                    agricultor cancela después del sellado (SOURCES_WITHDRAWN)
//   demote | promote la Directiva pierde o recupera su rol (permiso perdido)
const { createRequire } = require("node:module");
const { createHash, randomUUID } = require("node:crypto");
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
  const adminUrl = process.env.PG_ADMIN_URL;
  if (!adminUrl) throw new Error("PG_ADMIN_URL");
  const admin = new PrismaClient({ datasources: { db: { url: adminUrl } } });
  const name = `f12_web_${randomUUID().replaceAll("-", "")}`;
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  await admin.$disconnect();
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const deploy = spawnSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url.toString() }, encoding: "utf8",
  });
  if (deploy.status !== 0) throw new Error(`migrate deploy: ${deploy.stderr}`);
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  const f = await seedFixture(db);
  const director = await db.member.findUniqueOrThrow({ where: { id: f.members.directorA }, include: { user: true } });
  if (!process.env.WALK_PASSWORD) throw new Error("WALK_PASSWORD");
  // El Administrador sintético del mismo sindicato (ADMINISTRADOR con funciones de Directiva) usa la misma contraseña de un solo uso.
  const administrator = await db.member.findUniqueOrThrow({ where: { id: f.members.adminA }, include: { user: true } });
  const walkHash = await bcrypt.hash(process.env.WALK_PASSWORD, 10);
  for (const userId of [director.userId, administrator.userId]) await db.user.update({ where: { id: userId }, data: { passwordHash: walkHash } });
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
  // Objetivo propio del recorrido del Administrador: sus ejecuciones no se mezclan con el historial de T1.
  const t3 = await planned("Objetivo sintético invierno 2019 (Administrador)");
  const season = async (key) =>
    (await db.comparabilitySeason.create({ data: { tenantId: f.tenantA, key, definition: `Temporada sintética ${key}`, durationDays: 180, createdByUserId: director.userId, createdByRole: "DIRECTIVA" } })).id;
  const seasons = { INVIERNO: await season("INVIERNO"), VERANO: await season("VERANO") };
  const classify = (campaignId, seasonId) =>
    db.campaignSeasonClassification.create({ data: { tenantId: f.tenantA, campaignId, version: 1, seasonId, classifiedByUserId: director.userId, classifiedByRole: "DIRECTIVA" } });
  for (const s of winter) await classify(s.campaignId, seasons.INVIERNO);
  await classify(t1, seasons.INVIERNO);
  await classify(t3, seasons.INVIERNO);
  for (const s of summer) await classify(s.campaignId, seasons.VERANO);
  await classify(t2, seasons.VERANO);
  const ids = {
    database: name, tenant: f.tenantA, directorEmail: director.user.email, directorMember: director.id, directorUser: director.userId,
    adminEmail: administrator.user.email,
    products: { herbicide, fungicide }, seasons, t1, t2, t3, winterCampaigns: winter.map((s) => s.campaignId), winterSeals: winter.map((s) => s.sealId), summerCampaigns: summer.map((s) => s.campaignId),
  };
  writeFileSync(out, `${JSON.stringify(ids, null, 2)}\n`);
  await db.$disconnect();
}

async function act(name, idsFile) {
  const ids = JSON.parse(readFileSync(idsFile, "utf8"));
  const db = new PrismaClient({ datasources: { db: { url: urlOf(ids.database) } } });
  try {
    if (name === "classify-extra") {
      const extra = await db.agriculturalCampaign.create({ data: { tenantId: ids.tenant, name: "Campaña sintética clasificada después", status: "PLANIFICADA", startDate: new Date("2020-09-01T00:00:00.000Z") } });
      await db.campaignSeasonClassification.create({ data: { tenantId: ids.tenant, campaignId: extra.id, version: 1, seasonId: ids.seasons.INVIERNO, classifiedByUserId: ids.directorUser, classifiedByRole: "DIRECTIVA" } });
    } else if (name === "crash-last-attempt") {
      const job = await db.estimationJob.create({
        data: { tenantId: ids.tenant, requestId: randomUUID(), requestHash: createHash("sha256").update(randomUUID()).digest("hex"), requestedByUserId: ids.directorUser, requestedByRole: "DIRECTIVA", targetCampaignId: ids.t1, productRefs: [ids.products.herbicide], maxAttempts: 3 },
      });
      await db.estimationJob.update({ where: { id: job.id }, data: { status: "RUNNING", attempts: 3, startedAt: new Date(Date.now() - 600000), leaseExpiresAt: new Date(Date.now() - 300000) } });
      process.stdout.write(`${job.id}\n`);
    } else if (name === "withdraw") {
      const seal = ids.winterSeals[ids.winterSeals.length - 1];
      await db.$executeRaw`UPDATE "CollectiveSealEntry" SET "visibilityWithdrawnAt" = now() WHERE "sealId" = ${seal}::uuid AND "projectionType" = 'CONSUMPTION_TOTAL'`;
    } else if (name === "demote" || name === "promote") {
      await db.member.update({ where: { id: ids.directorMember }, data: { role: name === "demote" ? "AGRICULTOR" : "DIRECTIVA" } });
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
