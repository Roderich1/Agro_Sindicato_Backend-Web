// F12-EST-08 (#181): datos SINTÉTICOS para el recorrido Web de la propuesta
// conjunta con la estimación como referencia, contra el backend real. Se
// ejecuta desde Back/ (usa sus dependencias y los generadores sintéticos de
// las suites). No imprime contraseñas ni tokens: la contraseña de un solo uso
// llega por WALK_PASSWORD y sólo se guarda su hash.
//
//   PG_ADMIN_URL=<postgres desechable> node ../docs/evidence/f12_est_08/control-sintetico.cjs seed <ids.json>
//   PG_ADMIN_URL=<postgres desechable> node ../docs/evidence/f12_est_08/control-sintetico.cjs <orden> <ids.json>
// La URL sólo vive en el entorno: `ids.json` guarda el nombre de la base, no la URL.
//
// Órdenes, que simulan lo que haría la operación real sobre la misma base:
//   classify-extra  clasifica otra campaña en INVIERNO (la serie cambia: SOURCES_CHANGED)
//   withdraw        retira la visibilidad de la cifra sellada de la última campaña de
//                   INVIERNO, como hace F07 cuando un agricultor cancela después del
//                   sellado (SOURCES_WITHDRAWN)
//   snapshot        md5 de cada tabla, en JSON por la salida estándar
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
  const adminUrl = process.env.PG_ADMIN_URL;
  if (!adminUrl) throw new Error("PG_ADMIN_URL");
  if (!process.env.WALK_PASSWORD) throw new Error("WALK_PASSWORD");
  const admin = new PrismaClient({ datasources: { db: { url: adminUrl } } });
  const name = `f12_est08_${randomUUID().replaceAll("-", "")}`;
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  await admin.$disconnect();
  const deploy = spawnSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: urlOf(name) }, encoding: "utf8",
  });
  if (deploy.status !== 0) throw new Error(`migrate deploy: ${deploy.stderr}`);
  const db = new PrismaClient({ datasources: { db: { url: urlOf(name) } } });
  const f = await seedFixture(db);
  const director = await db.member.findUniqueOrThrow({ where: { id: f.members.directorA }, include: { user: true } });
  const administrator = await db.member.findUniqueOrThrow({ where: { id: f.members.adminA }, include: { user: true } });
  const walkHash = await bcrypt.hash(process.env.WALK_PASSWORD, 10);
  for (const userId of [director.userId, administrator.userId]) await db.user.update({ where: { id: userId }, data: { passwordHash: walkHash } });
  // Tres agricultores sintéticos del sindicato A: publican la necesidad declarada por Sync v1 en el recorrido.
  const farmers = [];
  for (const label of ["F1", "F2", "F3"]) {
    const userId = randomUUID();
    const memberId = randomUUID();
    await db.user.create({
      data: {
        id: userId, tenantId: f.tenantA, name: `Agricultor sintético ${label}`, email: `${label.toLowerCase()}-${userId}@example.test`, passwordHash: walkHash, role: "AGRICULTOR",
        members: { create: { id: memberId, tenantId: f.tenantA, role: "AGRICULTOR" } },
      },
    });
    farmers.push({ userId, memberId, email: `${label.toLowerCase()}-${userId}@example.test` });
  }
  const product = async (label) => (await db.product.create({ data: { tenantId: f.tenantA, name: label, unit: "L" } })).id;
  const products = { herbicide: await product("Herbicida de ensayo"), fungicide: await product("Fungicida de ensayo"), insecticide: await product("Insecticida de ensayo") };
  // Filas privadas de un agricultor sintético: la comparación «antes y después» no es entre tablas vacías.
  const supplier = await db.supplier.create({ data: { tenantId: f.tenantA, name: "Proveedor sintético" } });
  const purchase = await db.purchase.create({ data: { tenantId: f.tenantA, supplierId: supplier.id } });
  await db.purchaseItem.create({ data: { tenantId: f.tenantA, purchaseId: purchase.id, productId: products.herbicide, quantity: 20, unitCost: 15, subtotal: 300 } });
  await db.payableAccount.create({ data: { tenantId: f.tenantA, purchaseId: purchase.id, dueDate: new Date("2026-12-01T00:00:00.000Z"), totalAmount: 300 } });
  await db.inventoryLot.create({ data: { tenantId: f.tenantA, ownerUserId: farmers[0].userId, productId: products.herbicide, initialQuantity: 20, currentQuantity: 20 } });
  await db.stockMovement.create({ data: { tenantId: f.tenantA, ownerUserId: farmers[0].userId, productId: products.herbicide, type: "ENTRADA", quantity: 20 } });
  const common = { tenantId: f.tenantA, sealedByUserId: director.userId, baseUnit: "ML", coverage: { status: "IDENTIFIED", membersInPublishedFigures: 3 } };
  // INVIERNO: el ejemplo de 3.12.5 en mL (96, 120, 104 y 116 L). Fungicida sólo en dos campañas anteriores: datos insuficientes.
  const winter = await sealedConsumptionCampaigns(db, { ...common, canonicalProductId: products.herbicide, firstYear: 2015, quantities: [96000n, 120000n, 104000n, 116000n], namePrefix: "Invierno sintético" });
  const fungicideSources = await sealedConsumptionCampaigns(db, { ...common, canonicalProductId: products.fungicide, firstYear: 2011, quantities: [300n, 600n], namePrefix: "Invierno sintético de fungicida" });
  const open = async (label, year) =>
    (await db.agriculturalCampaign.create({ data: { tenantId: f.tenantA, name: label, status: "ABIERTA", isActive: true, startDate: new Date(`${year}-09-01T00:00:00.000Z`) } })).id;
  const t1 = await open("Objetivo sintético invierno 2019", 2019);
  // T2 sólo sirve para cambiar de campaña en el recorrido: sin clasificar, no entra en ninguna serie.
  const t2 = await open("Otra campaña sintética 2019", 2019);
  const season = (await db.comparabilitySeason.create({ data: { tenantId: f.tenantA, key: "INVIERNO", definition: "Temporada sintética INVIERNO", durationDays: 180, createdByUserId: director.userId, createdByRole: "DIRECTIVA" } })).id;
  for (const campaignId of [...fungicideSources.map((s) => s.campaignId), ...winter.map((s) => s.campaignId), t1]) {
    await db.campaignSeasonClassification.create({ data: { tenantId: f.tenantA, campaignId, version: 1, seasonId: season, classifiedByUserId: director.userId, classifiedByRole: "DIRECTIVA" } });
  }
  const ids = {
    database: name, tenant: f.tenantA, tenantB: f.tenantB, campaignB: f.campaigns.openB,
    directorEmail: director.user.email, directorUser: director.userId, adminEmail: administrator.user.email,
    farmers, products, season, t1, t2, winterSeals: winter.map((s) => s.sealId),
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
      await db.campaignSeasonClassification.create({ data: { tenantId: ids.tenant, campaignId: extra.id, version: 1, seasonId: ids.season, classifiedByUserId: ids.directorUser, classifiedByRole: "DIRECTIVA" } });
    } else if (name === "withdraw") {
      const seal = ids.winterSeals[ids.winterSeals.length - 1];
      await db.$executeRaw`UPDATE "CollectiveSealEntry" SET "visibilityWithdrawnAt" = now() WHERE "sealId" = ${seal}::uuid AND "projectionType" = 'CONSUMPTION_TOTAL'`;
    } else if (name === "snapshot") {
      const tables = await db.$queryRaw`
        SELECT table_name AS name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations' ORDER BY table_name`;
      const hashes = {};
      for (const { name: table } of tables) {
        const [row] = await db.$queryRawUnsafe(`SELECT md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) AS h FROM "${table}" x`);
        hashes[table] = row.h;
      }
      process.stdout.write(`${JSON.stringify(hashes)}\n`);
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
