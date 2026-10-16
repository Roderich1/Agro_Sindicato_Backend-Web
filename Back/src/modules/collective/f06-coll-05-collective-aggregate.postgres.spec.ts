import { INestApplication, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { afterAll, beforeAll } from "@jest/globals";
import { PrismaClient } from "@prisma/client";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { URL } from "node:url";
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

  describe("F10-SEC-02 (#45): only net changes count between figures", () => {
    /** Publishes one value per farmer and returns their heads. */
    async function publishAll(p: string, values: string[]): Promise<string[]> {
      const heads: string[] = [];
      for (const [i, value] of values.entries()) heads.push(await push(farmers[i]!, { product: p, quantity: value }));
      return heads;
    }

    /** Valid SUPERSEDE on the farmer's own head; returns the new head. */
    async function replace(heads: string[], i: number, p: string, value: string): Promise<void> {
      heads[i] = await push(farmers[i]!, { product: p, quantity: value, action: "SUPERSEDE", pred: heads[i] });
    }

    it("6000 → 6100 with three new sequences but one net change keeps the prior figure", async () => {
      const p = await product("Neto");
      const heads = await publishAll(p, ["1000", "2000", "3000"]);
      expect(cellOf(await summary(), p)).toMatchObject({ status: "DISCLOSED", total_base: "6000" });
      await replace(heads, 0, p, "1100");
      await replace(heads, 1, p, "2000"); // same value, new sequence
      await replace(heads, 2, p, "3000"); // same value, new sequence
      const json = await summary();
      expect(cellOf(json, p)).toMatchObject({ status: "DISCLOSED", total_base: "6000", pending_changes: true });
      const csv: Res = await http()
        .get(`/api/v1/collective/campaigns/${f.campaigns.openA}/summary.csv`)
        .set("Authorization", `Bearer ${director.token}`);
      expect(csv.text).toContain(`,${p},`);
      expect(csv.text).not.toContain(",6100,");
    });

    it("replacements without a new value are not new information", async () => {
      const p = await product("Sin variación");
      const heads = await publishAll(p, ["1000", "2000", "3000"]);
      const first = cellOf(await summary(), p);
      for (const [i, value] of ["1000", "2000", "3000"].entries()) await replace(heads, i, p, value);
      expect(cellOf(await summary(), p)).toMatchObject({
        status: "DISCLOSED", total_base: "6000", pending_changes: false, released_at: first.released_at,
      });
    });

    it("a change that goes back to its released value leaves nothing pending", async () => {
      const p = await product("Vuelta");
      const heads = await publishAll(p, ["1000", "2000", "3000"]);
      await summary();
      await replace(heads, 0, p, "1700");
      expect(cellOf(await summary(), p)).toMatchObject({ total_base: "6000", pending_changes: true });
      await replace(heads, 0, p, "1000");
      expect(cellOf(await summary(), p)).toMatchObject({ total_base: "6000", pending_changes: false });
    });

    it("no figure differs from any earlier figure of the cell by fewer than k Members", async () => {
      const p = await product("Historial");
      const heads = await publishAll(p, ["1000", "2000", "3000", "4000"]);
      expect(cellOf(await summary(), p)).toMatchObject({ total_base: "10000" }); // R1
      for (const [i, value] of ["1100", "2100", "3100", "4100"].entries()) await replace(heads, i, p, value);
      expect(cellOf(await summary(), p)).toMatchObject({ total_base: "10400", pending_changes: false }); // R2
      // Three Members go back: three changes against R2, but only one against
      // R1. Publishing 10100 would reveal the first Member's change (R3 − R1).
      for (const [i, value] of [[1, "2000"], [2, "3000"], [3, "4000"]] as const) await replace(heads, i, p, value);
      const res = cellOf(await summary(), p);
      expect(res.total_base).not.toBe("10100");
      expect(res).toMatchObject({ status: "DISCLOSED", total_base: "10400", pending_changes: true });
    });

    it("regrouping: a Member that joins through an association alone is not a new figure", async () => {
      const belator = await product("Belator neto");
      const bellator = await product("Bellator neto");
      await publishAll(belator, ["1000", "2000", "3000"]);
      expect(cellOf(await summary(), belator)).toMatchObject({ total_base: "6000" });
      await push(farmers[3]!, { product: bellator, quantity: "500" });
      const res: Res = await http().post(ASSOCIATIONS).set("Authorization", `Bearer ${director.token}`)
        .send({ productId: bellator, canonicalProductId: belator, reason: "misma denominación", confirmed: true });
      expect(res.status).toBe(200);
      expect(cellOf(await summary(), belator)).toMatchObject({ total_base: "6000", pending_changes: true });
      // Undoing the association brings back exactly the released contributions.
      await http().post(`${ASSOCIATIONS}/${bellator}/close`).set("Authorization", `Bearer ${director.token}`)
        .send({ reason: "denominación distinta", confirmed: true });
      expect(cellOf(await summary(), belator)).toMatchObject({ total_base: "6000", pending_changes: false });
    });
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

/**
 * F10-SEC-02 (#45), finding on PR #112: a disclosure written before
 * 20261016150500 has no per-contribution quantity. The migration leaves it
 * NULL (unknown, never rebuilt from current values), and an unknown amount
 * proves no change. The database is migrated only up to the previous
 * migration; the disclosure is written exactly as the code before the
 * revision (063437d) wrote it; then the new migration is deployed.
 */
describePostgres("F07-POL-01: disclosures written before the quantity migration", () => {
  const QUANTITY_MIGRATION = "20261016150500_f07_pol_01_release_item_quantity";
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let f: Fixture;
  let databaseUrl: string;
  let director: TestSession;
  const farmers: TestSession[] = [];

  /** `prisma migrate deploy` of the given schema folder (default: the real one). */
  function deploy(url: string, schema?: string): void {
    const result = spawnSync(
      process.execPath,
      [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy", ...(schema ? ["--schema", schema] : [])],
      { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: url }, encoding: "utf8", timeout: 120000 },
    );
    if (result.status !== 0) throw new Error(`migrate deploy failed: ${result.stderr}`);
  }

  /**
   * A new database migrated up to, but not including, `migration`: later
   * migrations (e.g. F08's) are left out too, so none is applied out of order.
   */
  async function databaseBefore(adminUrl: string, migration: string): Promise<string> {
    const admin = new PrismaClient({ datasources: { db: { url: adminUrl } } });
    const name = `f07_pol_01_mig_${randomUUID().replaceAll("-", "")}`;
    try {
      await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    } finally {
      await admin.$disconnect();
    }
    const url = new URL(adminUrl);
    url.pathname = `/${name}`;
    const dir = mkdtempSync(join(tmpdir(), "f07-pol-01-"));
    try {
      cpSync("prisma/schema.prisma", join(dir, "schema.prisma"));
      const root = resolve("prisma/migrations");
      cpSync(root, join(dir, "migrations"), {
        recursive: true,
        filter: (source) => {
          const entry = relative(root, resolve(source)).split(sep)[0] ?? "";
          return !/^\d{14}_/.test(entry) || entry < migration;
        },
      });
      deploy(url.toString(), join(dir, "schema.prisma"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    return url.toString();
  }

  beforeAll(async () => {
    process.env["COLLECTIVE_DISCLOSURE_MODE"] = "provisional-synthetic";
    databaseUrl = await databaseBefore(postgresUrl!, QUANTITY_MIGRATION);
    ({ app, prisma, jwt } = await createSyncV1App(databaseUrl));
    f = await seedFixture(prisma);
    farmers.push(
      await createSession(prisma, jwt, f.members.farmerA),
      await createSession(prisma, jwt, f.members.farmerA2),
    );
    for (let i = 0; i < 4; i++) {
      const memberId = randomUUID();
      await prisma.user.create({
        data: {
          id: randomUUID(), tenantId: f.tenantA, name: "Usuario sintético", email: `f07-${memberId}@example.test`,
          passwordHash: unusablePasswordHash(), role: "AGRICULTOR",
          members: { create: { id: memberId, tenantId: f.tenantA, role: "AGRICULTOR" } },
        },
      });
      farmers.push(await createSession(prisma, jwt, memberId));
    }
    director = await createSession(prisma, jwt, f.members.directorA);
  }, 240000);

  afterAll(async () => {
    delete process.env["COLLECTIVE_DISCLOSURE_MODE"];
    await app?.close();
  });

  const http = () => request(app.getHttpServer());

  async function push(session: TestSession, p: string, quantity: string, pred: string | null = null): Promise<string> {
    const operationId = randomUUID();
    const res: Res = await http()
      .post(PUSH)
      .set("Content-Type", "application/json")
      .set("Authorization", `Bearer ${session.token}`)
      .send(JSON.stringify({
        contractVersion: 1,
        operationId,
        projectionType: "DECLARED_NEED",
        action: pred === null ? "PUBLISH" : "SUPERSEDE",
        causal: { predecessorOperationId: pred, reconciliationReference: null },
        payload: { campaign_ref: f.campaigns.openA, product_ref: p, base_unit: "ML", quantity_base: quantity },
      }));
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe("APPLIED");
    return operationId;
  }

  async function cell(p: string) {
    const res: Res = await http()
      .get(`/api/v1/collective/campaigns/${f.campaigns.openA}/summary`)
      .set("Authorization", `Bearer ${director.token}`);
    expect(res.status).toBe(200);
    return (res.body.cells as any[]).find((row) => row.product_ref === p);
  }

  /** The disclosure as 063437d wrote it: release and items, no quantities. */
  async function legacyRelease(p: string): Promise<void> {
    const contributions = await prisma.syncV1Contribution.findMany({
      where: { productId: p, status: "ACTIVE" },
      select: { id: true, lastSequence: true, quantityBase: true, acceptedAt: true },
    });
    const id = randomUUID();
    const total = contributions.reduce((sum, c) => sum + c.quantityBase!, 0n);
    const dataAsOf = new Date(Math.max(...contributions.map((c) => c.acceptedAt!.getTime())));
    await prisma.$executeRaw`
      INSERT INTO "CollectiveRelease"
        ("id", "tenantId", "campaignId", "canonicalProductId", "projectionType", "baseUnit",
         "totalBase", "contributorCount", "dataAsOf", "releasedAt")
      VALUES (${id}::uuid, ${f.tenantA}, ${f.campaigns.openA}, ${p}, 'DECLARED_NEED', 'ML',
              ${total}, ${contributions.length}, ${dataAsOf}, now())`;
    for (const c of contributions) {
      await prisma.$executeRaw`
        INSERT INTO "CollectiveReleaseItem" ("releaseId", "contributionId", "sequence")
        VALUES (${id}::uuid, ${c.id}::uuid, ${c.lastSequence})`;
    }
  }

  it("6000 disclosed before the migration: one net change does not publish 6100", async () => {
    const created = await prisma.product.create({
      data: { tenantId: f.tenantA, name: `Migración ${randomUUID().slice(0, 8)}`, unit: "L" },
    });
    const p = created.id;
    const heads: string[] = [];
    for (const [i, value] of ["1000", "2000", "3000"].entries()) heads.push(await push(farmers[i]!, p, value));
    await legacyRelease(p);
    deploy(databaseUrl);
    const applied = await prisma.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name`;
    // The deploy above applied the quantity migration (and any later one).
    expect(applied.map((m) => m.migration_name)).toContain(QUANTITY_MIGRATION);
    // The migration leaves the earlier quantities unknown; nothing rebuilds them.
    const items = await prisma.collectiveReleaseItem.findMany({ where: { release: { canonicalProductId: p } } });
    expect(items).toHaveLength(3);
    expect(items.every((item) => item.quantityBase === null)).toBe(true);

    // Valid SUPERSEDE: 1100 / 2000 / 3000, three sequences, one net change.
    // The first consultation after the migration sees these values.
    for (const [i, value] of ["1100", "2000", "3000"].entries()) heads[i] = await push(farmers[i]!, p, value, heads[i]!);
    expect(await cell(p)).toMatchObject({ status: "DISCLOSED", total_base: "6000", contributors: 3, pending_changes: true });
    const csv: Res = await http()
      .get(`/api/v1/collective/campaigns/${f.campaigns.openA}/summary.csv`)
      .set("Authorization", `Bearer ${director.token}`);
    expect(csv.text).toContain(`,${p},`);
    expect(csv.text).not.toContain(",6100,");
    expect(await prisma.collectiveRelease.count({ where: { canonicalProductId: p } })).toBe(1);

    // Two Members join: two provable changes, still fewer than k.
    for (const i of [3, 4]) await push(farmers[i]!, p, "500");
    expect(await cell(p)).toMatchObject({ total_base: "6000", pending_changes: true });
    // A third joins: k Members provably changed against the old disclosure.
    await push(farmers[5]!, p, "500");
    expect(await cell(p)).toMatchObject({ status: "DISCLOSED", total_base: "7600", contributors: 6, pending_changes: false });
    const latest = await prisma.collectiveReleaseItem.findMany({
      where: { release: { canonicalProductId: p, totalBase: 7600n } },
    });
    expect(latest.map((item) => item.quantityBase?.toString()).sort()).toEqual(
      ["1100", "2000", "3000", "500", "500", "500"],
    );
  });
});
