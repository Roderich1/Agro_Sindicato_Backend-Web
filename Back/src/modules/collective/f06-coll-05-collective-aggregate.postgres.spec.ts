import { INestApplication, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { afterAll, beforeAll } from "@jest/globals";
import { randomUUID } from "node:crypto";
// @ts-expect-error supertest has no declaration in the baseline test setup.
import request = require("supertest");
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import {
  createIsolatedDatabase,
  createSession,
  createSyncV1App,
  Fixture,
  seedFixture,
  TestSession,
  unusablePasswordHash,
} from "../sync-v1/test-support/sync-v1-test-app";
import { CollectiveConfig } from "./application/collective-config";

/**
 * F06-COLL-05 (#21): consolidation over real Sync v1 contributions (created
 * through POST /sync/v1/push) and the provisional disclosure policy
 * F07-POL-01 (#107, NOT approved: k = 3, synthetic data only).
 */
const postgresUrl = process.env["F06_COLL_05_PG_TEST_URL"];
const describePostgres = postgresUrl ? describe : describe.skip;

const PUSH = "/api/v1/sync/v1/push";
const ASSOCIATIONS = "/api/v1/collective/product-associations";
/** Sentinel quantity: it must never appear in logs. */
const SENTINEL = "987654321";

interface Res {
  status: number;
  body: any;
  text: string;
  headers: Record<string, string>;
}

type Type = "CONSUMPTION_TOTAL" | "DECLARED_NEED";

describePostgres("F06-COLL-05 collective aggregate on PostgreSQL", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let f: Fixture;
  let farmers: TestSession[];
  let director: TestSession;
  let admin: TestSession;
  let otherTenantDirector: TestSession;
  const logged: string[] = [];

  beforeAll(async () => {
    process.env["COLLECTIVE_DISCLOSURE_MODE"] = "provisional-synthetic";
    const databaseUrl = await createIsolatedDatabase(postgresUrl!, "f06_coll_05");
    ({ app, prisma, jwt } = await createSyncV1App(databaseUrl));
    f = await seedFixture(prisma);
    farmers = [
      await createSession(prisma, jwt, f.members.farmerA),
      await createSession(prisma, jwt, f.members.farmerA2),
      await fresh("AGRICULTOR"),
      await fresh("AGRICULTOR"),
      await fresh("AGRICULTOR"),
    ];
    director = await createSession(prisma, jwt, f.members.directorA);
    admin = await createSession(prisma, jwt, f.members.adminA);
    otherTenantDirector = await fresh("DIRECTIVA", f.tenantB);
    for (const level of ["log", "warn", "error"] as const) {
      jest.spyOn(Logger.prototype, level).mockImplementation((...args: unknown[]) => {
        logged.push(args.map(String).join(" "));
      });
    }
  }, 180000);

  afterAll(async () => {
    jest.restoreAllMocks();
    delete process.env["COLLECTIVE_DISCLOSURE_MODE"];
    await app?.close();
  });

  const http = () => request(app.getHttpServer());

  async function fresh(role: "AGRICULTOR" | "DIRECTIVA", tenantId = f.tenantA): Promise<TestSession> {
    const userId = randomUUID();
    const memberId = randomUUID();
    await prisma.user.create({
      data: {
        id: userId, tenantId, name: "Usuario sintético", email: `f06-${userId}@example.test`,
        passwordHash: unusablePasswordHash(), role,
        members: { create: { id: memberId, tenantId, role } },
      },
    });
    return createSession(prisma, jwt, memberId);
  }

  async function product(name: string, unit = "L"): Promise<string> {
    const created = await prisma.product.create({
      data: { tenantId: f.tenantA, name: `${name} ${randomUUID().slice(0, 8)}`, unit },
    });
    return created.id;
  }

  /** Pushes one intention and returns its operationId (APPLIED expected unless said). */
  async function push(
    session: TestSession,
    e: { product: string; quantity?: string; action?: "PUBLISH" | "SUPERSEDE" | "CANCEL"; pred?: string; type?: Type; unit?: "ML" | "G" },
    expected = "APPLIED",
  ): Promise<string> {
    const operationId = randomUUID();
    const action = e.action ?? "PUBLISH";
    const res: Res = await http()
      .post(PUSH)
      .set("Content-Type", "application/json")
      .set("Authorization", `Bearer ${session.token}`)
      .send(JSON.stringify({
        contractVersion: 1,
        operationId,
        projectionType: e.type ?? "DECLARED_NEED",
        action,
        causal: { predecessorOperationId: e.pred ?? null, reconciliationReference: null },
        payload: {
          campaign_ref: f.campaigns.openA,
          product_ref: e.product,
          base_unit: e.unit ?? "ML",
          ...(action === "CANCEL" ? {} : { quantity_base: e.quantity ?? "1000" }),
        },
      }));
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe(expected);
    return operationId;
  }

  async function summary(session: TestSession = director, campaign = f.campaigns.openA): Promise<Res> {
    return http()
      .get(`/api/v1/collective/campaigns/${campaign}/summary`)
      .set("Authorization", `Bearer ${session.token}`);
  }

  function cellOf(res: Res, productId: string, type: Type = "DECLARED_NEED") {
    return (res.body.cells as any[]).find((cell) => cell.product_ref === productId && cell.projection_type === type);
  }

  it("without an approved policy there are no figures in any channel", async () => {
    const config = app.get(CollectiveConfig) as { mode: string };
    config.mode = "POLICY_PENDING";
    try {
      const p = await product("Sin política");
      for (const farmer of farmers.slice(0, 3)) await push(farmer, { product: p, quantity: "5000" });
      const json = await summary();
      expect(json.status).toBe(200);
      expect(json.body.disclosure).toEqual({ mode: "POLICY_PENDING", policy: "F07-POL-01", approved: false, threshold: null });
      expect(json.body.coverage).toBeNull();
      expect(json.body.cells).toEqual([]);
      const csv: Res = await http()
        .get(`/api/v1/collective/campaigns/${f.campaigns.openA}/summary.csv`)
        .set("Authorization", `Bearer ${director.token}`);
      expect(csv.status).toBe(200);
      expect(csv.text).toContain("POLICY_PENDING");
      expect(csv.text).not.toContain("15000");
      expect(await prisma.collectiveRelease.count()).toBe(0);
    } finally {
      config.mode = "PROVISIONAL_SYNTHETIC";
    }
  });

  it("threshold, explicit zero, absence and coverage", async () => {
    const need = await product("Umbral");
    const zero = await product("Cero", "kg");
    const absent = await product("Ausente");
    await push(farmers[0]!, { product: need, quantity: "12500" });
    await push(farmers[1]!, { product: need, quantity: "7500" });
    let res = await summary();
    expect(cellOf(res, need)).toMatchObject({ status: "SUPPRESSED_UNDER_THRESHOLD", total_base: null, contributors: null });
    await push(farmers[2]!, { product: need, quantity: "1" });
    for (const farmer of farmers.slice(0, 3)) {
      await push(farmer, { product: zero, quantity: "0", unit: "G", type: "CONSUMPTION_TOTAL" });
    }
    res = await summary();
    expect(cellOf(res, need)).toMatchObject({
      status: "DISCLOSED", total_base: "20001", total_presentation: "20.001", contributors: 3, presentation_unit: "L",
    });
    expect(cellOf(res, zero, "CONSUMPTION_TOTAL")).toMatchObject({
      status: "DISCLOSED", total_base: "0", contributors: 3, base_unit: "G", presentation_unit: "KG",
    });
    // No contribution: no row at all (unknown), never a zero.
    expect((res.body.cells as any[]).some((cell) => cell.product_ref === absent)).toBe(false);
    expect(res.body.coverage.linked_members).toBe(5);
    expect(res.body.coverage.members_with_contribution).toBeGreaterThanOrEqual(3);
  });

  it("two answers never differ by a single Member's contribution", async () => {
    const p = await product("Diferencia");
    const heads: string[] = [];
    for (const [i, farmer] of farmers.slice(0, 3).entries()) {
      heads.push(await push(farmer, { product: p, quantity: String(1000 * (i + 1)) }));
    }
    expect(cellOf(await summary(), p)).toMatchObject({ status: "DISCLOSED", total_base: "6000", pending_changes: false });
    // One Member replaces its value: the answer stays 6000, flagged pending.
    heads[0] = await push(farmers[0]!, { product: p, quantity: "4000", action: "SUPERSEDE", pred: heads[0] });
    expect(cellOf(await summary(), p)).toMatchObject({ status: "DISCLOSED", total_base: "6000", pending_changes: true });
    // A new Member joins: still not enough to isolate anybody.
    await push(farmers[3]!, { product: p, quantity: SENTINEL });
    expect(cellOf(await summary(), p)).toMatchObject({ total_base: "6000", contributors: 3, pending_changes: true });
    // A third Member changes: three distinct Members since the last figure.
    await push(farmers[1]!, { product: p, quantity: "2500", action: "SUPERSEDE", pred: heads[1] });
    const released = cellOf(await summary(), p);
    expect(released).toMatchObject({ status: "DISCLOSED", contributors: 4, pending_changes: false });
    expect(released.total_base).toBe((4000n + 2500n + 3000n + BigInt(SENTINEL)).toString());
    expect(logged.join("\n")).not.toContain(SENTINEL);
  });

  it("cancellation, dispute and membership change withdraw the figure", async () => {
    const p = await product("Retirada");
    const heads: string[] = [];
    for (const farmer of farmers) heads.push(await push(farmer, { product: p, quantity: "2000" }));
    expect(cellOf(await summary(), p)).toMatchObject({ status: "DISCLOSED", total_base: "10000", contributors: 5 });
    // CANCEL: the contribution no longer counts and the old figure is withdrawn.
    await push(farmers[4]!, { product: p, action: "CANCEL", pred: heads[4] });
    expect(cellOf(await summary(), p)).toMatchObject({ status: "SUPPRESSED_REVISION", total_base: null });
    const withdrawn = await prisma.collectiveRelease.findFirst({
      where: { canonicalProductId: p }, orderBy: { releasedAt: "asc" },
    });
    expect(withdrawn?.withdrawnAt).not.toBeNull();
    // A fork leaves farmer 3's contribution CONTESTED: excluded.
    const second = await createSession(prisma, jwt, farmers[3]!.memberId);
    await push(farmers[3]!, { product: p, quantity: "2100", action: "SUPERSEDE", pred: heads[3] });
    await push(second, { product: p, quantity: "2200", action: "SUPERSEDE", pred: heads[3] }, "CONFLICT");
    const contested = await prisma.syncV1Contribution.findFirstOrThrow({
      where: { memberId: farmers[3]!.memberId, productId: p },
    });
    expect(contested.status).toBe("CONTESTED");
    // Membership change: farmer 2 becomes inactive.
    await prisma.member.update({ where: { id: farmers[2]!.memberId }, data: { isActive: false } });
    try {
      const res = await summary();
      // Only farmers 0 and 1 remain eligible: under the threshold.
      expect(cellOf(res, p)).toMatchObject({ status: "SUPPRESSED_UNDER_THRESHOLD", total_base: null });
      expect(res.body.coverage.linked_members).toBe(4);
    } finally {
      await prisma.member.update({ where: { id: farmers[2]!.memberId }, data: { isActive: true } });
    }
  });

  it("aliases: confirmed association, distinct Members, no unit mixing and history", async () => {
    const belator = await product("Belator");
    const bellator = await product("Bellator");
    const solid = await product("Belator polvo", "kg");
    const [f0, f1, f2] = farmers;
    await push(f0!, { product: belator, quantity: "1000" });
    await push(f0!, { product: bellator, quantity: "2000" });
    await push(f1!, { product: belator, quantity: "3000" });
    // Without confirmation nothing changes.
    let res: Res = await http().post(ASSOCIATIONS).set("Authorization", `Bearer ${director.token}`)
      .send({ productId: bellator, canonicalProductId: belator, reason: "misma fórmula", confirmed: false });
    expect(res.status).toBe(422);
    expect(await prisma.productCanonicalAssociation.count({ where: { productId: bellator } })).toBe(0);
    // L and KG never join a group.
    res = await http().post(ASSOCIATIONS).set("Authorization", `Bearer ${director.token}`)
      .send({ productId: solid, canonicalProductId: belator, reason: "x", confirmed: true });
    expect(res.status).toBe(422);
    expect(res.body.message).toBe("UNIT_DIMENSION_MISMATCH");
    // Confirmed association.
    res = await http().post(ASSOCIATIONS).set("Authorization", `Bearer ${director.token}`)
      .send({ productId: bellator, canonicalProductId: belator, reason: "misma fórmula", confirmed: true });
    expect(res.status).toBe(200);
    expect(res.body.changed).toBe(true);
    // f0 has two aliases: it is one contributor, so two Members < 3.
    expect(cellOf(await summary(), belator)).toMatchObject({ status: "SUPPRESSED_UNDER_THRESHOLD" });
    expect(cellOf(await summary(), bellator)).toBeUndefined();
    await push(f2!, { product: bellator, quantity: "4000" });
    expect(cellOf(await summary(), belator)).toMatchObject({
      status: "DISCLOSED", total_base: "10000", contributors: 3,
    });
    // Original names are not rewritten.
    const names = await prisma.product.findMany({ where: { id: { in: [belator, bellator] } }, select: { name: true } });
    expect(names.map((row) => row.name.split(" ")[0]).sort()).toEqual(["Belator", "Bellator"]);
    // Correction: Bellator back to itself; the earlier row stays in history.
    res = await http().post(`${ASSOCIATIONS}/${bellator}/close`).set("Authorization", `Bearer ${admin.token}`)
      .send({ reason: "denominación distinta", confirmed: true });
    expect(res.status).toBe(200);
    const rows = await prisma.productCanonicalAssociation.findMany({ where: { productId: bellator } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.validTo).not.toBeNull();
    expect(rows[0]!.closeReason).toBe("denominación distinta");
    const after = await summary();
    // Bellator's contributions left the group: the Belator figure is withdrawn.
    expect(cellOf(after, belator)).toMatchObject({ status: "SUPPRESSED_UNDER_THRESHOLD" });
    expect(cellOf(after, bellator)).toMatchObject({ status: "SUPPRESSED_UNDER_THRESHOLD" });
    const list: Res = await http().get(ASSOCIATIONS).set("Authorization", `Bearer ${director.token}`);
    expect(list.body.history.some((row: any) => row.product_ref === bellator)).toBe(true);
    expect(JSON.stringify(list.body)).not.toMatch(/quantity|total/);
  });

  it("authorization: Directiva and ADMINISTRADOR of the tenant only", async () => {
    expect((await summary(admin)).status).toBe(200);
    expect((await summary(farmers[0]!)).status).toBe(403);
    expect((await summary(otherTenantDirector)).status).toBe(404);
    expect((await summary(director, f.campaigns.openB)).status).toBe(404);
    const farmerAssoc: Res = await http().get(ASSOCIATIONS).set("Authorization", `Bearer ${farmers[0]!.token}`);
    expect(farmerAssoc.status).toBe(403);
    const crossTenant: Res = await http().post(ASSOCIATIONS).set("Authorization", `Bearer ${director.token}`)
      .send({ productId: f.products.liquidB, canonicalProductId: f.products.liquidA, reason: "x", confirmed: true });
    expect(crossTenant.status).toBe(404);
    const unauthenticated: Res = await http().get(`/api/v1/collective/campaigns/${f.campaigns.openA}/summary`);
    expect(unauthenticated.status).toBe(401);
  });

  it("an int64 overflow is reported, never truncated", async () => {
    const p = await product("Desborde");
    for (const farmer of farmers.slice(0, 3)) await push(farmer, { product: p, quantity: "9223372036854775807" });
    expect(cellOf(await summary(), p)).toMatchObject({ status: "OVERFLOW", total_base: null });
  });

  it("JSON and CSV carry the same decisions; no individual data", async () => {
    const json = await summary();
    const csv: Res = await http()
      .get(`/api/v1/collective/campaigns/${f.campaigns.openA}/summary.csv`)
      .set("Authorization", `Bearer ${director.token}`);
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(csv.headers["cache-control"]).toBe("no-store");
    // Line 1 header, 2 values, 3 blank, 4 column names, then one row per cell.
    const rows = csv.text.trim().split("\n").slice(4);
    expect(rows).toHaveLength(json.body.cells.length);
    for (const cell of json.body.cells) {
      const line = rows.find((row) => row.startsWith(`${cell.projection_type},${cell.product_ref},`));
      expect(line).toBeDefined();
      expect(line).toContain(`,${cell.status},${cell.total_base ?? ""},`);
    }
    const text = JSON.stringify(json.body);
    for (const id of farmers.map((farmer) => farmer.memberId)) expect(text).not.toContain(id);
    expect(Object.keys(json.body.cells[0]).sort()).toEqual([
      "base_unit", "contributors", "data_as_of", "pending_changes", "presentation_unit", "product_name",
      "product_ref", "projection_type", "released_at", "status", "total_base", "total_presentation",
    ]);
  });

  it("is read-only over contributions and its history is immutable", async () => {
    const before = await prisma.syncV1Contribution.findMany({ orderBy: { id: "asc" } });
    const journals = await prisma.syncV1OperationJournal.count();
    await summary();
    expect(await prisma.syncV1Contribution.findMany({ orderBy: { id: "asc" } })).toEqual(before);
    expect(await prisma.syncV1OperationJournal.count()).toBe(journals);
    const association = await prisma.productCanonicalAssociation.findFirstOrThrow();
    await expect(prisma.productCanonicalAssociation.delete({ where: { id: association.id } })).rejects.toThrow();
    const release = await prisma.collectiveRelease.findFirstOrThrow();
    await expect(
      prisma.collectiveRelease.update({ where: { id: release.id }, data: { totalBase: 1n } }),
    ).rejects.toThrow();
    await expect(prisma.collectiveReleaseItem.deleteMany({ where: { releaseId: release.id } })).rejects.toThrow();
  });
});
