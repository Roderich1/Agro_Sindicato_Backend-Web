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
} from "../../sync-v1/test-support/sync-v1-test-app";

/**
 * F07-REC-01 (#108), backend base: explicit association of denominations with
 * a canonical product, immutable history, tenant isolation and roles. The Web
 * screen and pending-denomination view are D5; this issue stays open.
 */
const postgresUrl = process.env["F07_REC_01_PG_TEST_URL"];
const describePostgres = postgresUrl ? describe : describe.skip;
const ASSOCIATIONS = "/api/v1/collective/product-associations";

interface Res {
  status: number;
  body: any;
  headers: Record<string, string>;
}

describePostgres("F07-REC-01 product reconciliation on PostgreSQL", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let f: Fixture;
  let director: TestSession;
  let admin: TestSession;
  let farmer: TestSession;

  beforeAll(async () => {
    const databaseUrl = await createIsolatedDatabase(postgresUrl!, "f07_rec_01");
    ({ app, prisma, jwt } = await createSyncV1App(databaseUrl));
    f = await seedFixture(prisma);
    director = await createSession(prisma, jwt, f.members.directorA);
    admin = await createSession(prisma, jwt, f.members.adminA);
    farmer = await createSession(prisma, jwt, f.members.farmerA);
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
  }, 180000);

  afterAll(async () => {
    jest.restoreAllMocks();
    await app?.close();
  });

  const http = () => request(app.getHttpServer());

  async function product(name: string, unit = "L") {
    return (await prisma.product.create({ data: { tenantId: f.tenantA, name, unit } })).id;
  }

  function associate(session: TestSession, body: Record<string, unknown>): Promise<Res> {
    return http().post(ASSOCIATIONS).set("Authorization", `Bearer ${session.token}`).send(body);
  }

  it("Belator and Bellator under one canonical product, names untouched", async () => {
    const canonical = await product("Belator 20 SC");
    const belator = await product("Belator");
    const bellator = await product("Bellator");
    for (const id of [belator, bellator]) {
      const res = await associate(director, { productId: id, canonicalProductId: canonical, reason: "misma fórmula", confirmed: true });
      expect(res.status).toBe(200);
      expect(res.body.changed).toBe(true);
    }
    const list: Res = await http().get(ASSOCIATIONS).set("Authorization", `Bearer ${director.token}`);
    // F10-SEC-02 M8 (#45): the association list is never cached, like its catalog.
    expect(list.headers["cache-control"]).toBe("no-store");
    const current = list.body.current.filter((row: any) => row.canonical_product_ref === canonical);
    expect(current.map((row: any) => row.product_name).sort()).toEqual(["Belator", "Bellator"]);
    const directorUser = await prisma.member.findUniqueOrThrow({ where: { id: director.memberId }, select: { userId: true } });
    expect(current.every((row: any) => row.actor_ref === directorUser.userId)).toBe(true);
    const names = await prisma.product.findMany({ where: { id: { in: [belator, bellator, canonical] } }, select: { name: true } });
    expect(names.map((row) => row.name).sort()).toEqual(["Belator", "Belator 20 SC", "Bellator"]);
    // Repeating the same association changes nothing.
    const again = await associate(director, { productId: belator, canonicalProductId: canonical, reason: "otra vez", confirmed: true });
    expect(again.body.changed).toBe(false);
    expect(await prisma.productCanonicalAssociation.count({ where: { productId: belator } })).toBe(1);
  });

  it("a correction closes the current row with actor, date and reason, and opens another", async () => {
    const wrong = await product("Glifo 48");
    const right = await product("Glifosato 48 SL ref");
    const alias = await product("Glifosato 48");
    await associate(director, { productId: alias, canonicalProductId: wrong, reason: "primera lectura", confirmed: true });
    const res = await associate(admin, { productId: alias, canonicalProductId: right, reason: "se asoció mal", confirmed: true });
    expect(res.status).toBe(200);
    const rows = await prisma.productCanonicalAssociation.findMany({ where: { productId: alias }, orderBy: { validFrom: "asc" } });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ canonicalProductId: wrong, closeReason: "se asoció mal" });
    expect(rows[0]!.validTo).not.toBeNull();
    expect(rows[0]!.closedByUserId).toBe(rows[1]!.actorUserId);
    expect(rows[1]).toMatchObject({ canonicalProductId: right, validTo: null, reason: "se asoció mal" });
    // The history cannot be rewritten or deleted.
    await expect(prisma.productCanonicalAssociation.update({ where: { id: rows[0]!.id }, data: { reason: "otra" } })).rejects.toThrow();
    await expect(prisma.productCanonicalAssociation.delete({ where: { id: rows[1]!.id } })).rejects.toThrow();
  });

  it("no chains: a canonical is not an alias and an alias has no aliases", async () => {
    const root = await product("Raíz");
    const middle = await product("Intermedio");
    const leaf = await product("Hoja");
    await associate(director, { productId: middle, canonicalProductId: root, reason: "x", confirmed: true });
    const toAlias: Res = await associate(director, { productId: leaf, canonicalProductId: middle, reason: "x", confirmed: true });
    expect(toAlias.status).toBe(422);
    expect(toAlias.body.message).toBe("CANONICAL_IS_ALIAS");
    const rootAway: Res = await associate(director, { productId: root, canonicalProductId: leaf, reason: "x", confirmed: true });
    expect(rootAway.status).toBe(422);
    expect(rootAway.body.message).toBe("PRODUCT_IS_CANONICAL");
  });

  it("only compatible units, only the tenant, only the Directiva or its ADMINISTRADOR", async () => {
    const liquid = await product("Líquido");
    const powder = await product("Polvo", "kg");
    const unit = await product("Unidad", "unidad");
    expect((await associate(director, { productId: powder, canonicalProductId: liquid, reason: "x", confirmed: true })).body.message).toBe("UNIT_DIMENSION_MISMATCH");
    expect((await associate(director, { productId: unit, canonicalProductId: liquid, reason: "x", confirmed: true })).body.message).toBe("PRODUCT_NOT_LINKABLE");
    // Another tenant's product is indistinguishable from a missing one.
    expect((await associate(director, { productId: f.products.liquidB, canonicalProductId: liquid, reason: "x", confirmed: true })).status).toBe(404);
    expect((await associate(director, { productId: randomUUID(), canonicalProductId: liquid, reason: "x", confirmed: true })).status).toBe(404);
    expect((await associate(farmer, { productId: unit, canonicalProductId: liquid, reason: "x", confirmed: true })).status).toBe(403);
    const list: Res = await http().get(ASSOCIATIONS).set("Authorization", `Bearer ${farmer.token}`);
    expect(list.status).toBe(403);
    // Unknown fields are rejected, not ignored.
    const extra: Res = await associate(director, { productId: powder, canonicalProductId: liquid, reason: "x", confirmed: true, tenantId: f.tenantB });
    expect(extra.status).toBe(400);
  });

  it("concurrent corrections leave exactly one current association", async () => {
    const alias = await product("Concurrente");
    const targets = [await product("Destino 1"), await product("Destino 2"), await product("Destino 3")];
    const results: Res[] = await Promise.all(
      targets.map((target) => associate(director, { productId: alias, canonicalProductId: target, reason: "carrera", confirmed: true })),
    );
    expect(results.every((res) => res.status === 200)).toBe(true);
    const rows = await prisma.productCanonicalAssociation.findMany({ where: { productId: alias } });
    expect(rows.filter((row) => row.validTo === null)).toHaveLength(1);
    expect(rows).toHaveLength(3);
  });
});
