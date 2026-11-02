import { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { afterAll, beforeAll } from "@jest/globals";
import { randomUUID } from "node:crypto";
// @ts-expect-error supertest has no declaration in the baseline test setup.
import request = require("supertest");
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { createIsolatedDatabase, createSession, createSyncV1App, Fixture, seedFixture, TestSession, unusablePasswordHash } from "../../sync-v1/test-support/sync-v1-test-app";
import { shapeErrors } from "../test-support/openapi-shape";

/**
 * Contract §4.1 (EST-D-02): seasons and the first classification of a
 * campaign, over HTTP against PostgreSQL. Only synthetic data. Every body is
 * checked against its schema of the INT-09 specification. The estimation
 * worker does not run (ESTIMATION_WORKER=disabled): nothing is calculated.
 */
const postgresUrl = process.env["F12_EST_PG_TEST_URL"];
const describePostgres = postgresUrl ? describe : describe.skip;

interface Answer {
  status: number;
  body: { message: string; [key: string]: unknown };
}

describePostgres("F12 seasons and first classifications (EST-D-02)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let f: Fixture;
  let director: TestSession;
  let admin: TestSession;
  let farmer: TestSession;
  let otherDirector: TestSession;
  const campaigns: Record<string, string> = {};
  const seasons: Record<string, string> = {};

  beforeAll(async () => {
    process.env["ESTIMATION_WORKER"] = "disabled";
    process.env["COLLECTIVE_DISCLOSURE_MODE"] = "provisional-synthetic";
    const url = await createIsolatedDatabase(postgresUrl!, "f12_seasons");
    ({ app, prisma, jwt } = await createSyncV1App(url));
    f = await seedFixture(prisma);
    director = await createSession(prisma, jwt, f.members.directorA);
    admin = await createSession(prisma, jwt, f.members.adminA);
    farmer = await createSession(prisma, jwt, f.members.farmerA);
    const userId = randomUUID();
    const memberId = randomUUID();
    await prisma.user.create({
      data: {
        id: userId, tenantId: f.tenantB, name: "Directiva sintética B", email: `f12t-${userId}@example.test`, passwordHash: unusablePasswordHash(), role: "DIRECTIVA",
        members: { create: { id: memberId, tenantId: f.tenantB, role: "DIRECTIVA" } },
      },
    });
    otherDirector = await createSession(prisma, jwt, memberId);
    for (const [key, year] of [["P1", 2030], ["P2", 2031], ["P3", 2032]] as const) {
      campaigns[key] = (
        await prisma.agriculturalCampaign.create({ data: { tenantId: f.tenantA, name: `Campaña sintética ${key}`, status: "PLANIFICADA", startDate: new Date(`${year}-09-01T00:00:00.000Z`) } })
      ).id;
    }
  }, 300000);

  afterAll(async () => {
    delete process.env["ESTIMATION_WORKER"];
    delete process.env["COLLECTIVE_DISCLOSURE_MODE"];
    await app?.close();
  });

  const http = () => request(app.getHttpServer());
  const auth = (session: TestSession) => ({ Authorization: `Bearer ${session.token}` });
  const shaped = (schema: string, body: unknown) => expect(shapeErrors(schema, body)).toEqual([]);
  const post = (session: TestSession, path: string, body: Record<string, unknown>): Promise<Answer> =>
    http().post(`/api/v1/estimation/${path}`).set(auth(session)).send({ contract_version: 1, ...body });
  const get = (session: TestSession, path: string): Promise<Answer> => http().get(`/api/v1/estimation/${path}`).set(auth(session));

  it("registers a season once, with its key, definition and duration, and only for the Directiva or the Administrador", async () => {
    const body = { key: "INVIERNO", definition: "Siembra de mayo a octubre", duration_days: 180 };
    expect((await http().post("/api/v1/estimation/seasons").send({ contract_version: 1, ...body })).status).toBe(401);
    const forbidden = await post(farmer, "seasons", body);
    expect([forbidden.status, forbidden.body.message]).toEqual([403, "No tienes permisos para esta acción"]);
    for (const invalid of [
      { ...body, key: " INVIERNO" },
      { ...body, key: "INVIERNO " },
      { ...body, key: "" },
      { ...body, key: "K".repeat(65) },
      { ...body, definition: "   " },
      { ...body, definition: "D".repeat(501) },
      { ...body, duration_days: 0 },
      { ...body, duration_days: 1.5 },
      { ...body, duration_days: "180" },
      { ...body, tenant_id: f.tenantA },
      { ...body, contract_version: 2 },
    ]) {
      const res = await post(director, "seasons", invalid);
      expect([JSON.stringify(invalid).slice(0, 60), res.status]).toEqual([JSON.stringify(invalid).slice(0, 60), 400]);
      shaped("Error", res.body);
    }
    expect(await prisma.comparabilitySeason.count()).toBe(0);

    const created = await post(director, "seasons", body);
    expect(created.status).toBe(201);
    shaped("Season", created.body);
    expect(created.body).toMatchObject({ season: { key: "INVIERNO", definition: body.definition, duration_days: 180 }, scope: { tenant_ref: f.tenantA }, created_by_role: "DIRECTIVA" });
    seasons["INVIERNO"] = (created.body["season"] as { season_ref: string }).season_ref;
    const taken = await post(admin, "seasons", { ...body, definition: "Otra definición con la misma clave" });
    expect([taken.status, taken.body.message]).toEqual([409, "SEASON_KEY_TAKEN"]);
    // Another tenant may use the same key: keys are unique per tenant.
    expect((await post(otherDirector, "seasons", body)).status).toBe(201);
    // Two registrations of a new key at once: one wins.
    const race = await Promise.all(["Primera", "Segunda"].map((definition) => post(director, "seasons", { key: "VERANO", definition, duration_days: 120 })));
    expect(race.map((r) => r.status).sort()).toEqual([201, 409]);
    seasons["VERANO"] = (race.find((r) => r.status === 201)!.body["season"] as { season_ref: string }).season_ref;
    const byAdmin = await post(admin, "seasons", { key: "OTOÑO", definition: "Ciclo corto", duration_days: 90 });
    expect([byAdmin.status, byAdmin.body["created_by_role"]]).toEqual([201, "ADMINISTRADOR"]);
    seasons["OTOÑO"] = (byAdmin.body["season"] as { season_ref: string }).season_ref;

    const list = await get(director, "seasons");
    shaped("SeasonList", list.body);
    expect((list.body["items"] as { season: { key: string } }[]).map((s) => s.season.key)).toEqual(["INVIERNO", "VERANO", "OTOÑO"]);
    expect(((await get(otherDirector, "seasons")).body["items"] as unknown[]).length).toBe(1);
    expect((await get(farmer, "seasons")).status).toBe(403);
  });

  it("classifies a campaign once (version 1) and lists the current classification of each classified campaign", async () => {
    const classify = (session: TestSession, campaign: string, season: string) => post(session, "campaign-classifications", { campaign_ref: campaign, season_ref: season });
    expect((await classify(farmer, campaigns["P1"]!, seasons["INVIERNO"]!)).status).toBe(403);
    for (const [campaign, season, status, message] of [
      [randomUUID(), seasons["INVIERNO"]!, 404, "CAMPAIGN_NOT_FOUND"],
      [f.campaigns.openB, seasons["INVIERNO"]!, 404, "CAMPAIGN_NOT_FOUND"],
      [campaigns["P1"]!, randomUUID(), 404, "SEASON_NOT_FOUND"],
    ] as const) {
      const res = await classify(director, campaign, season);
      expect([res.status, res.body.message]).toEqual([status, message]);
      shaped("Error", res.body);
    }
    const otherSeason = (await get(otherDirector, "seasons")).body["items"] as { season: { season_ref: string } }[];
    expect((await classify(director, campaigns["P1"]!, otherSeason[0]!.season.season_ref)).body.message).toBe("SEASON_NOT_FOUND");
    expect((await post(director, "campaign-classifications", { campaign_ref: "no-es-uuid", season_ref: seasons["INVIERNO"] })).status).toBe(400);
    expect(await prisma.campaignSeasonClassification.count()).toBe(0);

    const first = await classify(director, campaigns["P1"]!, seasons["INVIERNO"]!);
    expect(first.status).toBe(201);
    shaped("Classification", first.body);
    expect(first.body).toMatchObject({ version: 1, previous_classification_ref: null, reason: null, current: true, season: { key: "INVIERNO" }, campaign: { campaign_ref: campaigns["P1"] } });
    const again = await classify(admin, campaigns["P1"]!, seasons["VERANO"]!);
    expect([again.status, again.body.message]).toEqual([409, "CAMPAIGN_ALREADY_CLASSIFIED"]);
    const race = await Promise.all([seasons["INVIERNO"]!, seasons["VERANO"]!].map((season) => classify(director, campaigns["P2"]!, season)));
    expect(race.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await prisma.campaignSeasonClassification.count({ where: { campaignId: campaigns["P2"] } })).toBe(1);
    // Which of the two won is not fixed: the list follows the winner.
    const p2Season = (race.find((r) => r.status === 201)!.body["season"] as { key: string }).key;
    expect((await classify(admin, campaigns["P3"]!, seasons["VERANO"]!)).status).toBe(201);

    // Corrected to no season: the campaign drops out of the list; its first version stays in its history.
    const correction = await post(director, `campaign-classifications/${campaigns["P3"]}/corrections`, {
      previous_classification_ref: (await prisma.campaignSeasonClassification.findFirstOrThrow({ where: { campaignId: campaigns["P3"] } })).id,
      season_ref: null,
      reason: "La campaña no es comparable con ninguna temporada",
    });
    expect(correction.status).toBe(201);
    expect((await classify(director, campaigns["P3"]!, seasons["INVIERNO"]!)).body.message).toBe("CAMPAIGN_ALREADY_CLASSIFIED");

    const all = await get(director, "campaign-classifications");
    shaped("ClassificationList", all.body);
    const listed = (all.body["items"] as { campaign: { campaign_ref: string }; current: boolean; version: number }[]).map((k) => [k.campaign.campaign_ref, k.version, k.current]);
    expect(listed).toEqual([
      [campaigns["P1"], 1, true],
      [campaigns["P2"], 1, true],
    ]);
    const winter = await get(director, `campaign-classifications?season_ref=${seasons["INVIERNO"]}`);
    expect((winter.body["items"] as { campaign: { campaign_ref: string } }[]).map((k) => k.campaign.campaign_ref)).toEqual(
      p2Season === "INVIERNO" ? [campaigns["P1"], campaigns["P2"]] : [campaigns["P1"]],
    );
    const autumn = await get(director, `campaign-classifications?season_ref=${seasons["OTOÑO"]}`);
    expect([autumn.status, autumn.body["items"]]).toEqual([200, []]);
    expect((await get(director, `campaign-classifications?season_ref=${randomUUID()}`)).body.message).toBe("SEASON_NOT_FOUND");
    expect((await get(director, "campaign-classifications?season_ref=no-es-uuid")).status).toBe(400);
    expect((await get(otherDirector, "campaign-classifications")).body["items"]).toEqual([]);
    expect((await get(farmer, "campaign-classifications")).status).toBe(403);
  });

  it("lets a job be requested for a campaign classified over HTTP, and nothing else is written", async () => {
    const before = await prisma.estimationJob.count();
    const unclassified = await post(director, "jobs", { request_id: randomUUID(), target_campaign_ref: campaigns["P3"] });
    expect([unclassified.status, unclassified.body.message]).toEqual([422, "TARGET_CAMPAIGN_NOT_CLASSIFIED"]);
    const queued = await post(director, "jobs", { request_id: randomUUID(), target_campaign_ref: campaigns["P1"] });
    expect([queued.status, queued.body["status"]]).toEqual([202, "QUEUED"]);
    expect(await prisma.estimationJob.count()).toBe(before + 1);
    // Seasons and classifications are never modified nor deleted.
    await expect(prisma.comparabilitySeason.update({ where: { id: seasons["INVIERNO"]! }, data: { durationDays: 1 } })).rejects.toThrow(/inmutable/);
    await expect(prisma.campaignSeasonClassification.deleteMany({ where: { campaignId: campaigns["P1"] } })).rejects.toThrow(/inmutable/);
  });
});
