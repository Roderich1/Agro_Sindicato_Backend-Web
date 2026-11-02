import { afterAll, beforeAll } from "@jest/globals";
import { Prisma, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { URL } from "node:url";

import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { Fixture, seedFixture } from "../../sync-v1/test-support/sync-v1-test-app";
import { SyntheticSource, sealedConsumptionCampaigns } from "../test-support/synthetic-sources";

/**
 * F12-EST-01 (#174, F12_EST_01_ESTIMATION_CONTRACT.md §6): esquema de la
 * estimación del consumo, con temporadas explícitas y sus correcciones
 * (EST-D-02, EST-D-14), fuente sellada (EST-D-03), trabajos por lotes con
 * paradas verificables y reintentos limitados (EST-D-04, 15, 16) y fuentes
 * con cobertura de consumo conocida o desconocida (EST-D-09). Sólo el esquema: no hay rutas,
 * trabajador ni cálculo, y las cifras de las filas son ilustrativas (el
 * cálculo es de F12-EST-04). La base se crea con las migraciones anteriores,
 * recibe datos sintéticos (campañas, divulgaciones y sellados) y después la
 * migración nueva, que debe ser aditiva y conservarlos.
 */
const postgresUrl = process.env["F12_EST_PG_TEST_URL"];
const describePostgres = postgresUrl ? describe : describe.skip;
const MIGRATION = "20261101233651_f12_est_01_estimation";
const COVERAGE_MIGRATION = "20261102020000_f07_seal_consumption_coverage";
const HASH = "a".repeat(64);
const TABLES = [
  "ComparabilitySeason", "CampaignSeasonClassification", "ConsumptionSeries", "SeriesPoint",
  "EstimationJob", "EstimationRun", "EstimationResult",
];

describePostgres("F12-EST-01 estimation schema", () => {
  let db: PrismaClient;
  let f: Fixture;
  /** Consumo publicado de la campaña cerrada A (cero comprobado). */
  let zeroRelease: string;
  /** Consumo publicado de liquidA en las dos campañas antiguas. */
  let olderReleases: string[];
  /** Consumo publicado de solidA en la campaña antigua 0; su visibilidad se retiró tras el sellado. */
  let withdrawnRelease: string;
  /** Consumo publicado de solidA en la campaña cerrada A, fuera del sellado. */
  let unsealedRelease: string;
  /** Consumo sellado de una campaña cerrada que nadie clasificó. */
  let unclassifiedRelease: string;
  let olderCampaigns: string[];
  let unclassifiedCampaign: string;
  let unsealedClosedCampaign: string;
  let targets: string[];
  let seals: { older0: string; older1: string; closedA: string; unclassified: string };
  let directorUser: string;
  let adminUser: string;
  let farmerUser: string;
  let inactiveDirectorUser: string;
  let disabledAccountUser: string;
  let directorBUser: string;
  let foreignUser: string;
  let winter: string;
  let summer: string;
  let foreignSeason: string;
  let migrationOutput: string;
  let before: string;
  let after: string;
  let catalogBefore: string;
  let catalogAfter: string;
  let classificationsRightAfter: number;
  let coverageMigrationOutput: string;
  let coverageRowsRightAfter: number;
  /** Campaña cerrada sin sellar que se corrige en la prueba de EST-D-14. */
  let reclassified: string;
  /** Fuentes selladas antes de la cobertura (desconocida) y después (conocida). */
  let legacySources: SyntheticSource[];
  let coveredSources: SyntheticSource[];
  /** Versión vigente de la clasificación de cada campaña clasificada en beforeAll. */
  const cls: Record<string, string> = {};

  /** Columnas, restricciones, índices y disparadores de las tablas dadas. */
  const catalog = async (tables: string[]) =>
    JSON.stringify({
      columns: await db.$queryRawUnsafe(
        `SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = ANY($1::text[]) ORDER BY table_name, column_name`,
        tables,
      ),
      constraints: await db.$queryRawUnsafe(
        `SELECT c.relname, k.conname, pg_get_constraintdef(k.oid) AS def FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid
         WHERE c.relname = ANY($1::text[]) ORDER BY c.relname, k.conname`,
        tables,
      ),
      indexes: await db.$queryRawUnsafe(
        `SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = ANY($1::text[]) ORDER BY tablename, indexname`,
        tables,
      ),
      triggers: await db.$queryRawUnsafe(
        `SELECT c.relname, t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
         WHERE NOT t.tgisinternal AND c.relname = ANY($1::text[]) ORDER BY c.relname, t.tgname`,
        tables,
      ),
    });

  const dump = async () =>
    JSON.stringify(
      {
        campaigns: await db.agriculturalCampaign.findMany({ orderBy: { id: "asc" } }),
        products: await db.product.findMany({ orderBy: { id: "asc" } }),
        associations: await db.productCanonicalAssociation.findMany({ orderBy: { id: "asc" } }),
        contributions: await db.syncV1Contribution.findMany({ orderBy: { id: "asc" } }),
        releases: await db.collectiveRelease.findMany({ orderBy: { id: "asc" }, include: { items: true } }),
        seals: await db.collectiveSeal.findMany({
          orderBy: { id: "asc" },
          include: { entries: { orderBy: [{ projectionType: "asc" }, { canonicalProductId: "asc" }, { baseUnit: "asc" }] } },
        }),
        forecasts: await db.demandForecast.findMany({ orderBy: { id: "asc" } }),
      },
      (_k, v) => (typeof v === "bigint" ? v.toString() : v),
    );

  beforeAll(async () => {
    const admin = new PrismaClient({ datasources: { db: { url: postgresUrl! } } });
    const name = `f12_est01_${randomUUID().replaceAll("-", "")}`;
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    await admin.$disconnect();
    const url = new URL(postgresUrl!);
    url.pathname = `/${name}`;
    const deploy = (schemaDir: string) =>
      spawnSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy", "--schema", join(schemaDir, "schema.prisma")], {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: url.toString() },
        encoding: "utf8",
        timeout: 120000,
      });
    /** Despliega sólo las migraciones que cumplen `keep`, desde un esquema temporal. */
    const deployOnly = (keep: (migration: string) => boolean) => {
      const dir = mkdtempSync(join(tmpdir(), "f12-mig-"));
      try {
        cpSync(resolve("prisma/schema.prisma"), join(dir, "schema.prisma"));
        cpSync(resolve("prisma/migrations"), join(dir, "migrations"), { recursive: true });
        for (const entry of readdirSync(join(dir, "migrations"))) {
          if (/^\d{14}_/.test(entry) && !keep(entry)) rmSync(join(dir, "migrations", entry), { recursive: true });
        }
        return deploy(dir);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    };
    // La base previa: todas las migraciones anteriores a la nueva.
    expect(deployOnly((migration) => migration < MIGRATION).status).toBe(0);
    db = new PrismaClient({ datasources: { db: { url: url.toString() } } });

    // Datos sintéticos anteriores: dos sindicatos, roles, campañas, productos,
    // una asociación canónica, consumos publicados, sellados F07 y una fila de
    // DemandForecast.
    f = await seedFixture(db as unknown as PrismaService);
    olderCampaigns = [randomUUID(), randomUUID()];
    unclassifiedCampaign = randomUUID();
    unsealedClosedCampaign = randomUUID();
    reclassified = randomUUID();
    targets = Array.from({ length: 14 }, () => randomUUID());
    const closed = (id: string, year: number, name: string) => ({
      id, tenantId: f.tenantA, name, status: "CERRADA" as const, isActive: false,
      startDate: new Date(`${year}-09-01T00:00:00.000Z`), closedAt: new Date(`${year + 1}-03-01T00:00:00.000Z`),
    });
    await db.agriculturalCampaign.createMany({
      data: [
        ...olderCampaigns.map((id, i) => closed(id, 2023 + i, `Campaña sintética ${2023 + i}`)),
        closed(unclassifiedCampaign, 2021, "Campaña antigua sin clasificar"),
        closed(unsealedClosedCampaign, 2022, "Campaña cerrada sin sellar"),
        closed(reclassified, 2020, "Campaña que se reclasifica"),
        ...targets.map((id, i) => ({
          id, tenantId: f.tenantA, name: `Objetivo sintético ${i}`, status: "PLANIFICADA" as const, isActive: false,
          startDate: new Date("2027-09-01T00:00:00.000Z"),
        })),
      ],
    });
    const userOf = async (memberId: string) => (await db.member.findUniqueOrThrow({ where: { id: memberId } })).userId;
    directorUser = await userOf(f.members.directorA);
    adminUser = await userOf(f.members.adminA);
    farmerUser = await userOf(f.members.farmerA);
    foreignUser = await userOf(f.members.farmerB);
    const person = async (tenantId: string, label: string, role: "DIRECTIVA", memberActive: boolean, accountActive: boolean) => {
      const id = randomUUID();
      await db.user.create({
        data: {
          id, tenantId, name: label, email: `${label.replaceAll(" ", "-")}-${id}@example.test`, passwordHash: "unusable", role, isActive: accountActive,
          members: { create: { tenantId, role, isActive: memberActive } },
        },
      });
      return id;
    };
    inactiveDirectorUser = await person(f.tenantA, "Directiva inactiva", "DIRECTIVA", false, true);
    disabledAccountUser = await person(f.tenantA, "Directiva con cuenta desactivada", "DIRECTIVA", true, false);
    directorBUser = await person(f.tenantB, "Directiva B", "DIRECTIVA", true, true);
    // inactiveA es hoy una denominación de liquidA: no es canónico.
    await db.productCanonicalAssociation.create({
      data: { tenantId: f.tenantA, productId: f.products.inactiveA, canonicalProductId: f.products.liquidA, actorUserId: directorUser, reason: "sintético" },
    });
    const contribution = await db.syncV1Contribution.create({
      data: {
        tenantId: f.tenantA, memberId: f.members.farmerA, projectionType: "CONSUMPTION_TOTAL", campaignId: f.campaigns.closedA,
        productId: f.products.liquidA, baseUnit: "ML", status: "ACTIVE", quantityBase: 0n, lastSequence: 1,
        headOperationId: randomUUID(), acceptedAt: new Date("2026-03-01T00:00:00.000Z"),
      },
    });
    const release = async (campaignId: string, totalBase: bigint, product = f.products.liquidA, baseUnit: "ML" | "G" = "ML") =>
      (
        await db.collectiveRelease.create({
          data: { tenantId: f.tenantA, campaignId, canonicalProductId: product, projectionType: "CONSUMPTION_TOTAL", baseUnit, totalBase, contributorCount: 3 },
        })
      ).id;
    zeroRelease = (
      await db.collectiveRelease.create({
        data: {
          tenantId: f.tenantA, campaignId: f.campaigns.closedA, canonicalProductId: f.products.liquidA, projectionType: "CONSUMPTION_TOTAL",
          baseUnit: "ML", totalBase: 0n, contributorCount: 3,
          items: { create: [{ contributionId: contribution.id, sequence: 1, quantityBase: 0n }] },
        },
      })
    ).id;
    olderReleases = [await release(olderCampaigns[0]!, 120000n), await release(olderCampaigns[1]!, 104000n)];
    withdrawnRelease = await release(olderCampaigns[0]!, 7000n, f.products.solidA, "G");
    unsealedRelease = await release(f.campaigns.closedA, 5000n, f.products.solidA, "G");
    unclassifiedRelease = await release(unclassifiedCampaign, 90000n);
    await release(unsealedClosedCampaign, 80000n);
    // Sellados F07 (versión 1) de las campañas cerradas, menos una.
    type Entry = Omit<Prisma.CollectiveSealEntryCreateManySealInput, "projectionType">;
    const seal = async (campaignId: string, entries: Entry[], suppressedCells = false) =>
      (
        await db.collectiveSeal.create({
          data: {
            tenantId: f.tenantA, campaignId, sealedAt: new Date(), sealedByUserId: directorUser, sealedByRole: "DIRECTIVA",
            disclosureMode: "PROVISIONAL_SYNTHETIC", policy: "F07-POL-01", threshold: 3, linkedMembers: 5, membersWithContribution: 3,
            suppressedCells, openDisputes: false, reviewRef: "b".repeat(64),
            entries: { create: entries.map((entry) => ({ projectionType: "CONSUMPTION_TOTAL" as const, ...entry })) },
          },
        })
      ).id;
    seals = {
      older0: await seal(olderCampaigns[0]!, [
        { canonicalProductId: f.products.liquidA, baseUnit: "ML", status: "DISCLOSED", releaseId: olderReleases[0]! },
        { canonicalProductId: f.products.solidA, baseUnit: "G", status: "DISCLOSED", releaseId: withdrawnRelease },
      ]),
      older1: await seal(
        olderCampaigns[1]!,
        [
          { canonicalProductId: f.products.liquidA, baseUnit: "ML", status: "DISCLOSED", releaseId: olderReleases[1]! },
          { canonicalProductId: f.products.solidA, baseUnit: "G", status: "SUPPRESSED_UNDER_THRESHOLD" },
        ],
        true,
      ),
      closedA: await seal(f.campaigns.closedA, [{ canonicalProductId: f.products.liquidA, baseUnit: "ML", status: "DISCLOSED", releaseId: zeroRelease }]),
      unclassified: await seal(unclassifiedCampaign, [{ canonicalProductId: f.products.liquidA, baseUnit: "ML", status: "DISCLOSED", releaseId: unclassifiedRelease }]),
    };
    // Un aportante retiró su aportación después del sellado (F07): la cifra
    // sellada no cambia, pero ya no es visible.
    await db.collectiveSealEntry.update({
      where: { sealId_projectionType_canonicalProductId_baseUnit: { sealId: seals.older0, projectionType: "CONSUMPTION_TOTAL", canonicalProductId: f.products.solidA, baseUnit: "G" } },
      data: { visibilityWithdrawnAt: new Date() },
    });
    // Fuentes selladas antes de la cobertura de consumo: la tendrán desconocida.
    legacySources = await sealedConsumptionCampaigns(db, {
      tenantId: f.tenantA, sealedByUserId: directorUser, canonicalProductId: f.products.liquidA, baseUnit: "ML",
      firstYear: 2015, quantities: [50000n, 60000n], namePrefix: "Campaña sintética sellada antes",
    });
    await db.demandForecast.create({
      data: { tenantId: f.tenantA, productId: f.products.liquidA, campaignName: "heredada", predictedDemand: "12.5", metadata: { origen: "sintético" } },
    });

    const previousTables = (
      await db.$queryRawUnsafe<{ table_name: string }[]>(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
      )
    ).map((t) => t.table_name);
    expect(previousTables).not.toContain("EstimationRun");
    before = await dump();
    catalogBefore = await catalog(previousTables);
    const result = deployOnly((migration) => migration <= MIGRATION);
    migrationOutput = `${result.stdout}\n${result.stderr}`;
    expect(result.status).toBe(0);
    after = await dump();
    catalogAfter = await catalog(previousTables);
    classificationsRightAfter = await db.campaignSeasonClassification.count();
    // Después, la cobertura de consumo de los sellados nuevos (F07 §5.3): los
    // anteriores no reciben ninguna.
    const full = deploy(resolve("prisma"));
    coverageMigrationOutput = `${full.stdout}\n${full.stderr}`;
    expect(full.status).toBe(0);
    coverageRowsRightAfter = await db.collectiveSealConsumptionCoverage.count();
    // Fuentes selladas después: llevan su cobertura de consumo conocida.
    coveredSources = await sealedConsumptionCampaigns(db, {
      tenantId: f.tenantA, sealedByUserId: directorUser, canonicalProductId: f.products.liquidA, baseUnit: "ML",
      firstYear: 2017, quantities: [70000n, 0n, 90000n], namePrefix: "Campaña sintética sellada después",
      coverage: { status: "IDENTIFIED", membersInPublishedFigures: 3 },
    });

    // Después de la migración, la Directiva define dos temporadas y clasifica
    // explícitamente las campañas que conoce; la campaña antigua sin
    // clasificación comprobada queda sin clasificar.
    winter = (await db.comparabilitySeason.create({ data: seasonData("INVIERNO") })).id;
    summer = (await db.comparabilitySeason.create({ data: seasonData("VERANO") })).id;
    foreignSeason = (
      await db.comparabilitySeason.create({ data: { ...seasonData("INVIERNO"), tenantId: f.tenantB, createdByUserId: directorBUser } })
    ).id;
    for (const campaignId of [...olderCampaigns, f.campaigns.closedA, unsealedClosedCampaign, reclassified, ...targets]) {
      cls[campaignId] = (await db.campaignSeasonClassification.create({ data: classification(campaignId, winter) })).id;
    }
    // Una campaña de otra temporada, para que VERANO no esté vacía.
    const summerCampaign = randomUUID();
    await db.agriculturalCampaign.create({
      data: { id: summerCampaign, tenantId: f.tenantA, name: "Campaña sintética de verano", status: "PLANIFICADA", startDate: new Date("2027-01-01T00:00:00.000Z") },
    });
    cls[summerCampaign] = (await db.campaignSeasonClassification.create({ data: classification(summerCampaign, summer) })).id;
  }, 300000);

  afterAll(async () => {
    await db?.$disconnect();
  });

  function seasonData(key: string, data: Record<string, unknown> = {}) {
    return {
      tenantId: f.tenantA, key, definition: `Temporada sintética ${key}: siembra de septiembre a febrero`, durationDays: 180,
      createdByUserId: directorUser, createdByRole: "DIRECTIVA" as const, ...data,
    };
  }
  function classification(campaignId: string, seasonId: string | null, data: Record<string, unknown> = {}) {
    return {
      campaignId, tenantId: f.tenantA, version: 1, seasonId, classifiedByUserId: directorUser,
      classifiedByRole: "DIRECTIVA" as const, ...data,
    };
  }
  /**
   * Datos de una serie: la versión siguiente del ámbito (tenant, producto,
   * unidad y temporada), porque cada campaña está en una sola temporada. Los
   * datos dados prevalecen.
   */
  const series = async (data: Record<string, unknown> = {}) => {
    const scope = { tenantId: f.tenantA, canonicalProductId: f.products.liquidA, baseUnit: "ML" as "ML" | "G", seasonId: winter, ...data };
    const latest = await db.consumptionSeries.findFirst({
      where: { tenantId: scope.tenantId, canonicalProductId: scope.canonicalProductId, baseUnit: scope.baseUnit, seasonId: scope.seasonId },
      orderBy: { version: "desc" },
    });
    return { version: (latest?.version ?? 0) + 1, previousSeriesId: latest?.id ?? null, sourceHash: HASH, sources: [], ...scope };
  };
  const jobData = (data: Record<string, unknown> = {}) => ({
    tenantId: f.tenantA, requestId: randomUUID(), requestHash: HASH, requestedByUserId: directorUser, requestedByRole: "DIRECTIVA" as const,
    targetCampaignId: targets[0]!, maxAttempts: 3, ...data,
  });
  /** Un trabajo en cola que el trabajador ya tomó (primer intento, con plazo). */
  const runningJob = async (data: Record<string, unknown> = {}) => {
    const job = await db.estimationJob.create({ data: jobData(data) });
    return db.estimationJob.update({
      where: { id: job.id },
      data: { status: "RUNNING", attempts: 1, startedAt: new Date(), leaseExpiresAt: new Date(Date.now() + 300000) },
    });
  };
  /** Datos de la ejecución de un trabajo en curso (mismo solicitante y campaña objetivo). */
  const runOf = (job: { id: string; targetCampaignId: string; requestedByUserId: string; requestedByRole: "AGRICULTOR" | "DIRECTIVA" | "ADMINISTRADOR" }, data: Record<string, unknown> = {}) => ({
    tenantId: f.tenantA, jobId: job.id, requestedByUserId: job.requestedByUserId, requestedByRole: job.requestedByRole,
    targetCampaignId: job.targetCampaignId, seasonId: winter, targetClassificationId: cls[job.targetCampaignId], contractVersion: 1, method: "SES_NAIVE",
    methodVersion: "F12-EST-04/1", parameters: { horizon: 1 }, horizon: 1, disclosureMode: "PROVISIONAL_SYNTHETIC",
    policy: "F07-POL-01", threshold: 3, outcome: "CALCULATED" as const, contentHash: HASH, ...data,
  });
  const estimated = (seriesId: string, data: Record<string, unknown> = {}) => ({
    canonicalProductId: f.products.liquidA, baseUnit: "ML" as const, seriesId, status: "ESTIMATED" as const,
    estimateBase: "52000.000000", naiveBase: 0n, alpha: "0.50", fitInformative: true, fitCriterion: "256.000000",
    spanFirstPosition: 1, spanLastPosition: 3, exclusions: [], validations: [{ code: "UNITS", passed: true }], ...data,
  });
  const insufficient = () => ({ canonicalProductId: f.products.liquidA, baseUnit: "ML" as const, status: "INSUFFICIENT_DATA" as const, reasonCode: "SPAN_TOO_SHORT", exclusions: [], validations: [] });
  /** Tres campañas consecutivas, cerradas y selladas, con consumo comprobado (120 L, 104 L y 0 L). */
  const fullSeries = async () =>
    db.consumptionSeries.create({
      data: {
        ...(await series()),
        points: {
          create: [
            { position: 1, campaignId: olderCampaigns[0]!, classificationId: cls[olderCampaigns[0]!]!, kind: "VERIFIED_CONSUMPTION", quantityBase: 120000n, sourceReleaseId: olderReleases[0]!, sourceSealId: seals.older0 },
            { position: 2, campaignId: olderCampaigns[1]!, classificationId: cls[olderCampaigns[1]!]!, kind: "VERIFIED_CONSUMPTION", quantityBase: 104000n, sourceReleaseId: olderReleases[1]!, sourceSealId: seals.older1 },
            { position: 3, campaignId: f.campaigns.closedA, classificationId: cls[f.campaigns.closedA]!, kind: "VERIFIED_CONSUMPTION", quantityBase: 0n, sourceReleaseId: zeroRelease, sourceSealId: seals.closedA },
          ],
        },
      },
    });

  it("is additive: keeps every earlier row, seal, column, constraint, index and trigger, classifies nothing and does not touch DemandForecast", () => {
    expect(migrationOutput).toContain(MIGRATION);
    expect(after).toBe(before);
    expect(JSON.parse(after).seals).toHaveLength(6);
    // La migración F07 posterior no da cobertura a ningún sellado anterior.
    expect(coverageMigrationOutput).toContain(COVERAGE_MIGRATION);
    expect(coverageRowsRightAfter).toBe(0);
    expect(JSON.parse(after).forecasts).toHaveLength(1);
    expect(catalogAfter).toBe(catalogBefore);
    expect(JSON.parse(catalogAfter).columns.some((c: { table_name: string }) => c.table_name === "DemandForecast")).toBe(true);
    // Ninguna campaña anterior queda clasificada por la migración (EST-D-02).
    expect(classificationsRightAfter).toBe(0);
  });

  it("creates the new tables with no stored validity, approval or coverage columns", async () => {
    const rows = await db.$queryRawUnsafe<{ table_name: string; column_name: string }[]>(
      `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
      TABLES,
    );
    expect(new Set(rows.map((r) => r.table_name))).toEqual(new Set(TABLES));
    expect(rows.filter((r) => /validity|vigenc|approv|aprob/i.test(r.column_name))).toEqual([]);
    // EST-D-09: sin fuente verificable, la base no guarda una cobertura.
    expect(rows.filter((r) => /coverage|cobertura/i.test(r.column_name))).toEqual([]);
  });

  it("takes seasons and classifications only from active DIRECTIVA or ADMINISTRADOR members, explicit and unchangeable (EST-D-02, EST-D-13)", async () => {
    // La clave y la definición son explícitas; la duración, positiva.
    await expect(db.comparabilitySeason.create({ data: seasonData("") })).rejects.toThrow(/ComparabilitySeason_values/);
    await expect(db.comparabilitySeason.create({ data: seasonData(" OTOÑO") })).rejects.toThrow(/ComparabilitySeason_values/);
    await expect(db.comparabilitySeason.create({ data: seasonData("OTOÑO", { definition: "  " }) })).rejects.toThrow(/ComparabilitySeason_values/);
    await expect(db.comparabilitySeason.create({ data: seasonData("OTOÑO", { durationDays: 0 }) })).rejects.toThrow(/ComparabilitySeason_values/);
    await expect(db.comparabilitySeason.create({ data: seasonData("INVIERNO") })).rejects.toThrow(/Unique constraint failed/);
    // Sólo DIRECTIVA o ADMINISTRADOR, Member activo con cuenta activa del tenant.
    await expect(db.comparabilitySeason.create({ data: seasonData("OTOÑO", { createdByUserId: farmerUser, createdByRole: "AGRICULTOR" }) })).rejects.toThrow(/ComparabilitySeason_values/);
    for (const user of [farmerUser, inactiveDirectorUser, disabledAccountUser, directorBUser]) {
      await expect(db.comparabilitySeason.create({ data: seasonData("OTOÑO", { createdByUserId: user }) })).rejects.toThrow(/no es miembro activo del tenant con ese rol/);
    }
    const autumn = await db.comparabilitySeason.create({ data: seasonData("OTOÑO", { createdByUserId: adminUser, createdByRole: "ADMINISTRADOR" }) });
    expect(autumn.createdByRole).toBe("ADMINISTRADOR");

    // Una clasificación une una campaña y una temporada del mismo tenant, una vez.
    await expect(db.campaignSeasonClassification.create({ data: classification(f.campaigns.openB, winter) })).rejects.toThrow(/campaña no es del tenant/);
    await expect(db.campaignSeasonClassification.create({ data: classification(f.campaigns.openA, foreignSeason) })).rejects.toThrow(/temporada no es del tenant/);
    for (const user of [inactiveDirectorUser, disabledAccountUser, directorBUser]) {
      await expect(db.campaignSeasonClassification.create({ data: classification(f.campaigns.openA, winter, { classifiedByUserId: user }) })).rejects.toThrow(/no es miembro activo/);
    }
    await expect(db.campaignSeasonClassification.create({ data: classification(f.campaigns.openA, winter, { classifiedByUserId: farmerUser, classifiedByRole: "AGRICULTOR" }) })).rejects.toThrow(/CampaignSeasonClassification_values/);
    await expect(db.campaignSeasonClassification.create({ data: classification(olderCampaigns[0]!, summer) })).rejects.toThrow(/Unique constraint failed/);
    const statements = [
      [`UPDATE "ComparabilitySeason" SET "durationDays" = 90 WHERE "id" = '${winter}'`, /ComparabilitySeason es inmutable/],
      [`DELETE FROM "ComparabilitySeason" WHERE "id" = '${autumn.id}'`, /ComparabilitySeason es inmutable/],
      [`UPDATE "CampaignSeasonClassification" SET "seasonId" = '${summer}' WHERE "campaignId" = '${olderCampaigns[0]}'`, /CampaignSeasonClassification es inmutable/],
      [`DELETE FROM "CampaignSeasonClassification" WHERE "campaignId" = '${olderCampaigns[0]}'`, /CampaignSeasonClassification es inmutable/],
      [`TRUNCATE "CampaignSeasonClassification" CASCADE`, /es inmutable/],
      [`TRUNCATE "ComparabilitySeason" CASCADE`, /es inmutable/],
    ] as const;
    for (const [sql, message] of statements) {
      await expect(db.$executeRawUnsafe(sql)).rejects.toThrow(message);
    }
  });

  it("keeps a verified zero, an absence and a hidden value apart, from classified campaigns only (RN-26, EST-D-02)", async () => {
    const solid = { canonicalProductId: f.products.solidA, baseUnit: "G" as const };
    const liquid = await db.consumptionSeries.create({
      data: {
        ...(await series()),
        points: {
          create: [
            { position: 1, campaignId: unsealedClosedCampaign, classificationId: cls[unsealedClosedCampaign]!, kind: "NO_RECORD" },
            { position: 2, campaignId: olderCampaigns[1]!, classificationId: cls[olderCampaigns[1]!]!, kind: "VERIFIED_CONSUMPTION", quantityBase: 104000n, sourceReleaseId: olderReleases[1]!, sourceSealId: seals.older1 },
            { position: 3, campaignId: f.campaigns.closedA, classificationId: cls[f.campaigns.closedA]!, kind: "VERIFIED_CONSUMPTION", quantityBase: 0n, sourceReleaseId: zeroRelease, sourceSealId: seals.closedA },
          ],
        },
      },
      include: { points: { orderBy: { position: "asc" } } },
    });
    const hidden = await db.consumptionSeries.create({
      data: {
        ...(await series(solid)),
        points: {
          create: [
            { position: 1, campaignId: olderCampaigns[0]!, classificationId: cls[olderCampaigns[0]!]!, kind: "HIDDEN", sourceSealId: seals.older0 },
            { position: 2, campaignId: olderCampaigns[1]!, classificationId: cls[olderCampaigns[1]!]!, kind: "HIDDEN", sourceSealId: seals.older1 },
            { position: 3, campaignId: f.campaigns.closedA, classificationId: cls[f.campaigns.closedA]!, kind: "NO_RECORD", sourceSealId: seals.closedA },
          ],
        },
      },
      include: { points: { orderBy: { position: "asc" } } },
    });
    expect([...liquid.points, ...hidden.points].map((p) => [p.kind, p.quantityBase])).toEqual([
      ["NO_RECORD", null],
      ["VERIFIED_CONSUMPTION", 104000n],
      ["VERIFIED_CONSUMPTION", 0n],
      ["HIDDEN", null],
      ["HIDDEN", null],
      ["NO_RECORD", null],
    ]);
    type Point = Prisma.SeriesPointUncheckedCreateWithoutSeriesInput;
    const bad = async (point: Partial<Point> & Pick<Point, "kind">, data: Record<string, unknown> = {}) => {
      // Sin versión propia, la de una campaña clasificada: el disparador la rechaza si no es la de esa campaña.
      const campaignId = point.campaignId ?? f.campaigns.closedA;
      const classificationId = cls[campaignId] ?? cls[f.campaigns.closedA]!;
      return db.consumptionSeries.create({ data: { ...(await series(data)), points: { create: [{ position: 1, campaignId, classificationId, ...point }] } } });
    };
    // Una ausencia o un dato oculto con cantidad (por ejemplo, cero) se rechaza.
    await expect(bad({ campaignId: unsealedClosedCampaign, kind: "NO_RECORD", quantityBase: 0n })).rejects.toThrow(/SeriesPoint_values/);
    // Una campaña sellada no admite una ausencia que no cite su sellado.
    await expect(bad({ kind: "NO_RECORD" })).rejects.toThrow(/la campaña está sellada/);
    await expect(bad({ campaignId: olderCampaigns[1]!, kind: "HIDDEN", quantityBase: 0n, sourceSealId: seals.older1 }, solid)).rejects.toThrow(/SeriesPoint_values/);
    await expect(bad({ campaignId: olderCampaigns[1]!, kind: "HIDDEN", sourceReleaseId: zeroRelease, sourceSealId: seals.older1 }, solid)).rejects.toThrow(/SeriesPoint_values/);
    // Un consumo comprobado sin cantidad, sin su divulgación o negativo, también.
    await expect(bad({ kind: "VERIFIED_CONSUMPTION", sourceReleaseId: zeroRelease, sourceSealId: seals.closedA })).rejects.toThrow(/SeriesPoint_values/);
    await expect(bad({ kind: "VERIFIED_CONSUMPTION", quantityBase: 5n, sourceSealId: seals.closedA })).rejects.toThrow(/SeriesPoint_values/);
    await expect(bad({ kind: "VERIFIED_CONSUMPTION", quantityBase: -1n, sourceReleaseId: zeroRelease, sourceSealId: seals.closedA })).rejects.toThrow(/SeriesPoint_values/);
    // La cifra es exactamente la divulgada, de esa celda y campaña del tenant.
    await expect(bad({ kind: "VERIFIED_CONSUMPTION", quantityBase: 1n, sourceReleaseId: zeroRelease, sourceSealId: seals.closedA })).rejects.toThrow(/con esa cifra/);
    await expect(bad({ kind: "VERIFIED_CONSUMPTION", quantityBase: 120000n, sourceReleaseId: olderReleases[0]!, sourceSealId: seals.closedA })).rejects.toThrow(/con esa cifra/);
    await expect(
      bad({ kind: "VERIFIED_CONSUMPTION", quantityBase: 0n, sourceReleaseId: zeroRelease, sourceSealId: seals.closedA }, { canonicalProductId: f.products.solidA, baseUnit: "G" }),
    ).rejects.toThrow(/con esa cifra/);
    await expect(bad({ campaignId: f.campaigns.openB, kind: "NO_RECORD" })).rejects.toThrow(/campaña no es del tenant/);
    // Sólo productos canónicos: una denominación asociada se rechaza.
    await expect(bad({ kind: "NO_RECORD" }, { canonicalProductId: f.products.inactiveA })).rejects.toThrow(/no es canónico/);
    // EST-D-02: sólo campañas clasificadas en la temporada de la serie. La
    // campaña antigua sin clasificar no entra, aunque esté sellada.
    await expect(
      bad({ campaignId: unclassifiedCampaign, kind: "VERIFIED_CONSUMPTION", quantityBase: 90000n, sourceReleaseId: unclassifiedRelease, sourceSealId: seals.unclassified }),
    ).rejects.toThrow(/no está clasificada en la temporada de la serie/);
    await expect(bad({ kind: "NO_RECORD" }, { seasonId: summer })).rejects.toThrow(/no está clasificada en la temporada de la serie/);
    await expect(bad({ kind: "NO_RECORD" }, { seasonId: foreignSeason })).rejects.toThrow(/temporada no es del tenant/);
  });

  it("requires the sealed source for a verified figure and keeps its exact provenance (EST-D-03)", async () => {
    type Point = Prisma.SeriesPointUncheckedCreateWithoutSeriesInput;
    const one = async (point: Point, data: Record<string, unknown> = {}) =>
      db.consumptionSeries.create({ data: { ...(await series(data)), points: { create: [point] } }, include: { points: true } });
    const solid = { canonicalProductId: f.products.solidA, baseUnit: "G" };
    // Sin sellado no hay consumo comprobado, aunque la divulgación sea la vigente.
    await expect(
      one({ position: 1, campaignId: f.campaigns.closedA, classificationId: cls[f.campaigns.closedA]!, kind: "VERIFIED_CONSUMPTION", quantityBase: 0n, sourceReleaseId: zeroRelease }),
    ).rejects.toThrow(/SeriesPoint_values/);
    // La divulgación tiene que ser la entrada DISCLOSED y visible de ese sellado.
    await expect(
      one({ position: 1, campaignId: f.campaigns.closedA, classificationId: cls[f.campaigns.closedA]!, kind: "VERIFIED_CONSUMPTION", quantityBase: 5000n, sourceReleaseId: unsealedRelease, sourceSealId: seals.closedA }, solid),
    ).rejects.toThrow(/entrada visible de ese sellado/);
    await expect(
      one({ position: 1, campaignId: olderCampaigns[0]!, classificationId: cls[olderCampaigns[0]!]!, kind: "VERIFIED_CONSUMPTION", quantityBase: 7000n, sourceReleaseId: withdrawnRelease, sourceSealId: seals.older0 }, solid),
    ).rejects.toThrow(/entrada visible de ese sellado/);
    // El sellado de otra campaña tampoco vale.
    await expect(
      one({ position: 1, campaignId: olderCampaigns[0]!, classificationId: cls[olderCampaigns[0]!]!, kind: "VERIFIED_CONSUMPTION", quantityBase: 120000n, sourceReleaseId: olderReleases[0]!, sourceSealId: seals.closedA }),
    ).rejects.toThrow(/sellado no es de esa campaña/);
    // Un dato oculto exige el sellado que lo oculta: suprimido o con la
    // visibilidad retirada; nunca una celda visible ni una ausente.
    await expect(one({ position: 1, campaignId: olderCampaigns[1]!, classificationId: cls[olderCampaigns[1]!]!, kind: "HIDDEN" }, solid)).rejects.toThrow(/SeriesPoint_values/);
    const suppressed = await one({ position: 1, campaignId: olderCampaigns[1]!, classificationId: cls[olderCampaigns[1]!]!, kind: "HIDDEN", sourceSealId: seals.older1 }, solid);
    expect(suppressed.points[0]).toMatchObject({ kind: "HIDDEN", quantityBase: null, sourceSealId: seals.older1, sourceReleaseId: null });
    const withdrawn = await one({ position: 1, campaignId: olderCampaigns[0]!, classificationId: cls[olderCampaigns[0]!]!, kind: "HIDDEN", sourceSealId: seals.older0 }, solid);
    expect(withdrawn.points[0]!.kind).toBe("HIDDEN");
    await expect(one({ position: 1, campaignId: f.campaigns.closedA, classificationId: cls[f.campaigns.closedA]!, kind: "HIDDEN", sourceSealId: seals.closedA })).rejects.toThrow(/no oculta esa celda/);
    await expect(one({ position: 1, campaignId: f.campaigns.closedA, classificationId: cls[f.campaigns.closedA]!, kind: "HIDDEN", sourceSealId: seals.closedA }, solid)).rejects.toThrow(/no oculta esa celda/);
    // Una ausencia que cita un sellado corresponde a ninguna entrada de esa celda.
    await expect(one({ position: 1, campaignId: f.campaigns.closedA, classificationId: cls[f.campaigns.closedA]!, kind: "NO_RECORD", sourceSealId: seals.closedA })).rejects.toThrow(/tiene una entrada de consumo/);
    await expect(one({ position: 1, campaignId: olderCampaigns[1]!, classificationId: cls[olderCampaigns[1]!]!, kind: "NO_RECORD", sourceSealId: seals.older1 }, solid)).rejects.toThrow(/tiene una entrada de consumo/);
    const absent = await one({ position: 1, campaignId: f.campaigns.closedA, classificationId: cls[f.campaigns.closedA]!, kind: "NO_RECORD", sourceSealId: seals.closedA }, solid);
    expect(absent.points[0]!.sourceSealId).toBe(seals.closedA);
    // La serie completa conserva sellado y divulgación de cada cifra.
    const full = await fullSeries();
    const points = await db.seriesPoint.findMany({ where: { seriesId: full.id }, orderBy: { position: "asc" } });
    expect(points.map((p) => [p.sourceSealId, p.sourceReleaseId])).toEqual([
      [seals.older0, olderReleases[0]],
      [seals.older1, olderReleases[1]],
      [seals.closedA, zeroRelease],
    ]);
  });

  it("writes series versions once, in order and only in their own transaction", async () => {
    const v1 = await db.consumptionSeries.create({ data: await series({ canonicalProductId: f.products.otherUnitA }) });
    const scope = { canonicalProductId: f.products.otherUnitA };
    await expect(
      db.seriesPoint.create({ data: { seriesId: v1.id, position: 1, campaignId: f.campaigns.closedA, classificationId: cls[f.campaigns.closedA]!, kind: "NO_RECORD" } }),
    ).rejects.toThrow(/no admite puntos posteriores/);
    await expect(db.consumptionSeries.create({ data: await series({ ...scope, version: 2, previousSeriesId: null }) })).rejects.toThrow(/ConsumptionSeries_values/);
    await expect(
      db.consumptionSeries.create({ data: await series({ ...scope, seasonId: summer, version: 2, previousSeriesId: v1.id }) }),
    ).rejects.toThrow(/versión anterior no es la del mismo ámbito/);
    await expect(db.consumptionSeries.create({ data: await series({ ...scope, version: 3, previousSeriesId: v1.id }) })).rejects.toThrow(/versión anterior no es la del mismo ámbito/);
    const v2 = await db.consumptionSeries.create({ data: await series({ ...scope, version: 2, previousSeriesId: v1.id }) });
    expect(v2.previousSeriesId).toBe(v1.id);
    // Un segundo sucesor repite ámbito y versión: lo rechazan las restricciones únicas.
    await expect(db.consumptionSeries.create({ data: await series({ ...scope, version: 2, previousSeriesId: v1.id }) })).rejects.toThrow(/Unique constraint failed/);
  });

  it("queues jobs only from active DIRECTIVA or ADMINISTRADOR members and changes only their operational state (EST-D-04)", async () => {
    // Nace en cola, con una campaña objetivo del tenant y un solicitante autorizado.
    await expect(db.estimationJob.create({ data: jobData({ requestedByUserId: farmerUser, requestedByRole: "AGRICULTOR" }) })).rejects.toThrow(/EstimationJob_values/);
    for (const user of [farmerUser, foreignUser, inactiveDirectorUser, disabledAccountUser]) {
      await expect(db.estimationJob.create({ data: jobData({ requestedByUserId: user }) })).rejects.toThrow(/no es miembro activo del tenant con ese rol/);
    }
    await expect(db.estimationJob.create({ data: jobData({ targetCampaignId: f.campaigns.openB }) })).rejects.toThrow(/campaña objetivo no es del tenant/);
    // EST-D-06: sólo una campaña PLANIFICADA o ABIERTA admite trabajos (closedA está clasificada y CERRADA).
    await expect(db.estimationJob.create({ data: jobData({ targetCampaignId: f.campaigns.closedA }) })).rejects.toThrow(/no es admisible/);
    // EST-D-02: una campaña objetivo sin clasificar no admite trabajos.
    await expect(db.estimationJob.create({ data: jobData({ targetCampaignId: f.campaigns.openA }) })).rejects.toThrow(/campaña objetivo no está clasificada/);
    await expect(db.estimationJob.create({ data: jobData({ status: "RUNNING", attempts: 1, startedAt: new Date(), leaseExpiresAt: new Date() }) })).rejects.toThrow(/empieza en cola/);
    await expect(db.estimationJob.create({ data: jobData({ productRefs: { product: f.products.liquidA } }) })).rejects.toThrow(/EstimationJob_values/);
    const queued = await db.estimationJob.create({ data: jobData({ productRefs: [f.products.liquidA] }) });
    expect(queued).toMatchObject({ status: "QUEUED", attempts: 0 });
    await expect(db.estimationJob.create({ data: jobData({ requestId: queued.requestId }) })).rejects.toThrow(/Unique constraint failed/);

    const set = (id: string, data: Prisma.EstimationJobUpdateInput) => db.estimationJob.update({ where: { id }, data });
    // La petición no cambia, ni siquiera en cola.
    await expect(set(queued.id, { requestHash: "c".repeat(64) })).rejects.toThrow(/la petición no cambia/);
    await expect(set(queued.id, { productRefs: [] })).rejects.toThrow(/la petición no cambia/);
    await expect(set(queued.id, { targetCampaign: { connect: { id: targets[1]! } } })).rejects.toThrow(/la petición no cambia/);
    // Sólo hacia delante y con los campos de cada estado.
    await expect(set(queued.id, { status: "COMPLETED", attempts: 1, finishedAt: new Date() })).rejects.toThrow(/transición no admitida de QUEUED a COMPLETED/);
    await expect(set(queued.id, { status: "RUNNING" })).rejects.toThrow(/EstimationJob_values/);
    const lease = () => new Date(Date.now() + 300000);
    await set(queued.id, { status: "RUNNING", attempts: 1, startedAt: new Date(), leaseExpiresAt: lease() });
    // Otro intento (el trabajador lo toma al vencer el plazo o tras un error transitorio); los intentos no disminuyen.
    await set(queued.id, { attempts: 2, startedAt: new Date(), leaseExpiresAt: lease() });
    await expect(set(queued.id, { attempts: 1 })).rejects.toThrow(/no disminuyen/);
    await expect(set(queued.id, { startedAt: new Date(), leaseExpiresAt: lease() })).rejects.toThrow(/otro intento aumenta los intentos/);
    await expect(set(queued.id, { status: "QUEUED", attempts: 0, startedAt: null, leaseExpiresAt: null })).rejects.toThrow(/transición no admitida de RUNNING a QUEUED/);
    // COMPLETED exige su ejecución.
    await expect(set(queued.id, { status: "COMPLETED", finishedAt: new Date(), leaseExpiresAt: null })).rejects.toThrow(/exige su ejecución/);
    // Los intentos no superan el máximo fijado al encolar (EST-D-16).
    await expect(set(queued.id, { attempts: 4, startedAt: new Date(), leaseExpiresAt: lease() })).rejects.toThrow(/EstimationJob_values/);
    // El máximo se fija al encolar: ni subirlo para reintentar sin límite ni bajarlo para agotar antes.
    await expect(set(queued.id, { maxAttempts: 10 })).rejects.toThrow(/la petición no cambia/);
    await expect(set(queued.id, { maxAttempts: 2 })).rejects.toThrow(/la petición no cambia/);
    // EST-D-15: una parada lleva su motivo cerrado y lo observado, y la base
    // comprueba lo que puede ver.
    const stop = (stopCode: string, stopEvidence?: object) =>
      set(queued.id, { status: "NOT_EXECUTED", finishedAt: new Date(), leaseExpiresAt: null, stopCode, ...(stopEvidence ? { stopEvidence } : {}) });
    await expect(stop("OTRO", { observed: true })).rejects.toThrow(/EstimationJob_values/);
    await expect(set(queued.id, { status: "NOT_EXECUTED", finishedAt: new Date(), leaseExpiresAt: null })).rejects.toThrow(/EstimationJob_values/);
    await expect(stop("OTRO")).rejects.toThrow(/EstimationJob_values/);
    await expect(stop("POLICY_PENDING")).rejects.toThrow(/no registra el modo POLICY_PENDING/);
    await expect(stop("POLICY_PENDING", { disclosure_mode: "PROVISIONAL_SYNTHETIC" })).rejects.toThrow(/no registra el modo POLICY_PENDING/);
    await expect(stop("REQUESTER_NOT_AUTHORIZED", { member_active: false })).rejects.toThrow(/el solicitante sigue autorizado/);
    await expect(stop("TARGET_CAMPAIGN_NOT_ELIGIBLE", { campaign_status: "CERRADA" })).rejects.toThrow(/sigue siendo admisible/);
    // ATTEMPTS_EXHAUSTED ya no es una parada: es una ejecución FAILED (RETRIES_EXHAUSTED).
    await expect(stop("ATTEMPTS_EXHAUSTED", { attempts: 2 })).rejects.toThrow(/EstimationJob_values/);
    const stopped = await stop("POLICY_PENDING", { disclosure_mode: "POLICY_PENDING", observed_at: new Date().toISOString() });
    expect(stopped).toMatchObject({ status: "NOT_EXECUTED", stopCode: "POLICY_PENDING", stopEvidence: { disclosure_mode: "POLICY_PENDING" } });
    // Un trabajo terminado no cambia ni se borra.
    await expect(set(queued.id, { attempts: 3 })).rejects.toThrow(/terminado no cambia/);
    await expect(db.$executeRawUnsafe(`DELETE FROM "EstimationJob" WHERE "id" = '${queued.id}'`)).rejects.toThrow(/EstimationJob no se borra/);
    await expect(db.$executeRawUnsafe(`TRUNCATE "EstimationJob" CASCADE`)).rejects.toThrow(/no se borra|es inmutable/);

    // Un trabajo completado con su ejecución, registrada en la misma transacción.
    const job = await runningJob({ targetCampaignId: targets[9]! });
    const [, completed] = await db.$transaction([
      db.estimationRun.create({ data: runOf(job) }),
      db.estimationJob.update({ where: { id: job.id }, data: { status: "COMPLETED", finishedAt: new Date(), leaseExpiresAt: null } }),
    ]);
    expect(completed.status).toBe("COMPLETED");
    await expect(set(job.id, { status: "RUNNING" })).rejects.toThrow(/terminado no cambia/);

    // Un trabajo cuya ejecución ya está registrada sólo puede pasar a COMPLETED:
    // ni otro intento ni NOT_EXECUTED.
    const withRun = await runningJob({ targetCampaignId: targets[9]! });
    const root = await db.estimationRun.findUniqueOrThrow({ where: { jobId: job.id } });
    await db.estimationRun.create({ data: runOf(withRun, { previousRunId: root.id }) });
    await expect(set(withRun.id, { attempts: 2, startedAt: new Date(), leaseExpiresAt: lease() })).rejects.toThrow(/sólo pasa a COMPLETED/);
    await expect(
      set(withRun.id, { status: "NOT_EXECUTED", finishedAt: new Date(), leaseExpiresAt: null, stopCode: "POLICY_PENDING", stopEvidence: { disclosure_mode: "POLICY_PENDING" } }),
    ).rejects.toThrow(/sólo pasa a COMPLETED/);
    expect((await set(withRun.id, { status: "COMPLETED", finishedAt: new Date(), leaseExpiresAt: null })).status).toBe("COMPLETED");
  });

  it("records a run only for a running job of the same request, while its requester is still authorised (EST-D-04, EST-D-13)", async () => {
    const queued = await db.estimationJob.create({ data: jobData({ targetCampaignId: targets[1]! }) });
    await expect(db.estimationRun.create({ data: runOf(queued) })).rejects.toThrow(/el trabajo no está en curso/);
    const job = await runningJob({ targetCampaignId: targets[1]! });
    await expect(db.estimationRun.create({ data: runOf(job, { targetCampaignId: targets[2]! }) })).rejects.toThrow(/el trabajo no está en curso o no es la misma petición/);
    await expect(db.estimationRun.create({ data: runOf(job, { requestedByUserId: adminUser, requestedByRole: "ADMINISTRADOR" }) })).rejects.toThrow(/no es la misma petición/);
    // Un trabajo nunca es de AGRICULTOR (CHECK), así que una ejecución tampoco.
    await expect(db.estimationRun.create({ data: runOf(job, { requestedByUserId: farmerUser, requestedByRole: "AGRICULTOR" }) })).rejects.toThrow(/no es la misma petición/);
    await expect(db.estimationRun.create({ data: runOf(job, { horizon: 2 }) })).rejects.toThrow(/EstimationRun_values/);
    await expect(db.estimationRun.create({ data: runOf(job, { outcome: "FAILED" }) })).rejects.toThrow(/EstimationRun_values/);
    await expect(db.estimationRun.create({ data: runOf(job, { outcome: "FAILED", failureCode: "OTRO" }) })).rejects.toThrow(/EstimationRun_values/);
    await expect(db.estimationRun.create({ data: runOf(job, { disclosureMode: "POLICY_PENDING" }) })).rejects.toThrow(/EstimationRun_values/);
    // La campaña objetivo está clasificada en la temporada de la ejecución.
    await expect(db.estimationRun.create({ data: runOf(job, { seasonId: summer }) })).rejects.toThrow(/no está clasificada en esa temporada/);
    expect((await db.estimationRun.create({ data: runOf(job) })).requestedByRole).toBe("DIRECTIVA");
    const byAdmin = await runningJob({ requestedByUserId: adminUser, requestedByRole: "ADMINISTRADOR", targetCampaignId: targets[2]! });
    expect((await db.estimationRun.create({ data: runOf(byAdmin) })).requestedByRole).toBe("ADMINISTRADOR");

    // El solicitante pierde el permiso entre la cola y el cálculo: no hay
    // ejecución y el trabajo termina sin ejecutarse.
    const revoked = await person("Directiva revocada");
    const pending = await runningJob({ requestedByUserId: revoked, targetCampaignId: targets[8]! });
    await db.member.updateMany({ where: { userId: revoked }, data: { isActive: false } });
    await expect(db.estimationRun.create({ data: runOf(pending) })).rejects.toThrow(/no es miembro activo del tenant con ese rol/);
    const stopped = await db.estimationJob.update({
      where: { id: pending.id },
      data: { status: "NOT_EXECUTED", finishedAt: new Date(), leaseExpiresAt: null, stopCode: "REQUESTER_NOT_AUTHORIZED", stopEvidence: { member_active: false } },
    });
    expect(stopped.stopCode).toBe("REQUESTER_NOT_AUTHORIZED");
    expect(await db.estimationRun.count({ where: { jobId: pending.id } })).toBe(0);
    // EST-D-16: una ejecución iniciada que agota sus reintentos transitorios es
    // FAILED con RETRIES_EXHAUSTED, distinta de una parada antes de calcular.
    const transient = await runningJob({ targetCampaignId: targets[12]! });
    const exhausted = { outcome: "FAILED" as const, failureCode: "RETRIES_EXHAUSTED" };
    await expect(db.estimationRun.create({ data: runOf(transient, exhausted) })).rejects.toThrow(/los reintentos no están agotados/);
    for (const attempts of [2, 3]) {
      await db.estimationJob.update({ where: { id: transient.id }, data: { attempts, startedAt: new Date(), leaseExpiresAt: new Date(Date.now() + 300000) } });
    }
    expect((await db.estimationRun.create({ data: runOf(transient, exhausted) })).failureCode).toBe("RETRIES_EXHAUSTED");
    await expect(db.estimationRun.create({ data: runOf(await runningJob({ targetCampaignId: targets[13]! }), { outcome: "FAILED", failureCode: "SOURCES_UNAVAILABLE" }) })).rejects.toThrow(
      /EstimationRun_values/,
    );
    // EST-D-06: si la campaña objetivo se cierra después de empezar el
    // cálculo, la ejecución se completa y se conserva como histórica.
    const closing = await runningJob({ targetCampaignId: targets[13]! });
    await db.agriculturalCampaign.update({ where: { id: targets[13]! }, data: { status: "CERRADA", closedAt: new Date() } });
    const kept = await db.estimationRun.create({ data: runOf(closing) });
    expect(kept.targetCampaignId).toBe(targets[13]);
    // Lo mismo si se desactiva la cuenta y el Member sigue activo.
    const disabled = await person("Directiva con cuenta desactivada después");
    const waiting = await runningJob({ requestedByUserId: disabled, targetCampaignId: targets[8]! });
    await db.user.update({ where: { id: disabled }, data: { isActive: false } });
    await expect(db.estimationRun.create({ data: runOf(waiting) })).rejects.toThrow(/no es miembro activo del tenant con ese rol/);
  });

  it("corrects a classification with a reason, as a new version, and keeps the version that earlier series and runs used (EST-D-14)", async () => {
    // La versión 1 asigna una temporada; sin temporada sólo cabe una corrección.
    await expect(db.campaignSeasonClassification.create({ data: classification(f.campaigns.openA, null) })).rejects.toThrow(/CampaignSeasonClassification_values/);
    const v1 = cls[reclassified]!;
    const before = await db.consumptionSeries.create({
      data: { ...(await series({ canonicalProductId: f.products.solidA, baseUnit: "G" })), points: { create: [{ position: 1, campaignId: reclassified, classificationId: v1, kind: "NO_RECORD" }] } },
    });
    const correction = (data: Record<string, unknown>) =>
      db.campaignSeasonClassification.create({ data: classification(reclassified, summer, { version: 2, previousClassificationId: v1, ...data }) });
    await expect(correction({})).rejects.toThrow(/CampaignSeasonClassification_values/);
    await expect(correction({ reason: "   " })).rejects.toThrow(/CampaignSeasonClassification_values/);
    await expect(correction({ reason: "Misma temporada", seasonId: winter })).rejects.toThrow(/no cambia la temporada/);
    await expect(correction({ reason: "Otra campaña", previousClassificationId: cls[olderCampaigns[0]!] })).rejects.toThrow(/no sucede a la versión anterior/);
    await expect(correction({ reason: "Salto de versión", version: 3 })).rejects.toThrow(/no sucede a la versión anterior/);
    await expect(correction({ reason: "Sin anterior", previousClassificationId: null })).rejects.toThrow(/CampaignSeasonClassification_values/);
    const v2 = await correction({ reason: "La campaña de 2020 se sembró en verano, no en invierno" });
    expect(v2).toMatchObject({ version: 2, previousClassificationId: v1, seasonId: summer });
    // Sólo se corrige la vigente: otra corrección de la versión 1 sobra.
    await expect(correction({ reason: "Corrección concurrente", seasonId: null })).rejects.toThrow(/Unique constraint failed/);

    // La serie anterior conserva la versión que usó; una serie nueva cita la vigente.
    expect((await db.seriesPoint.findFirstOrThrow({ where: { seriesId: before.id } })).classificationId).toBe(v1);
    const solidSummer = { canonicalProductId: f.products.solidA, baseUnit: "G" };
    const point = (classificationId: string) => ({ position: 1, campaignId: reclassified, classificationId, kind: "NO_RECORD" as const });
    await expect(
      db.consumptionSeries.create({ data: { ...(await series({ canonicalProductId: f.products.solidA, baseUnit: "G" })), points: { create: [point(v1)] } } }),
    ).rejects.toThrow(/esa versión vigente/);
    await expect(
      db.consumptionSeries.create({ data: { ...(await series({ canonicalProductId: f.products.solidA, baseUnit: "G" })), points: { create: [point(v2.id)] } } }),
    ).rejects.toThrow(/esa versión vigente/);
    const after = await db.consumptionSeries.create({ data: { ...(await series({ ...solidSummer, seasonId: summer })), points: { create: [point(v2.id)] } } });
    expect(after.seasonId).toBe(summer);

    // Una corrección puede dejar la campaña sin clasificar; deja de servir para series.
    const v3 = await db.campaignSeasonClassification.create({
      data: classification(reclassified, null, { version: 3, previousClassificationId: v2.id, reason: "No es comparable con ninguna temporada" }),
    });
    expect(v3.seasonId).toBeNull();
    await expect(
      db.consumptionSeries.create({ data: { ...(await series({ ...solidSummer, seasonId: summer })), points: { create: [point(v2.id)] } } }),
    ).rejects.toThrow(/esa versión vigente/);
    const history = await db.campaignSeasonClassification.findMany({ where: { campaignId: reclassified }, orderBy: { version: "asc" } });
    expect(history.map((k) => [k.version, k.seasonId, k.reason !== null])).toEqual([
      [1, winter, false],
      [2, summer, true],
      [3, null, true],
    ]);

    // Ejecuciones: la anterior conserva la versión de su campaña objetivo; la
    // siguiente cita la vigente y su temporada.
    const target = targets[10]!;
    const first = await db.estimationRun.create({ data: runOf(await runningJob({ targetCampaignId: target })) });
    const moved = await db.campaignSeasonClassification.create({
      data: classification(target, summer, { version: 2, previousClassificationId: cls[target], reason: "Objetivo de verano" }),
    });
    expect((await db.estimationRun.findUniqueOrThrow({ where: { id: first.id } })).targetClassificationId).toBe(cls[target]);
    const next = await runningJob({ targetCampaignId: target });
    await expect(db.estimationRun.create({ data: runOf(next, { previousRunId: first.id }) })).rejects.toThrow(/esa versión vigente/);
    await expect(db.estimationRun.create({ data: runOf(next, { previousRunId: first.id, targetClassificationId: moved.id }) })).rejects.toThrow(/esa versión vigente/);
    const second = await db.estimationRun.create({
      data: runOf(next, { previousRunId: first.id, targetClassificationId: moved.id, seasonId: summer }),
    });
    expect(second).toMatchObject({ seasonId: summer, targetClassificationId: moved.id });

    // Un objetivo que queda sin clasificar no admite trabajos, y uno en curso
    // termina sin ejecutarse con un motivo que la base comprueba.
    const declassified = targets[11]!;
    const waiting = await runningJob({ targetCampaignId: declassified });
    const stopWaiting = () =>
      db.estimationJob.update({
        where: { id: waiting.id },
        data: { status: "NOT_EXECUTED", finishedAt: new Date(), leaseExpiresAt: null, stopCode: "TARGET_CAMPAIGN_NOT_ELIGIBLE", stopEvidence: { classified: false, campaign_status: "PLANIFICADA" } },
      });
    await expect(stopWaiting()).rejects.toThrow(/sigue siendo admisible/);
    await db.campaignSeasonClassification.create({
      data: classification(declassified, null, { version: 2, previousClassificationId: cls[declassified], reason: "Sin temporada comparable" }),
    });
    await expect(db.estimationJob.create({ data: jobData({ targetCampaignId: declassified }) })).rejects.toThrow(/campaña objetivo no está clasificada/);
    expect((await stopWaiting()).stopCode).toBe("TARGET_CAMPAIGN_NOT_ELIGIBLE");
  });

  it("serves synthetic sources sealed before the consumption coverage as unknown and those sealed after as identified (EST-D-09)", async () => {
    const autumn = (await db.comparabilitySeason.create({ data: seasonData("COBERTURA") })).id;
    const sources = [...legacySources, ...coveredSources];
    const versions: Record<string, string> = {};
    for (const source of sources) {
      versions[source.campaignId] = (await db.campaignSeasonClassification.create({ data: classification(source.campaignId, autumn) })).id;
    }
    const built = await db.consumptionSeries.create({
      data: {
        ...(await series({ seasonId: autumn })),
        points: {
          create: sources.map((source, index) => ({
            position: index + 1, campaignId: source.campaignId, classificationId: versions[source.campaignId]!,
            kind: "VERIFIED_CONSUMPTION" as const, quantityBase: source.quantityBase, sourceReleaseId: source.releaseId, sourceSealId: source.sealId,
          })),
        },
      },
      include: { points: { orderBy: { position: "asc" }, include: { sourceSeal: { include: { consumptionCoverage: true } } } } },
    });
    // La cobertura no está en el punto: se lee de su sellado. Los anteriores
    // no tienen fila (desconocida); los nuevos, N de M de participación.
    expect(built.points.map((p) => [p.quantityBase, p.sourceSeal!.consumptionCoverage])).toEqual([
      [50000n, null],
      [60000n, null],
      [70000n, { sealId: coveredSources[0]!.sealId, status: "IDENTIFIED", linkedMembers: 5, membersInPublishedFigures: 3 }],
      [0n, { sealId: coveredSources[1]!.sealId, status: "IDENTIFIED", linkedMembers: 5, membersInPublishedFigures: 3 }],
      [90000n, { sealId: coveredSources[2]!.sealId, status: "IDENTIFIED", linkedMembers: 5, membersInPublishedFigures: 3 }],
    ]);
    // Un sellado sintético con POPULATION_MISMATCH no lleva fracción: también desconocida.
    const [mismatch] = await sealedConsumptionCampaigns(db, {
      tenantId: f.tenantA, sealedByUserId: directorUser, canonicalProductId: f.products.liquidA, baseUnit: "ML",
      firstYear: 2020, quantities: [65000n], namePrefix: "Campaña sintética con poblaciones distintas", coverage: { status: "POPULATION_MISMATCH" },
    });
    expect(await db.collectiveSealConsumptionCoverage.findUniqueOrThrow({ where: { sealId: mismatch!.sealId } })).toEqual({
      sealId: mismatch!.sealId, status: "POPULATION_MISMATCH", linkedMembers: null, membersInPublishedFigures: null,
    });
    // Los sellados de esta suite anteriores a la cobertura tampoco la tienen.
    expect(await db.collectiveSealConsumptionCoverage.count({ where: { sealId: { in: Object.values(seals) } } })).toBe(0);
  });

  it("stores figures only for ESTIMATED results, never in a failed run, and only with their run (RN-28)", async () => {
    const s = await fullSeries();
    const ok = await db.estimationRun.create({
      data: { ...runOf(await runningJob({ targetCampaignId: targets[3]! })), results: { create: [estimated(s.id)] } },
      include: { results: true },
    });
    expect(ok.results[0]!.estimateBase!.toString()).toBe("52000");
    // Los intentos rechazados no dejan raíz: pueden reutilizar trabajo y campaña objetivo.
    const job = await runningJob({ targetCampaignId: targets[4]! });
    const withResults = (results: object[], data: Record<string, unknown> = {}) =>
      db.estimationRun.create({ data: { ...runOf(job, data), results: { create: results as never } } });
    await expect(withResults([{ ...insufficient(), naiveBase: 1n }])).rejects.toThrow(/EstimationResult_values/);
    await expect(withResults([{ ...insufficient(), fitCriterion: "256" }])).rejects.toThrow(/EstimationResult_values/);
    await expect(withResults([{ ...insufficient(), metrics: { mae: "1" } }])).rejects.toThrow(/EstimationResult_values/);
    await expect(withResults([{ ...insufficient(), reasonCode: "OTRO" }])).rejects.toThrow(/EstimationResult_values/);
    // Cada motivo pertenece a su estado.
    await expect(withResults([{ ...insufficient(), reasonCode: "COVERAGE_UNKNOWN" }])).rejects.toThrow(/EstimationResult_values/);
    await expect(withResults([{ ...insufficient(), status: "INCOMPATIBLE_DATA", reasonCode: "SPAN_TOO_SHORT" }])).rejects.toThrow(/EstimationResult_values/);
    await expect(withResults([{ ...insufficient(), status: "INCOMPATIBLE_DATA", reasonCode: "CALCULATION_ERROR" }])).rejects.toThrow(/EstimationResult_values/);
    await expect(withResults([estimated(s.id, { estimateBase: null })])).rejects.toThrow(/EstimationResult_values/);
    await expect(withResults([estimated(s.id, { fitCriterion: null })])).rejects.toThrow(/EstimationResult_values/);
    await expect(withResults([estimated(s.id, { spanLastPosition: 2 })])).rejects.toThrow(/EstimationResult_values/);
    await expect(withResults([estimated(s.id, { reasonCode: "SPAN_TOO_SHORT" })])).rejects.toThrow(/EstimationResult_values/);
    await expect(withResults([estimated(s.id)], { outcome: "FAILED", failureCode: "CALCULATION_FAILED" })).rejects.toThrow(/fallida no lleva cifras/);
    await expect(withResults([{ ...insufficient(), canonicalProductId: f.products.inactiveA }])).rejects.toThrow(/no es canónico/);
    // La serie usada es de la misma temporada que la ejecución.
    const otherSeason = await db.consumptionSeries.create({ data: await series({ seasonId: summer }) });
    await expect(withResults([{ ...insufficient(), seriesId: otherSeason.id }])).rejects.toThrow(/serie no es la del mismo ámbito/);
    const coverage = { ...insufficient(), status: "INCOMPATIBLE_DATA" as const, reasonCode: "COVERAGE_UNKNOWN", seriesId: s.id, spanFirstPosition: 1, spanLastPosition: 3 };
    const failed = await withResults(
      [{ ...insufficient(), status: "CALCULATION_FAILED", reasonCode: "CALCULATION_ERROR" }],
      { outcome: "FAILED", failureCode: "CALCULATION_FAILED" },
    );
    expect(failed.outcome).toBe("FAILED");
    // Un resultado no se añade después a una ejecución ya registrada.
    await expect(db.estimationResult.create({ data: { runId: ok.id, ...coverage, canonicalProductId: f.products.solidA, baseUnit: "G", seriesId: null } })).rejects.toThrow(
      /no admite resultados posteriores/,
    );
    // EST-D-09: una cobertura desconocida se informa sin cifras.
    const unknown = await db.estimationRun.create({
      data: { ...runOf(await runningJob({ targetCampaignId: targets[6]! })), results: { create: [coverage] } },
      include: { results: true },
    });
    expect(unknown.results[0]).toMatchObject({ status: "INCOMPATIBLE_DATA", reasonCode: "COVERAGE_UNKNOWN", estimateBase: null, naiveBase: null });
  });

  it("keeps one chain per target: one root, one successor each, never a later predecessor", async () => {
    const target = targets[7]!;
    const first = await db.estimationRun.create({ data: runOf(await runningJob({ targetCampaignId: target })) });
    await expect(db.estimationRun.create({ data: runOf(await runningJob({ targetCampaignId: target })) })).rejects.toThrow(/Unique constraint failed/);
    const second = await db.estimationRun.create({ data: runOf(await runningJob({ targetCampaignId: target }), { previousRunId: first.id }) });
    expect(second.previousRunId).toBe(first.id);
    await expect(db.estimationRun.create({ data: runOf(await runningJob({ targetCampaignId: target }), { previousRunId: first.id }) })).rejects.toThrow(/previousRunId/);
    await expect(db.estimationRun.create({ data: runOf(await runningJob({ targetCampaignId: targets[5]! }), { previousRunId: second.id }) })).rejects.toThrow(/misma campaña objetivo/);
    await expect(
      db.estimationRun.create({ data: runOf(await runningJob({ targetCampaignId: target }), { previousRunId: second.id, generatedAt: new Date(second.generatedAt.getTime() - 60000) }) }),
    ).rejects.toThrow(/es posterior/);
    // Un trabajo produce una sola ejecución.
    await expect(db.estimationRun.create({ data: { ...runOf(await runningJob({ targetCampaignId: target }), { previousRunId: second.id }), jobId: second.jobId } })).rejects.toThrow(/jobId/);
  });

  it("refuses UPDATE, DELETE and TRUNCATE on series, points, runs and results", async () => {
    const s = await fullSeries();
    const r = await db.estimationRun.create({ data: { ...runOf(await runningJob({ targetCampaignId: targets[5]! })), results: { create: [estimated(s.id)] } } });
    const statements = [
      [`UPDATE "ConsumptionSeries" SET "sourceHash" = '${"c".repeat(64)}' WHERE "id" = '${s.id}'`, /ConsumptionSeries es inmutable/],
      [`DELETE FROM "SeriesPoint" WHERE "seriesId" = '${s.id}'`, /SeriesPoint es inmutable/],
      [`UPDATE "SeriesPoint" SET "quantityBase" = 1 WHERE "seriesId" = '${s.id}' AND "position" = 3`, /SeriesPoint es inmutable/],
      [`UPDATE "EstimationRun" SET "outcome" = 'FAILED', "failureCode" = 'CALCULATION_FAILED' WHERE "id" = '${r.id}'`, /EstimationRun es inmutable/],
      [`DELETE FROM "EstimationRun" WHERE "id" = '${r.id}'`, /EstimationRun es inmutable/],
      [`UPDATE "EstimationResult" SET "estimateBase" = 1 WHERE "runId" = '${r.id}'`, /EstimationResult es inmutable/],
      [`DELETE FROM "EstimationResult" WHERE "runId" = '${r.id}'`, /EstimationResult es inmutable/],
      [`DELETE FROM "ConsumptionSeries" WHERE "id" = '${s.id}'`, /ConsumptionSeries es inmutable/],
      [`TRUNCATE "EstimationResult"`, /EstimationResult es inmutable/],
      [`TRUNCATE "SeriesPoint"`, /SeriesPoint es inmutable/],
      [`TRUNCATE "EstimationRun" CASCADE`, /es inmutable/],
      [`TRUNCATE "ConsumptionSeries" CASCADE`, /es inmutable/],
    ] as const;
    for (const [sql, message] of statements) {
      await expect(db.$executeRawUnsafe(sql)).rejects.toThrow(message);
    }
    const kept = await db.estimationResult.findMany({ where: { runId: r.id } });
    expect(kept.map((x) => x.estimateBase!.toString())).toEqual(["52000"]);
    expect(await db.seriesPoint.count({ where: { seriesId: s.id } })).toBe(3);
  });

  async function person(label: string) {
    const id = randomUUID();
    await db.user.create({
      data: {
        id, tenantId: f.tenantA, name: label, email: `${label.replaceAll(" ", "-")}-${id}@example.test`, passwordHash: "unusable", role: "DIRECTIVA",
        members: { create: { tenantId: f.tenantA, role: "DIRECTIVA" } },
      },
    });
    return id;
  }
});
