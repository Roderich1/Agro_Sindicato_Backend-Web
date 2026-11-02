import { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { afterAll, beforeAll } from "@jest/globals";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { URL } from "node:url";

// @ts-expect-error supertest has no declaration in the baseline test setup.
import request = require("supertest");
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { CollectiveConfig } from "../../collective/application/collective-config";
import { createSession, createSyncV1App, Fixture, seedFixture, TestSession, unusablePasswordHash } from "../../sync-v1/test-support/sync-v1-test-app";
import { BuiltSeries, ConsumptionSeriesUseCase, TargetAssessment } from "../application/consumption-series.use-case";
import { assessSpan } from "../domain/series";
import { estimateSesNaive, ReadySpan, SesNaiveInputError } from "../domain/ses-naive";
import { sealedConsumptionCampaigns } from "../test-support/synthetic-sources";

/**
 * F12-EST-02 and F12-EST-03 (#175, #176): series built from real F07 seals.
 *
 * Only synthetic data. The campaigns of the main season go through the real
 * procedure: Sync v1 publications by farmers, campaign close and the manual
 * seal over the API, so their seals carry the consumption coverage written by
 * the seal (F07 §5.3). Earlier sources are sealed on the base before
 * 20261102020000_f07_seal_consumption_coverage, so their coverage is unknown;
 * a POPULATION_MISMATCH seal can only be inserted directly (the race that
 * produces it cannot be forced). The READY span is fed to the F12-EST-04
 * SES/naive engine; no run, worker or route is involved.
 *
 * With F12_DEMO_OUT set, the built series are written there as JSON (demo).
 */
const postgresUrl = process.env["F12_EST_PG_TEST_URL"];
const describePostgres = postgresUrl ? describe : describe.skip;
const COVERAGE_MIGRATION = "20261102020000_f07_seal_consumption_coverage";
const PUSH = "/api/v1/sync/v1/push";

type Type = "CONSUMPTION_TOTAL" | "DECLARED_NEED";

describePostgres("F12-EST-02/03 consumption series from real F07 seals", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let config: CollectiveConfig;
  let useCase: ConsumptionSeriesUseCase;
  let f: Fixture;
  let director: TestSession;
  let directorUser: string;
  const farmers: Record<string, TestSession> = {};
  const products: Record<string, string> = {};
  const campaigns: Record<string, string> = {};
  const seasons: Record<string, string> = {};
  const heads = new Map<string, string>();
  const demo: Record<string, unknown> = {};

  beforeAll(async () => {
    process.env["COLLECTIVE_DISCLOSURE_MODE"] = "provisional-synthetic";
    process.env["COLLECTIVE_SEALING"] = "enabled";
    const admin = new PrismaClient({ datasources: { db: { url: postgresUrl! } } });
    const name = `f12_series_${randomUUID().replaceAll("-", "")}`;
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    await admin.$disconnect();
    const url = new URL(postgresUrl!);
    url.pathname = `/${name}`;
    const deploy = (keep: (migration: string) => boolean) => {
      const dir = mkdtempSync(join(tmpdir(), "f12-series-"));
      try {
        cpSync(resolve("prisma/schema.prisma"), join(dir, "schema.prisma"));
        cpSync(resolve("prisma/migrations"), join(dir, "migrations"), { recursive: true });
        for (const entry of readdirSync(join(dir, "migrations"))) {
          if (/^\d{14}_/.test(entry) && !keep(entry)) rmSync(join(dir, "migrations", entry), { recursive: true });
        }
        return spawnSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy", "--schema", join(dir, "schema.prisma")], {
          cwd: process.cwd(),
          env: { ...process.env, DATABASE_URL: url.toString() },
          encoding: "utf8",
          timeout: 120000,
        });
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    };
    // 1. The base before the consumption coverage: seals written here keep it unknown.
    expect(deploy((migration) => migration < COVERAGE_MIGRATION).status).toBe(0);
    const early = new PrismaClient({ datasources: { db: { url: url.toString() } } });
    f = await seedFixture(early as unknown as PrismaService);
    directorUser = (await early.member.findUniqueOrThrow({ where: { id: f.members.directorA } })).userId;
    for (const [key, label, unit] of [
      ["Herbicida", "Herbicida serie", "L"],
      ["Fungicida", "Fungicida serie", "L"],
      ["FungicidaGenerico", "Fungicida genérico serie", "L"],
      ["Insecticida", "Insecticida serie", "L"],
      ["InsecticidaB", "Insecticida B serie", "L"],
      ["Abono", "Abono serie", "kg"],
      ["AbonoLiquido", "Abono líquido serie", "L"],
      ["Pieza", "Pieza serie", "unidad"],
    ] as const) {
      products[key] = (await early.product.create({ data: { tenantId: f.tenantA, name: label, unit } })).id;
    }
    const legacy = async (firstYear: number, quantities: bigint[], prefix: string) =>
      sealedConsumptionCampaigns(early, {
        tenantId: f.tenantA, sealedByUserId: directorUser, canonicalProductId: products["Herbicida"]!, baseUnit: "ML",
        firstYear, quantities, namePrefix: prefix,
      });
    const [l1, l2] = await legacy(2015, [50000n, 60000n], "Campaña sellada antes A");
    const legacyOnly = await legacy(2008, [10000n, 11000n, 12000n], "Campaña sellada antes B");
    campaigns["L1"] = l1!.campaignId;
    campaigns["L2"] = l2!.campaignId;
    legacyOnly.forEach((source, i) => (campaigns[`K${i + 1}`] = source.campaignId));
    await early.$disconnect();
    // 2. Every migration, then the application.
    expect(deploy(() => true).status).toBe(0);
    ({ app, prisma, jwt } = await createSyncV1App(url.toString()));
    config = app.get(CollectiveConfig);
    useCase = app.get(ConsumptionSeriesUseCase);
    director = await createSession(prisma, jwt, f.members.directorA);
    for (const key of ["F1", "F2", "F3"]) farmers[key] = await fresh();
  }, 300000);

  afterAll(async () => {
    delete process.env["COLLECTIVE_DISCLOSURE_MODE"];
    delete process.env["COLLECTIVE_SEALING"];
    if (process.env["F12_DEMO_OUT"]) {
      writeFileSync(process.env["F12_DEMO_OUT"], `${JSON.stringify(demo, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2)}\n`, "utf8");
    }
    await app?.close();
  });

  const http = () => request(app.getHttpServer());
  const auth = (session: TestSession) => ({ Authorization: `Bearer ${session.token}` });

  async function fresh(): Promise<TestSession> {
    const userId = randomUUID();
    const memberId = randomUUID();
    await prisma.user.create({
      data: {
        id: userId, tenantId: f.tenantA, name: "Agricultor sintético", email: `f12s-${userId}@example.test`,
        passwordHash: unusablePasswordHash(), role: "AGRICULTOR",
        members: { create: { id: memberId, tenantId: f.tenantA, role: "AGRICULTOR" } },
      },
    });
    return createSession(prisma, jwt, memberId);
  }

  async function push(farmer: string, campaign: string, type: Type, product: string, unit: "ML" | "G", quantity: string | null) {
    const key = `${farmer}|${campaign}|${type}|${product}`;
    const operationId = randomUUID();
    const action = quantity === null ? "CANCEL" : heads.has(key) ? "SUPERSEDE" : "PUBLISH";
    const payload = JSON.stringify({
      contractVersion: 1,
      operationId,
      projectionType: type,
      action,
      causal: { predecessorOperationId: heads.get(key) ?? null, reconciliationReference: null },
      payload: { campaign_ref: campaign, product_ref: products[product], base_unit: unit, ...(quantity === null ? {} : { quantity_base: quantity }) },
    });
    const res = await http().post(PUSH).set("Content-Type", "application/json").set(auth(farmers[farmer]!)).send(payload);
    expect(res.body.outcome).toBe("APPLIED");
    heads.set(key, operationId);
  }

  /** A real campaign: open, published by farmers, closed and sealed over the API. */
  async function sealedCampaign(key: string, year: number, rows: [string, string, "ML" | "G", string][]) {
    campaigns[key] = randomUUID();
    await prisma.agriculturalCampaign.create({
      data: { id: campaigns[key], tenantId: f.tenantA, name: `Campaña sintética ${key}`, status: "ABIERTA", isActive: true, startDate: new Date(`${year}-09-01T00:00:00.000Z`) },
    });
    for (const [farmer, product, unit, quantity] of rows) await push(farmer, campaigns[key], "CONSUMPTION_TOTAL", product, unit, quantity);
    expect((await http().post(`/api/v1/campaigns/${campaigns[key]}/close`).set(auth(director)).send({})).status).toBe(200);
    const state = await http().get(`/api/v1/collective/campaigns/${campaigns[key]}/seal`).set(auth(director));
    expect(state.body.can_seal).toBe(true);
    const sealed = await http()
      .post(`/api/v1/collective/campaigns/${campaigns[key]}/seal`)
      .set(auth(director))
      .send({ confirmed: true, review_ref: state.body.review.review_ref });
    expect(sealed.status).toBe(200);
  }

  async function plannedCampaign(key: string, year: number) {
    campaigns[key] = randomUUID();
    await prisma.agriculturalCampaign.create({
      data: { id: campaigns[key], tenantId: f.tenantA, name: `Objetivo sintético ${key}`, status: "PLANIFICADA", startDate: new Date(`${year}-09-01T00:00:00.000Z`) },
    });
  }

  async function season(key: string) {
    seasons[key] = (
      await prisma.comparabilitySeason.create({
        data: { tenantId: f.tenantA, key, definition: `Temporada sintética ${key}`, durationDays: 180, createdByUserId: directorUser, createdByRole: "DIRECTIVA" },
      })
    ).id;
  }

  async function classify(seasonKey: string, keys: string[]) {
    for (const key of keys) {
      await prisma.campaignSeasonClassification.create({
        data: { tenantId: f.tenantA, campaignId: campaigns[key]!, version: 1, seasonId: seasons[seasonKey]!, classifiedByUserId: directorUser, classifiedByRole: "DIRECTIVA" },
      });
    }
  }

  const three = (product: string, unit: "ML" | "G", a: string, b: string, c: string): [string, string, "ML" | "G", string][] => [
    ["F1", product, unit, a],
    ["F2", product, unit, b],
    ["F3", product, unit, c],
  ];
  const keyOf = (campaignId: string) => Object.entries(campaigns).find(([, id]) => id === campaignId)?.[0] ?? campaignId;
  /** A readable row per position, for assertions and the demo. */
  const table = (built: BuiltSeries) =>
    built.points.map((p) => [
      p.position,
      keyOf(p.campaignId),
      p.kind,
      p.quantityBase === null ? null : p.quantityBase.toString(),
      p.coverage.status === "IDENTIFIED" ? `${p.coverage.membersInPublishedFigures}/${p.coverage.linkedMembers}` : p.coverage.reason,
    ]);
  const expectBuilt = (outcome: Awaited<ReturnType<ConsumptionSeriesUseCase["build"]>>): BuiltSeries => {
    if (!("built" in outcome)) throw new Error(`Series refused: ${outcome.refused}`);
    return outcome.built;
  };
  const expectAssessed = (outcome: TargetAssessment) => {
    if (!("built" in outcome)) throw new Error(`Assessment refused: ${outcome.refused}`);
    return outcome;
  };

  it("builds the main series from real seals: verified zero, gap, hidden, withdrawn, unknown and identified coverage", async () => {
    await season("INVIERNO");
    await sealedCampaign("C1", 2018, three("Herbicida", "ML", "100", "200", "300"));
    await sealedCampaign("C2", 2019, three("Herbicida", "ML", "0", "0", "0"));
    await sealedCampaign("C3", 2020, []);
    await sealedCampaign("C4", 2021, [["F1", "Herbicida", "ML", "100"], ["F2", "Herbicida", "ML", "200"]]);
    await sealedCampaign("C5", 2022, three("Herbicida", "ML", "400", "500", "600"));
    await sealedCampaign("C6", 2023, three("Herbicida", "ML", "100", "100", "100"));
    // After C6 is sealed, F1 cancels its consumption: F07 withdraws the visibility of that sealed figure.
    await push("F1", campaigns["C6"]!, "CONSUMPTION_TOTAL", "Herbicida", "ML", null);
    await sealedCampaign("C7", 2024, three("Herbicida", "ML", "700", "800", "900"));
    await sealedCampaign("C8", 2025, three("Herbicida", "ML", "1000", "1100", "1200"));
    await sealedCampaign("C9", 2026, three("Herbicida", "ML", "200", "300", "400"));
    await plannedCampaign("T", 2027);
    await classify("INVIERNO", ["L1", "L2", "C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "T"]);

    const built = expectBuilt(await useCase.build(f.tenantA, seasons["INVIERNO"]!, products["Herbicida"]!));
    const linked = await prisma.member.count({ where: { tenantId: f.tenantA, role: "AGRICULTOR", isActive: true, user: { isActive: true } } });
    const known = `3/${linked}`;
    expect(table(built)).toEqual([
      [1, "L1", "VERIFIED_CONSUMPTION", "50000", "SEALED_BEFORE_COVERAGE"],
      [2, "L2", "VERIFIED_CONSUMPTION", "60000", "SEALED_BEFORE_COVERAGE"],
      [3, "C1", "VERIFIED_CONSUMPTION", "600", known],
      [4, "C2", "VERIFIED_CONSUMPTION", "0", known],
      [5, "C3", "NO_RECORD", null, `0/${linked}`],
      [6, "C4", "HIDDEN", null, `0/${linked}`],
      [7, "C5", "VERIFIED_CONSUMPTION", "1500", known],
      [8, "C6", "HIDDEN", null, known],
      [9, "C7", "VERIFIED_CONSUMPTION", "2400", known],
      [10, "C8", "VERIFIED_CONSUMPTION", "3300", known],
      [11, "C9", "VERIFIED_CONSUMPTION", "900", known],
      [12, "T", "NO_RECORD", null, "NOT_SEALED"],
    ]);
    expect(built).toMatchObject({ version: 1, reused: false });
    // Stored once, with the exact provenance of every figure and the classification version used.
    const stored = await prisma.consumptionSeries.findUniqueOrThrow({ where: { id: built.seriesId }, include: { points: { orderBy: { position: "asc" } } } });
    expect(stored.sourceHash).toBe(built.sourceHash);
    const c6 = stored.points[7]!;
    const c6Seal = await prisma.collectiveSeal.findFirstOrThrow({ where: { campaignId: campaigns["C6"] }, include: { entries: true } });
    expect(c6).toMatchObject({ kind: "HIDDEN", quantityBase: null, sourceSealId: c6Seal.id, sourceReleaseId: null });
    expect(c6Seal.entries[0]).toMatchObject({ status: "DISCLOSED", visibilityWithdrawnAt: expect.any(Date) });
    const c2 = stored.points[3]!;
    const c2Release = await prisma.collectiveRelease.findUniqueOrThrow({ where: { id: c2.sourceReleaseId! } });
    expect([c2.quantityBase, c2Release.totalBase, c2Release.projectionType]).toEqual([0n, 0n, "CONSUMPTION_TOTAL"]);
    // A rebuild without changes reuses the series.
    expect(expectBuilt(await useCase.build(f.tenantA, seasons["INVIERNO"]!, products["Herbicida"]!))).toMatchObject({ seriesId: built.seriesId, reused: true });

    // F12-EST-03: the final span C7–C9 is ready, with identified coverage; nothing before the gap counts.
    const assessed = expectAssessed(await useCase.assess(f.tenantA, campaigns["T"]!, products["Herbicida"]!));
    expect(assessed.assessment).toMatchObject({ status: "READY", span: { firstPosition: 9, lastPosition: 11, length: 3, values: [2400n, 3300n, 900n] } });
    expect(assessed.assessment.exclusions.map((e) => [keyOf(e.campaignId), e.reason])).toEqual([
      ["L1", "BEFORE_GAP"],
      ["L2", "BEFORE_GAP"],
      ["C1", "BEFORE_GAP"],
      ["C2", "BEFORE_GAP"],
      ["C3", "NO_RECORD"],
      ["C4", "HIDDEN"],
      ["C5", "BEFORE_GAP"],
      ["C6", "HIDDEN"],
      ["T", "NOT_BEFORE_TARGET"],
    ]);
    // A target right after C5 reads C5 as the last relevant campaign, after the C4 gap: too short.
    expect(assessSpanFor(built, "C5")).toMatchObject({ status: "INSUFFICIENT_DATA", reason: "SPAN_TOO_SHORT", span: { length: 1 } });

    // F12-EST-04 on that span, by hand: e3 = 900 − (2400 + 900α) is smallest in absolute value at α = 0,
    // criterion 1500² = 2 250 000; SES = L3 = 2400 mL; naive = 900 mL with criterion (900 − 3300)² = 5 760 000.
    expect(assessed.assessment.status).toBe("READY");
    const estimate = estimateSesNaive(assessed.assessment as ReadySpan);
    expect(estimate).toMatchObject({
      method: "SES_NAIVE",
      methodVersion: "F12-EST-04/1",
      span: { firstPosition: 9, lastPosition: 11, length: 3 },
      alpha: "0.00",
      fitInformative: true,
      fitCriterion: "2250000.000000",
      naiveFitCriterion: "5760000.000000",
      estimateBase: "2400.000000",
      naiveBase: 900n,
    });
    demo["INVIERNO_v1"] = { series: { version: built.version, sourceHash: built.sourceHash }, positions: table(built), assessment: assessed.assessment, estimate };
  });

  it("gives no figures when the span comes from seals without consumption coverage or with a population mismatch", async () => {
    await season("LEGADO");
    await plannedCampaign("TK", 2011);
    await classify("LEGADO", ["K1", "K2", "K3", "TK"]);
    const legacy = expectAssessed(await useCase.assess(f.tenantA, campaigns["TK"]!, products["Herbicida"]!));
    expect(table(legacy.built).slice(0, 3)).toEqual([
      [1, "K1", "VERIFIED_CONSUMPTION", "10000", "SEALED_BEFORE_COVERAGE"],
      [2, "K2", "VERIFIED_CONSUMPTION", "11000", "SEALED_BEFORE_COVERAGE"],
      [3, "K3", "VERIFIED_CONSUMPTION", "12000", "SEALED_BEFORE_COVERAGE"],
    ]);
    expect(legacy.assessment).toMatchObject({ status: "INCOMPATIBLE_DATA", reason: "COVERAGE_UNKNOWN", span: { length: 3 } });
    expect("values" in (legacy.assessment.span ?? {})).toBe(false);
    expect(() => estimateSesNaive(legacy.assessment as ReadySpan)).toThrow(SesNaiveInputError);

    await season("DESAJUSTE");
    const sources = [
      ...(await sealedConsumptionCampaigns(prisma as unknown as PrismaClient, {
        tenantId: f.tenantA, sealedByUserId: directorUser, canonicalProductId: products["Herbicida"]!, baseUnit: "ML",
        firstYear: 2030, quantities: [5000n, 6000n], namePrefix: "Campaña sintética cubierta", coverage: { status: "IDENTIFIED", membersInPublishedFigures: 3 },
      })),
      ...(await sealedConsumptionCampaigns(prisma as unknown as PrismaClient, {
        tenantId: f.tenantA, sealedByUserId: directorUser, canonicalProductId: products["Herbicida"]!, baseUnit: "ML",
        firstYear: 2032, quantities: [7000n], namePrefix: "Campaña sintética desajustada", coverage: { status: "POPULATION_MISMATCH" },
      })),
    ];
    sources.forEach((source, i) => (campaigns[`M${i + 1}`] = source.campaignId));
    await plannedCampaign("TM", 2033);
    await classify("DESAJUSTE", ["M1", "M2", "M3", "TM"]);
    const mismatch = expectAssessed(await useCase.assess(f.tenantA, campaigns["TM"]!, products["Herbicida"]!));
    expect(table(mismatch.built).map((row) => row[4])).toEqual(["3/5", "3/5", "POPULATION_MISMATCH", "NOT_SEALED"]);
    expect(mismatch.assessment).toMatchObject({ status: "INCOMPATIBLE_DATA", reason: "COVERAGE_UNKNOWN" });
    demo["LEGADO"] = { positions: table(legacy.built), assessment: legacy.assessment };
    demo["DESAJUSTE"] = { positions: table(mismatch.built), assessment: mismatch.assessment };
  });

  it("builds a new version after a classification correction and keeps the earlier one with the version it used", async () => {
    const before = await prisma.consumptionSeries.findFirstOrThrow({
      where: { seasonId: seasons["INVIERNO"], canonicalProductId: products["Herbicida"] },
      orderBy: { version: "desc" },
      include: { points: { orderBy: { position: "asc" } } },
    });
    const v1 = await prisma.campaignSeasonClassification.findFirstOrThrow({ where: { campaignId: campaigns["C9"] } });
    await season("VERANO");
    const v2 = await prisma.campaignSeasonClassification.create({
      data: {
        tenantId: f.tenantA, campaignId: campaigns["C9"]!, version: 2, previousClassificationId: v1.id, seasonId: seasons["VERANO"]!,
        reason: "La campaña 2026 se sembró en verano", classifiedByUserId: directorUser, classifiedByRole: "DIRECTIVA",
      },
    });
    const rebuilt = expectBuilt(await useCase.build(f.tenantA, seasons["INVIERNO"]!, products["Herbicida"]!));
    expect(rebuilt).toMatchObject({ version: before.version + 1, reused: false });
    expect(table(rebuilt).map((row) => row[1])).not.toContain("C9");
    const stored = await prisma.consumptionSeries.findUniqueOrThrow({ where: { id: rebuilt.seriesId } });
    expect(stored.previousSeriesId).toBe(before.id);
    // The earlier version is unchanged: same points, still citing classification version 1 of C9.
    const kept = await prisma.consumptionSeries.findUniqueOrThrow({ where: { id: before.id }, include: { points: { orderBy: { position: "asc" } } } });
    expect(kept.points).toEqual(before.points);
    expect(kept.points.find((p) => p.campaignId === campaigns["C9"])!.classificationId).toBe(v1.id);
    // Now the span ends at C8: C7–C8 is too short, without figures.
    const assessed = expectAssessed(await useCase.assess(f.tenantA, campaigns["T"]!, products["Herbicida"]!));
    expect(assessed.assessment).toMatchObject({ status: "INSUFFICIENT_DATA", reason: "SPAN_TOO_SHORT", span: { length: 2 } });
    expect(() => estimateSesNaive(assessed.assessment as ReadySpan)).toThrow(SesNaiveInputError);
    // In its new season, C9 cites the new version.
    const summer = expectBuilt(await useCase.build(f.tenantA, seasons["VERANO"]!, products["Herbicida"]!));
    expect(summer.points.map((p) => [keyOf(p.campaignId), p.classificationId])).toEqual([["C9", v2.id]]);
    demo["INVIERNO_v2"] = { series: { version: rebuilt.version, previous: before.id }, positions: table(rebuilt), assessment: assessed.assessment };
  });

  it("joins two denominations associated before the seal, and refuses incompatible units, later re-keying, other tenants and pending policy", async () => {
    // Associated before publishing: F07 consolidates both into one sealed figure.
    await prisma.productCanonicalAssociation.create({
      data: { tenantId: f.tenantA, productId: products["FungicidaGenerico"]!, canonicalProductId: products["Fungicida"]!, actorUserId: directorUser, reason: "Misma sustancia" },
    });
    await season("MEZCLA");
    await sealedCampaign("D1", 2018, [
      ["F1", "Fungicida", "ML", "100"],
      ["F2", "FungicidaGenerico", "ML", "200"],
      ["F3", "FungicidaGenerico", "ML", "300"],
      ...three("Insecticida", "ML", "10", "20", "30"),
      ...three("InsecticidaB", "ML", "40", "50", "60"),
      ...three("Abono", "G", "1000", "2000", "3000"),
      ...three("AbonoLiquido", "ML", "70", "80", "90"),
    ]);
    await plannedCampaign("TD", 2019);
    await classify("MEZCLA", ["D1", "TD"]);
    const fungicide = expectBuilt(await useCase.build(f.tenantA, seasons["MEZCLA"]!, products["Fungicida"]!));
    expect(table(fungicide)[0]).toEqual([1, "D1", "VERIFIED_CONSUMPTION", "600", expect.stringMatching(/^\d+\/\d+$/)]);
    expect(fungicide.scope.associations.map((a) => a.productId)).toEqual([products["FungicidaGenerico"]]);
    expect(await useCase.build(f.tenantA, seasons["MEZCLA"]!, products["FungicidaGenerico"]!)).toEqual({ refused: "PRODUCT_NOT_ESTIMABLE" });

    // Associated after the seal: the sealed figures stay apart and are not added up.
    const associate = (productId: string, canonicalProductId: string) =>
      prisma.productCanonicalAssociation.create({ data: { tenantId: f.tenantA, productId, canonicalProductId, actorUserId: directorUser, reason: "Asociación posterior al sellado" } });
    await associate(products["InsecticidaB"]!, products["Insecticida"]!);
    await associate(products["AbonoLiquido"]!, products["Abono"]!);
    expect(await useCase.build(f.tenantA, seasons["MEZCLA"]!, products["Insecticida"]!)).toEqual({ refused: "CANONICAL_CHANGED_AFTER_SEAL", campaignId: campaigns["D1"] });
    expect(await useCase.build(f.tenantA, seasons["MEZCLA"]!, products["Abono"]!)).toEqual({ refused: "MIXED_UNITS", campaignId: campaigns["D1"] });
    expect(await useCase.assess(f.tenantA, campaigns["TD"]!, products["Abono"]!)).toMatchObject({ refused: "MIXED_UNITS", result: { status: "INCOMPATIBLE_DATA", reason: "MIXED_UNITS" } });
    expect(await useCase.assess(f.tenantA, campaigns["TD"]!, products["Insecticida"]!)).toMatchObject({
      refused: "CANONICAL_CHANGED_AFTER_SEAL",
      result: { status: "INCOMPATIBLE_DATA", reason: "NO_COMPARABLE_CAMPAIGNS" },
    });
    expect(await useCase.build(f.tenantA, seasons["MEZCLA"]!, products["Pieza"]!)).toEqual({ refused: "PRODUCT_NOT_ESTIMABLE" });

    // Another tenant: its product, season and campaign are not found from tenant A.
    const directorB = randomUUID();
    await prisma.user.create({
      data: {
        id: directorB, tenantId: f.tenantB, name: "Directiva B", email: `f12s-b-${directorB}@example.test`, passwordHash: unusablePasswordHash(), role: "DIRECTIVA",
        members: { create: { tenantId: f.tenantB, role: "DIRECTIVA" } },
      },
    });
    const seasonB = await prisma.comparabilitySeason.create({
      data: { tenantId: f.tenantB, key: "INVIERNO", definition: "Temporada sintética B", durationDays: 180, createdByUserId: directorB, createdByRole: "DIRECTIVA" },
    });
    expect(await useCase.build(f.tenantA, seasonB.id, products["Herbicida"]!)).toEqual({ refused: "SEASON_NOT_FOUND" });
    expect(await useCase.build(f.tenantA, seasons["INVIERNO"]!, f.products.liquidB)).toEqual({ refused: "PRODUCT_NOT_FOUND" });
    expect(await useCase.assess(f.tenantA, f.campaigns.openB, products["Herbicida"]!)).toMatchObject({ refused: "TARGET_CAMPAIGN_NOT_FOUND" });
    expect(await useCase.build(f.tenantB, seasons["INVIERNO"]!, products["Herbicida"]!)).toEqual({ refused: "SEASON_NOT_FOUND" });

    // No disclosure policy in force: nothing is built.
    const mutable = config as unknown as { mode: string };
    mutable.mode = "POLICY_PENDING";
    try {
      const count = await prisma.consumptionSeries.count();
      expect(await useCase.build(f.tenantA, seasons["INVIERNO"]!, products["Herbicida"]!)).toEqual({ refused: "POLICY_PENDING" });
      expect(await prisma.consumptionSeries.count()).toBe(count);
    } finally {
      mutable.mode = "PROVISIONAL_SYNTHETIC";
    }
    demo["MEZCLA"] = { fungicide: table(fungicide) };
  });

  /** The span of a built series for a target that starts right after the given campaign. */
  function assessSpanFor(built: BuiltSeries, lastKey: string) {
    const last = built.points.find((p) => p.campaignId === campaigns[lastKey])!;
    const startDate = new Date(last.startDate.getTime() + 24 * 3600 * 1000);
    return assessSpan(built.points, { campaignId: "virtual-target", startDate });
  }
});
