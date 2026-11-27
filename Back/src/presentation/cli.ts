import { Logger } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { open } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { parseArgs } from "node:util";
import { configuredSync, loadScenario, newAccounts, type Credential } from "./load-scenario";
import { accounts, campaignPeriods, DATASET, DAY_MS, products, TENANT_NAME } from "./scenario";

type Tx = Prisma.TransactionClient;
class LoadError extends Error {}

function selection() {
  const { values } = parseArgs({ options: {
    installation: { type: "string" }, database: { type: "string" }, tenant: { type: "string" },
    reference: { type: "string" }, apply: { type: "boolean", default: false },
    credentials: { type: "string" }, help: { type: "boolean" },
  } });
  if (values.help) {
    console.log("presentation:load -- --installation ID --database agrocuentas_presentacion_ID --tenant SLUG --reference YYYY-MM-DD [--apply --credentials /ruta/local/valle-claro.presentation-credentials.json]");
    return null;
  }
  const { installation, database, tenant, reference, apply, credentials } = values;
  if (!installation || !/^[a-z][a-z0-9-]{2,30}$/.test(installation) ||
      !database || !/^agrocuentas_presentacion_[a-z][a-z0-9_]{2,30}$/.test(database) ||
      !tenant || !/^[a-z][a-z0-9-]{2,39}$/.test(tenant) ||
      !reference || !/^\d{4}-\d\d-\d\d$/.test(reference)) {
    throw new LoadError("Indique instalación, base exclusiva agrocuentas_presentacion_*, sindicato y fecha YYYY-MM-DD. Consulte --help.");
  }
  const referenceDate = new Date(reference + "T00:00:00.000Z");
  if (!Number.isFinite(referenceDate.getTime()) || referenceDate.toISOString().slice(0, 10) !== reference) {
    throw new LoadError("La fecha de referencia no es válida.");
  }
  if (apply && (!credentials || !isAbsolute(credentials) || !credentials.endsWith(".presentation-credentials.json"))) {
    throw new LoadError("--apply requiere una ruta absoluta a un archivo nuevo *.presentation-credentials.json.");
  }
  if (!apply && credentials) throw new LoadError("--credentials solo se acepta con --apply.");
  const rawUrl = process.env.PRESENTATION_DATABASE_URL;
  if (!rawUrl) throw new LoadError("Configure PRESENTATION_DATABASE_URL para la base exclusiva autorizada.");
  let url: URL;
  try { url = new URL(rawUrl); } catch { throw new LoadError("PRESENTATION_DATABASE_URL no es una URL PostgreSQL válida."); }
  if (!["postgresql:", "postgres:"].includes(url.protocol) || url.pathname !== "/" + database ||
      (url.searchParams.get("schema") ?? "public") !== "public") {
    throw new LoadError("La URL de carga debe apuntar a la base seleccionada y su esquema public.");
  }
  return { installation, database, tenant, referenceDate, apply, credentials, dbUrl: rawUrl };
}

type Target = NonNullable<ReturnType<typeof selection>>;

async function inspect(tx: Tx, target: Target) {
  const [current] = await tx.$queryRaw<{ name: string; schema: string }[]>`
    SELECT current_database() AS name, current_schema() AS schema`;
  if (current?.name !== target.database || current.schema !== "public") {
    throw new LoadError("La conexión no corresponde a la base y esquema autorizados.");
  }
  const existing = await tx.presentationInstallation.findUnique({ where: { id: 1 }, include: { tenant: { select: { slug: true } } } });
  if (existing) {
    if (existing.installation !== target.installation || existing.databaseName !== target.database ||
        existing.tenantSlug !== target.tenant || existing.tenant.slug !== target.tenant ||
        existing.dataset !== DATASET || existing.referenceDate.getTime() !== target.referenceDate.getTime() ||
        await tx.tenant.count() !== 1) {
      throw new LoadError("La instalación persistida no coincide con la selección o la base ya no es exclusiva.");
    }
    return existing;
  }
  const tables = await tx.$queryRaw<{ schema: string; name: string }[]>`
    SELECT schemaname AS schema, tablename AS name FROM pg_tables
    WHERE schemaname NOT IN ('information_schema', 'pg_catalog')
      AND schemaname NOT LIKE 'pg_%'
      AND (schemaname <> 'public' OR tablename NOT IN ('_prisma_migrations', 'PresentationInstallation', 'CollectiveDisclosurePolicyActivation'))
    ORDER BY schemaname, tablename`;
  for (const table of tables) {
    // PostgreSQL identifiers obtained from its catalogue, escaped separately from SQL values.
    const identifier = (value: string) => '"' + value.replaceAll('"', '""') + '"';
    const name = Prisma.raw(identifier(table.schema) + "." + identifier(table.name));
    const [row] = await tx.$queryRaw<{ present: boolean }[]>`SELECT EXISTS (SELECT 1 FROM ${name} LIMIT 1) AS present`;
    if (row.present) throw new LoadError("La base contiene datos ajenos al conjunto. Se requiere una base dedicada vacía y migrada.");
  }
  return null;
}

