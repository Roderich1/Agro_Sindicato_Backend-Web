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

/**
 * F12-EST-01 (#174, F12_EST_01_ESTIMATION_CONTRACT.md §6): esquema de la
 * estimación del consumo. Sólo el esquema: no hay rutas ni cálculo, y las
 * cifras de las filas son ilustrativas (el cálculo es de F12-EST-04). La base
 * se crea con las migraciones anteriores, recibe datos sintéticos y después
 * la migración nueva, que debe ser aditiva y conservarlos.
 */
const postgresUrl = process.env["F12_EST_PG_TEST_URL"];
const describePostgres = postgresUrl ? describe : describe.skip;
const MIGRATION = "20261101233651_f12_est_01_estimation";
const HASH = "a".repeat(64);
const TABLES = ["ConsumptionSeries", "SeriesPoint", "EstimationRun", "EstimationResult"];

describePostgres("F12-EST-01 estimation schema", () => {
  let db: PrismaClient;
  let f: Fixture;
  /** Consumo publicado de la campaña cerrada A (cero comprobado). */
  let zeroRelease: string;
  /** Consumo publicado de las dos campañas antiguas. */
  let olderReleases: string[];
  /** Consumo publicado de solidA en la campaña cerrada A, fuera del sellado. */
  let unsealedRelease: string;
  let olderCampaigns: string[];
  let targets: string[];
  let directorUser: string;
  let adminUser: string;
  let farmerUser: string;
  let inactiveDirectorUser: string;
  let foreignUser: string;
  let migrationOutput: string;
  let before: string;
  let after: string;
  let catalogBefore: string;
  let catalogAfter: string;

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
    // La base previa: todas las migraciones anteriores a la nueva.
    const previous = mkdtempSync(join(tmpdir(), "f12-prev-"));
    try {
      cpSync(resolve("prisma/schema.prisma"), join(previous, "schema.prisma"));
      cpSync(resolve("prisma/migrations"), join(previous, "migrations"), { recursive: true });
      rmSync(join(previous, "migrations", MIGRATION), { recursive: true });
      // La base previa no tiene nada posterior (F12-EST-01 añadió una migración detrás).
      for (const entry of readdirSync(join(previous, "migrations"))) {
        if (/^\d{14}_/.test(entry) && entry > MIGRATION) rmSync(join(previous, "migrations", entry), { recursive: true });
      }
      expect(readdirSync(join(previous, "migrations"))).not.toContain(MIGRATION);
      expect(deploy(previous).status).toBe(0);
    } finally {
      rmSync(previous, { recursive: true, force: true });
    }
    db = new PrismaClient({ datasources: { db: { url: url.toString() } } });

    // Datos sintéticos anteriores: dos sindicatos, roles, campañas, productos,
    // una asociación canónica, consumos publicados y una fila de DemandForecast.
    f = await seedFixture(db as unknown as PrismaService);
    olderCampaigns = [randomUUID(), randomUUID()];
    targets = Array.from({ length: 8 }, () => randomUUID());
    await db.agriculturalCampaign.createMany({
      data: [
        ...olderCampaigns.map((id, i) => ({
          id, tenantId: f.tenantA, name: `Campaña sintética ${2023 + i}`, status: "CERRADA" as const, isActive: false,
          startDate: new Date(`${2023 + i}-09-01T00:00:00.000Z`), closedAt: new Date(`${2024 + i}-03-01T00:00:00.000Z`),
        })),
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
    inactiveDirectorUser = randomUUID();
    await db.user.create({
      data: {
        id: inactiveDirectorUser, tenantId: f.tenantA, name: "Directiva inactiva", email: `inactiva-${randomUUID()}@example.test`,
        passwordHash: "unusable", role: "DIRECTIVA",
        members: { create: { tenantId: f.tenantA, role: "DIRECTIVA", isActive: false } },
      },
    });
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
    unsealedRelease = await release(f.campaigns.closedA, 5000n, f.products.solidA, "G");
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
    const result = deploy(resolve("prisma"));
    migrationOutput = `${result.stdout}\n${result.stderr}`;
    expect(result.status).toBe(0);
    after = await dump();
    catalogAfter = await catalog(previousTables);
  }, 300000);

  afterAll(async () => {
    await db?.$disconnect();
  });

  const series = (data: Record<string, unknown> = {}) => ({
    tenantId: f.tenantA, canonicalProductId: f.products.liquidA, baseUnit: "ML" as const, comparabilityKey: `K-${randomUUID().slice(0, 8)}`,
    version: 1, sourceHash: HASH, sources: [], ...data,
  });
  const run = (data: Record<string, unknown> = {}) => ({
    tenantId: f.tenantA, requestId: randomUUID(), requestHash: HASH, requestedByUserId: directorUser, requestedByRole: "DIRECTIVA" as const,
    targetCampaignId: targets[0]!, comparabilityKey: "INVIERNO", contractVersion: 1, method: "SES_NAIVE",
    methodVersion: "F12-EST-04/1", parameters: { horizon: 1 }, horizon: 1, disclosureMode: "PROVISIONAL_SYNTHETIC",
    policy: "F07-POL-01", threshold: 3, outcome: "CALCULATED" as const, contentHash: HASH, ...data,
  });
  const estimated = (seriesId: string, data: Record<string, unknown> = {}) => ({
    canonicalProductId: f.products.liquidA, baseUnit: "ML" as const, seriesId, status: "ESTIMATED" as const,
    estimateBase: "52000.000000", naiveBase: 0n, alpha: "0.50", fitInformative: true, fitCriterion: "256.000000",
    spanFirstPosition: 1, spanLastPosition: 3, exclusions: [], validations: [{ code: "UNITS", passed: true }], ...data,
  });
  const insufficient = () => ({ canonicalProductId: f.products.liquidA, baseUnit: "ML" as const, status: "INSUFFICIENT_DATA" as const, reasonCode: "SPAN_TOO_SHORT", exclusions: [], validations: [] });
  /** Tres campañas consecutivas con consumo comprobado (120 L, 104 L y 0 L). */
  const fullSeries = async () =>
    db.consumptionSeries.create({
      data: {
        ...series(),
        points: {
          create: [
            { position: 1, campaignId: olderCampaigns[0]!, kind: "VERIFIED_CONSUMPTION", quantityBase: 120000n, sourceReleaseId: olderReleases[0]!, coverageReported: 4, coverageExpected: 5 },
            { position: 2, campaignId: olderCampaigns[1]!, kind: "VERIFIED_CONSUMPTION", quantityBase: 104000n, sourceReleaseId: olderReleases[1]!, coverageReported: 4, coverageExpected: 5 },
            { position: 3, campaignId: f.campaigns.closedA, kind: "VERIFIED_CONSUMPTION", quantityBase: 0n, sourceReleaseId: zeroRelease, coverageReported: 3, coverageExpected: 5 },
          ],
        },
      },
    });

  it("is additive: keeps every earlier row, column, constraint, index and trigger and does not touch DemandForecast", () => {
    expect(migrationOutput).toContain(MIGRATION);
    expect(after).toBe(before);
    expect(JSON.parse(after).forecasts).toHaveLength(1);
    expect(catalogAfter).toBe(catalogBefore);
    expect(JSON.parse(catalogAfter).columns.some((c: { table_name: string }) => c.table_name === "DemandForecast")).toBe(true);
  });

  it("creates the four tables with no stored validity and no approval columns", async () => {
    const rows = await db.$queryRawUnsafe<{ table_name: string; column_name: string }[]>(
      `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
      TABLES,
    );
    expect(new Set(rows.map((r) => r.table_name))).toEqual(new Set(TABLES));
    expect(rows.filter((r) => /validity|vigenc|approv|aprob/i.test(r.column_name))).toEqual([]);
  });

  it("keeps a verified zero, an absence and a hidden value apart, and copies only the current disclosed figure (RN-26)", async () => {
    const mixed = await db.consumptionSeries.create({
      data: {
        ...series(),
        points: {
          create: [
            { position: 1, campaignId: olderCampaigns[0]!, kind: "NO_RECORD" },
            { position: 2, campaignId: olderCampaigns[1]!, kind: "HIDDEN", coverageReported: 2, coverageExpected: 5 },
            { position: 3, campaignId: f.campaigns.closedA, kind: "VERIFIED_CONSUMPTION", quantityBase: 0n, sourceReleaseId: zeroRelease, coverageReported: 3, coverageExpected: 5 },
          ],
        },
      },
    });
    const points = await db.seriesPoint.findMany({ where: { seriesId: mixed.id }, orderBy: { position: "asc" } });
    expect(points.map((p) => [p.kind, p.quantityBase])).toEqual([
      ["NO_RECORD", null],
      ["HIDDEN", null],
      ["VERIFIED_CONSUMPTION", 0n],
    ]);
    type Point = Prisma.SeriesPointUncheckedCreateWithoutSeriesInput;
    const bad = async (point: Partial<Point> & Pick<Point, "kind">, data: Record<string, unknown> = {}) =>
      db.consumptionSeries.create({ data: { ...series(data), points: { create: [{ position: 1, campaignId: f.campaigns.closedA, ...point }] } } });
    // Una ausencia o un dato oculto con cantidad (por ejemplo, cero) se rechaza.
    await expect(bad({ kind: "NO_RECORD", quantityBase: 0n })).rejects.toThrow(/SeriesPoint_values/);
    await expect(bad({ kind: "HIDDEN", quantityBase: 0n })).rejects.toThrow(/SeriesPoint_values/);
    await expect(bad({ kind: "HIDDEN", sourceReleaseId: zeroRelease })).rejects.toThrow(/SeriesPoint_values/);
    // Un consumo comprobado sin cantidad o sin su divulgación, o negativo, también.
    await expect(bad({ kind: "VERIFIED_CONSUMPTION", sourceReleaseId: zeroRelease })).rejects.toThrow(/SeriesPoint_values/);
    await expect(bad({ kind: "VERIFIED_CONSUMPTION", quantityBase: 5n })).rejects.toThrow(/SeriesPoint_values/);
    await expect(bad({ kind: "VERIFIED_CONSUMPTION", quantityBase: -1n, sourceReleaseId: zeroRelease })).rejects.toThrow(/SeriesPoint_values/);
    await expect(bad({ kind: "NO_RECORD", coverageReported: 6, coverageExpected: 5 })).rejects.toThrow(/SeriesPoint_values/);
    // La cifra es exactamente la divulgada, de esa celda y campaña del tenant.
    await expect(bad({ kind: "VERIFIED_CONSUMPTION", quantityBase: 1n, sourceReleaseId: zeroRelease })).rejects.toThrow(/con esa cifra/);
    await expect(bad({ kind: "VERIFIED_CONSUMPTION", quantityBase: 120000n, sourceReleaseId: olderReleases[0]! })).rejects.toThrow(/con esa cifra/);
    await expect(bad({ campaignId: f.campaigns.openB, kind: "NO_RECORD" })).rejects.toThrow(/campaña no es del tenant/);
    await expect(
      bad({ kind: "VERIFIED_CONSUMPTION", quantityBase: 0n, sourceReleaseId: zeroRelease }, { canonicalProductId: f.products.solidA, baseUnit: "G" }),
    ).rejects.toThrow(/con esa cifra/);
    // Sólo productos canónicos: una denominación asociada se rechaza.
    await expect(bad({ kind: "NO_RECORD" }, { canonicalProductId: f.products.inactiveA })).rejects.toThrow(/no es canónico/);
  });

  it("ties a sealed point to the visible DISCLOSED entry of that seal", async () => {
    const seal = await db.collectiveSeal.create({
      data: {
        tenantId: f.tenantA, campaignId: f.campaigns.closedA, sealedAt: new Date(), sealedByUserId: directorUser, sealedByRole: "DIRECTIVA",
        disclosureMode: "PROVISIONAL_SYNTHETIC", policy: "F07-POL-01", threshold: 3, linkedMembers: 5, membersWithContribution: 3,
        suppressedCells: false, openDisputes: false, reviewRef: "b".repeat(64),
        entries: { create: [{ projectionType: "CONSUMPTION_TOTAL", canonicalProductId: f.products.liquidA, baseUnit: "ML", status: "DISCLOSED", releaseId: zeroRelease }] },
      },
    });
    const sealed = await db.consumptionSeries.create({
      data: {
        ...series(),
        points: { create: [{ position: 1, campaignId: f.campaigns.closedA, kind: "VERIFIED_CONSUMPTION", quantityBase: 0n, sourceReleaseId: zeroRelease, sourceSealId: seal.id, coverageReported: 3, coverageExpected: 5 }] },
      },
      include: { points: true },
    });
    expect(sealed.points[0]!.sourceSealId).toBe(seal.id);
    // Una divulgación que no es entrada de ese sellado se rechaza.
    await expect(
      db.consumptionSeries.create({
        data: {
          ...series({ canonicalProductId: f.products.solidA, baseUnit: "G" }),
          points: { create: [{ position: 1, campaignId: f.campaigns.closedA, kind: "VERIFIED_CONSUMPTION", quantityBase: 5000n, sourceReleaseId: unsealedRelease, sourceSealId: seal.id }] },
        },
      }),
    ).rejects.toThrow(/entrada visible de ese sellado/);
    // El sellado de otra campaña tampoco vale.
    await expect(
      db.consumptionSeries.create({
        data: {
          ...series(),
          points: { create: [{ position: 1, campaignId: olderCampaigns[0]!, kind: "VERIFIED_CONSUMPTION", quantityBase: 120000n, sourceReleaseId: olderReleases[0]!, sourceSealId: seal.id }] },
        },
      }),
    ).rejects.toThrow(/sellado no es de esa campaña/);
  });

  it("writes series versions once, in order and only in their own transaction", async () => {
    const v1 = await db.consumptionSeries.create({ data: series({ comparabilityKey: "VERSIONES" }) });
    await expect(
      db.seriesPoint.create({ data: { seriesId: v1.id, position: 1, campaignId: f.campaigns.closedA, kind: "NO_RECORD" } }),
    ).rejects.toThrow(/no admite puntos posteriores/);
    await expect(db.consumptionSeries.create({ data: series({ comparabilityKey: "VERSIONES", version: 2 }) })).rejects.toThrow(/ConsumptionSeries_values/);
    await expect(
      db.consumptionSeries.create({ data: series({ comparabilityKey: "OTRA", version: 2, previousSeriesId: v1.id }) }),
    ).rejects.toThrow(/versión anterior no es la del mismo ámbito/);
    await expect(
      db.consumptionSeries.create({ data: series({ comparabilityKey: "VERSIONES", version: 3, previousSeriesId: v1.id }) }),
    ).rejects.toThrow(/versión anterior no es la del mismo ámbito/);
    const v2 = await db.consumptionSeries.create({ data: series({ comparabilityKey: "VERSIONES", version: 2, previousSeriesId: v1.id }) });
    expect(v2.previousSeriesId).toBe(v1.id);
    // Un segundo sucesor repite ámbito y versión: lo rechazan las restricciones únicas.
    await expect(
      db.consumptionSeries.create({ data: series({ comparabilityKey: "VERSIONES", version: 2, previousSeriesId: v1.id, sourceHash: "b".repeat(64) }) }),
    ).rejects.toThrow(/Unique constraint failed/);
  });

  it("accepts runs only from active DIRECTIVA or ADMINISTRADOR members of the tenant (defence in depth)", async () => {
    await expect(db.estimationRun.create({ data: run({ requestedByUserId: farmerUser, requestedByRole: "AGRICULTOR" }) })).rejects.toThrow(/EstimationRun_values/);
    await expect(db.estimationRun.create({ data: run({ requestedByUserId: farmerUser, requestedByRole: "DIRECTIVA" }) })).rejects.toThrow(/no es miembro activo del tenant con ese rol/);
    await expect(db.estimationRun.create({ data: run({ requestedByUserId: foreignUser, requestedByRole: "DIRECTIVA" }) })).rejects.toThrow(/no es miembro activo del tenant con ese rol/);
    await expect(db.estimationRun.create({ data: run({ requestedByUserId: inactiveDirectorUser }) })).rejects.toThrow(/no es miembro activo del tenant con ese rol/);
    await expect(db.estimationRun.create({ data: run({ targetCampaignId: f.campaigns.openB }) })).rejects.toThrow(/campaña objetivo no es del tenant/);
    await expect(db.estimationRun.create({ data: run({ horizon: 2 }) })).rejects.toThrow(/EstimationRun_values/);
    await expect(db.estimationRun.create({ data: run({ outcome: "FAILED" }) })).rejects.toThrow(/EstimationRun_values/);
    await expect(db.estimationRun.create({ data: run({ outcome: "FAILED", failureCode: "OTRO" }) })).rejects.toThrow(/EstimationRun_values/);
    await expect(db.estimationRun.create({ data: run({ disclosureMode: "POLICY_PENDING" }) })).rejects.toThrow(/EstimationRun_values/);
    expect((await db.estimationRun.create({ data: run({ targetCampaignId: targets[1]! }) })).requestedByRole).toBe("DIRECTIVA");
    expect((await db.estimationRun.create({ data: run({ requestedByUserId: adminUser, requestedByRole: "ADMINISTRADOR", targetCampaignId: targets[2]! }) })).requestedByRole).toBe("ADMINISTRADOR");
  });

  it("stores figures only for ESTIMATED results, never in a failed run, and only with their run (RN-28)", async () => {
    const s = await fullSeries();
    const target = { targetCampaignId: targets[3]!, comparabilityKey: s.comparabilityKey };
    const ok = await db.estimationRun.create({ data: { ...run(target), results: { create: [estimated(s.id)] } }, include: { results: true } });
    expect(ok.results[0]!.estimateBase!.toString()).toBe("52000");
    // Los intentos rechazados no dejan raíz: pueden reutilizar una campaña objetivo.
    const withResults = (results: object[], data: Record<string, unknown> = {}) =>
      db.estimationRun.create({ data: { ...run({ targetCampaignId: targets[4]!, comparabilityKey: s.comparabilityKey, ...data }), results: { create: results as never } } });
    await expect(withResults([{ ...insufficient(), naiveBase: 1n }])).rejects.toThrow(/EstimationResult_values/);
    await expect(withResults([{ ...insufficient(), fitCriterion: "256" }])).rejects.toThrow(/EstimationResult_values/);
    await expect(withResults([{ ...insufficient(), metrics: { mae: "1" } }])).rejects.toThrow(/EstimationResult_values/);
    await expect(withResults([{ ...insufficient(), reasonCode: "OTRO" }])).rejects.toThrow(/EstimationResult_values/);
    await expect(withResults([estimated(s.id, { estimateBase: null })])).rejects.toThrow(/EstimationResult_values/);
    await expect(withResults([estimated(s.id, { fitCriterion: null })])).rejects.toThrow(/EstimationResult_values/);
    await expect(withResults([estimated(s.id, { spanLastPosition: 2 })])).rejects.toThrow(/EstimationResult_values/);
    await expect(withResults([estimated(s.id, { reasonCode: "SPAN_TOO_SHORT" })])).rejects.toThrow(/EstimationResult_values/);
    await expect(withResults([estimated(s.id)], { outcome: "FAILED", failureCode: "CALCULATION_FAILED" })).rejects.toThrow(/fallida no lleva cifras/);
    await expect(withResults([estimated(s.id)], { comparabilityKey: "OTRA" })).rejects.toThrow(/serie no es la del mismo ámbito/);
    await expect(withResults([{ ...insufficient(), canonicalProductId: f.products.inactiveA }])).rejects.toThrow(/no es canónico/);
    const failed = await withResults(
      [{ ...insufficient(), status: "CALCULATION_FAILED", reasonCode: "CALCULATION_ERROR" }],
      { outcome: "FAILED", failureCode: "CALCULATION_FAILED" },
    );
    expect(failed.outcome).toBe("FAILED");
    // Un resultado no se añade después a una ejecución ya registrada.
    await expect(
      db.estimationResult.create({ data: { runId: ok.id, ...insufficient(), canonicalProductId: f.products.solidA, baseUnit: "G" } }),
    ).rejects.toThrow(/no admite resultados posteriores/);
  });

  it("keeps one chain per target: one root, one successor each, never a later predecessor", async () => {
    const target = { targetCampaignId: targets[7]!, comparabilityKey: "CADENA" };
    const first = await db.estimationRun.create({ data: run(target) });
    await expect(db.estimationRun.create({ data: run(target) })).rejects.toThrow(/Unique constraint failed/);
    const second = await db.estimationRun.create({ data: run({ ...target, previousRunId: first.id }) });
    expect(second.previousRunId).toBe(first.id);
    await expect(db.estimationRun.create({ data: run({ ...target, previousRunId: first.id }) })).rejects.toThrow(/previousRunId/);
    await expect(db.estimationRun.create({ data: run({ targetCampaignId: targets[6]!, previousRunId: second.id }) })).rejects.toThrow(/misma campaña objetivo/);
    await expect(
      db.estimationRun.create({ data: run({ ...target, previousRunId: second.id, generatedAt: new Date(second.generatedAt.getTime() - 60000) }) }),
    ).rejects.toThrow(/es posterior/);
    await expect(db.estimationRun.create({ data: run({ ...target, previousRunId: second.id, requestId: second.requestId }) })).rejects.toThrow(/requestId/);
  });

  it("refuses UPDATE, DELETE and TRUNCATE on series, points, runs and results", async () => {
    const s = await fullSeries();
    const r = await db.estimationRun.create({ data: { ...run({ targetCampaignId: targets[5]!, comparabilityKey: s.comparabilityKey }), results: { create: [estimated(s.id)] } } });
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
});