async function writeCredentials(path: string, target: Target, credentials: Credential[]) {
  let file: Awaited<ReturnType<typeof open>>;
  try { file = await open(path, "wx", 0o600); }
  catch { throw new LoadError("No se pudo crear el archivo privado. Indique una ruta nueva y un directorio accesible."); }
  try {
    await file.writeFile(JSON.stringify({ dataset: DATASET, installation: target.installation, tenant: target.tenant, credentials }, null, 2) + "\n");
    await file.sync();
  } finally {
    await file.close();
  }
}

async function main() {
  const target = selection();
  if (!target) return;
  Logger.overrideLogger(false);
  const db = new PrismaClient({ datasourceUrl: target.dbUrl, errorFormat: "minimal" });
  try {
    const existing = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      return inspect(tx, target);
    }, { timeout: 30_000 });
    if (existing) {
      console.log(JSON.stringify({ status: "already_loaded", report: existing.manifest }, null, 2));
      return;
    }
    if (!target.apply) {
      console.log(JSON.stringify({
        status: "plan", dataset: DATASET, installation: target.installation, database: target.database,
        tenant: { slug: target.tenant, name: TENANT_NAME }, reference: target.referenceDate.toISOString().slice(0, 10),
        accounts: accounts.length, products: products.length, campaigns: campaignPeriods(target.referenceDate), calls: 4,
      }, null, 2));
      return;
    }
    const now = Date.now();
    if (target.referenceDate.getTime() > now || now - target.referenceDate.getTime() >= 13 * DAY_MS) {
      throw new LoadError("Para conservar plazos utilizables, elija la fecha actual o una fecha de los últimos 12 días.");
    }
    const sync = configuredSync();
    const users = await newAccounts();
    const loaded = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('agrocuentas.presentation.installation', 0))`;
      await tx.$executeRaw`LOCK TABLE "Tenant" IN SHARE ROW EXCLUSIVE MODE`;
      const previous = await inspect(tx, target);
      if (previous) return { status: "already_loaded", report: previous.manifest };
      const { tenant, report } = await loadScenario(tx, target.tenant, target.referenceDate, users, sync);
      await tx.presentationInstallation.create({ data: {
        id: 1, installation: target.installation, databaseName: target.database, tenantId: tenant.id, tenantSlug: target.tenant,
        dataset: DATASET, referenceDate: target.referenceDate, manifest: report,
      } });
      await writeCredentials(target.credentials!, target, users.map(({ email, role, password }) => ({ email, role, password })));
      return { status: "loaded", report };
    }, { maxWait: 15_000, timeout: 120_000 });
    console.log(JSON.stringify(loaded, null, 2));
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  if (error instanceof LoadError) console.error(error.message);
  else {
    const detail = error instanceof Prisma.PrismaClientKnownRequestError ? ` (${error.code})` : "";
    console.error(`Carga incompleta${detail}. Ejecute el plan para comprobar si existe manifiesto antes de reintentar. Conserve en privado cualquier archivo generado.`);
  }
  process.exitCode = 1;
});
