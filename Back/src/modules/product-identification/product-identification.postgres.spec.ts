import { INestApplication, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { afterAll, beforeAll } from "@jest/globals";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";
import type { AddressInfo, Server } from "node:net";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error supertest has no declaration in the baseline test setup.
import request = require("supertest");
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { LocalDiskBackupStorage } from "@/modules/backups/infrastructure/local-disk-backup-storage";
import {
  createIsolatedDatabase,
  createSession,
  Fixture,
  seedFixture,
  TestSession,
  unusablePasswordHash,
} from "@/modules/sync-v1/test-support/sync-v1-test-app";
import { SyncV1Config } from "@/modules/sync-v1/application/sync-v1-config";
import { FingerprintKeyring } from "@/modules/sync-v1/domain/fingerprint";
import { CollectiveConfig } from "@/modules/collective/application/collective-config";
import { ProductPhotoSweep, RETENTION_DETAIL } from "./application/product-photo-sweep";
import { createE1App } from "./test-support/e1-test-app";
import { corruptJpeg, jpeg, jpegWithExif, png } from "./test-support/images";

/**
 * E1 (etapa 1), §7 rows 1–6: identification of products reported by the
 * farmer, against a real PostgreSQL and the real Nest application. The given
 * URL must point to a throwaway server: a new database is created and
 * migrated from zero. Every identity, name, value and image is synthetic.
 */
const postgresUrl = process.env["E1_PG_TEST_URL"];
const describePostgres = postgresUrl ? describe : describe.skip;
const BASE = "/api/v1/catalog/identification-requests";

interface Res {
  status: number;
  body: any;
  headers: Record<string, string>;
  text?: string;
}

function sha(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

describePostgres("E1 product identification on PostgreSQL", () => {
  let app: INestApplication;
  let unavailableApp: INestApplication;
  let prisma: PrismaService;
  const jwt = new JwtService();
  let f: Fixture;
  let farmerA: TestSession;
  let farmerA2: TestSession;
  let farmerB: TestSession;
  let director: TestSession;
  let admin: TestSession;
  let photoDir: string;
  let userNames: string[];
  let userEmails: string[];

  beforeAll(async () => {
    const databaseUrl = await createIsolatedDatabase(postgresUrl!, "e1_identification");
    photoDir = mkdtempSync(join(tmpdir(), "e1-photos-"));
    ({ app, prisma } = await createE1App(databaseUrl, { photoStorage: new LocalDiskBackupStorage(photoDir) }));
    ({ app: unavailableApp } = await createE1App(databaseUrl, { photoStorage: null }));
    f = await seedFixture(prisma);
    farmerA = await createSession(prisma, jwt, f.members.farmerA);
    farmerA2 = await createSession(prisma, jwt, f.members.farmerA2);
    farmerB = await createSession(prisma, jwt, f.members.farmerB);
    director = await createSession(prisma, jwt, f.members.directorA);
    admin = await createSession(prisma, jwt, f.members.adminA);
    const users = await prisma.user.findMany({ select: { name: true, email: true } });
    userNames = users.map((u) => u.name);
    userEmails = users.map((u) => u.email);
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
  }, 240000);

  afterAll(async () => {
    jest.restoreAllMocks();
    await app?.close();
    await unavailableApp?.close();
    if (photoDir) rmSync(photoDir, { recursive: true, force: true });
  });

  const http = (target: INestApplication = app) => request(target.getHttpServer());
  const auth = (session: TestSession) => `Bearer ${session.token}`;
  const storedObjects = () => {
    try {
      return readdirSync(join(photoDir, "objects"));
    } catch {
      return [];
    }
  };

  const data = (overrides: Record<string, unknown> = {}) => ({
    contractVersion: 1,
    local_name: "Herbicida sintetico",
    active_ingredient: "Glifosato",
    unit: "L",
    photo_consent: { version: "FOTO-1", accepted_at: "2026-11-11T18:20:00.000Z" },
    ...overrides,
  });

  function put(session: TestSession, id: string, body: unknown, target?: INestApplication): Promise<Res> {
    return http(target).put(`${BASE}/${id}`).set("Authorization", auth(session)).send(body as object);
  }

  function putPhoto(
    session: TestSession,
    id: string,
    bytes: Buffer,
    options: { sha256?: string; contentType?: string; target?: INestApplication } = {},
  ): Promise<Res> {
    return http(options.target)
      .put(`${BASE}/${id}/photo`)
      .set("Authorization", auth(session))
      .set("Content-Type", options.contentType ?? "application/octet-stream")
      .set("X-Content-SHA256", options.sha256 ?? sha(bytes))
      .send(bytes);
  }

  /**
   * Sends only the headers (the body is never written) and reads the answer:
   * a 413 decided from the headers closes the connection, which a client
   * still writing 2 MiB would see as a reset.
   */
  async function headersOnly(session: TestSession, id: string, headers: Record<string, string>) {
    const server = app.getHttpServer() as Server;
    if (!server.listening) await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    return new Promise<{ status: number; body: any }>((resolve, reject) => {
      const req = httpRequest(
        {
          host: "127.0.0.1",
          port,
          method: "PUT",
          path: `${BASE}/${id}/photo`,
          headers: { Authorization: auth(session), "Content-Type": "application/octet-stream", ...headers },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => {
            resolve({ status: res.statusCode!, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) });
            req.destroy();
          });
        },
      );
      req.on("error", reject);
      req.flushHeaders();
    });
  }

  async function serverId(clientRequestId: string, tenantId = f.tenantA) {
    return (
      await prisma.productIdentificationRequest.findFirstOrThrow({
        where: { clientRequestId, tenantId },
        select: { id: true },
      })
    ).id;
  }

  function expectNoFarmerIdentity(value: unknown) {
    const text = JSON.stringify(value);
    for (const memberId of Object.values(f.members)) expect(text).not.toContain(memberId);
    for (const email of userEmails) expect(text).not.toContain(email);
    for (const name of userNames.filter((n) => n.includes("farmer"))) expect(text).not.toContain(name);
    expect(text).not.toContain("memberId");
  }

  describe("row 1: idempotency of PUT /{request_id}", () => {
    it("creates (201), resends (200), conflicts with another Member, ignores other tenants", async () => {
      const id = randomUUID();
      const created = await put(farmerA, id, data());
      expect(created.status).toBe(201);
      expect(created.headers["cache-control"]).toBe("no-store");
      expect(created.body).toMatchObject({
        contractVersion: 1,
        request_id: id,
        status: "PENDING",
        unit: "L",
        base_unit: "ML",
        photo: { state: "NONE", sha256: null, consent_version: "FOTO-1" },
        resolution: null,
        pending_note: null,
      });
      expect(created.body).not.toHaveProperty("id");
      const again = await put(farmerA, id, data());
      expect(again.status).toBe(200);
      expect(again.body.received_at).toBe(created.body.received_at);
      expect(await prisma.productIdentificationRequest.count({ where: { clientRequestId: id } })).toBe(1);

      const conflict = await put(farmerA2, id, data());
      expect(conflict.status).toBe(409);
      expect(conflict.body).toEqual({ errorCode: "REQUEST_ID_CONFLICT" });
      const otherTenant = await put(farmerB, id, data());
      expect(otherTenant.status).toBe(201);

      const updated = await put(farmerA, id, data({ local_name: "Herbicida sintetico 480" }));
      expect(updated.status).toBe(200);
      expect(updated.body.local_name).toBe("Herbicida sintetico 480");
      const unit = await put(farmerA, id, data({ unit: "KG" }));
      expect(unit.status).toBe(409);
      expect(unit.body).toEqual({ errorCode: "UNIT_IMMUTABLE" });
      const events = await prisma.productIdentificationEvent.findMany({
        where: { request: { clientRequestId: id, tenantId: f.tenantA } },
        orderBy: { at: "asc" },
      });
      expect(events.map((e) => e.kind)).toEqual(["RECEIVED", "UPDATED"]);
      expect(events.every((e) => e.actorUserId === null)).toBe(true);
    });

    it("answers closed codes without echoing the body", async () => {
      const id = randomUUID();
      const extra = await put(farmerA, id, { ...data(), memberId: f.members.farmerA2 });
      expect(extra.status).toBe(400);
      expect(extra.body).toEqual({ errorCode: "PAYLOAD_INVALID" });
      const malformed: Res = await http()
        .put(`${BASE}/${id}`)
        .set("Authorization", auth(farmerA))
        .set("Content-Type", "application/json")
        .send('{"local_name": "SECRETO-ECO",');
      expect(malformed.status).toBe(400);
      expect(JSON.stringify(malformed.body)).not.toContain("SECRETO-ECO");
      expect((await put(farmerA, id, data({ unit: "GAL" }))).body).toEqual({ errorCode: "UNIT_UNSUPPORTED" });
      expect((await put(farmerA, id, data({ contractVersion: 2 }))).status).toBe(400);
      expect((await put(farmerA, id.toUpperCase(), data())).status).toBe(400);
      expect((await put(farmerA, id, data({ photo_consent: { version: "FOTO-1" } }))).status).toBe(400);
    });
  });

  describe("row 2: tenants and roles", () => {
    let id: string;
    beforeAll(async () => {
      id = randomUUID();
      expect((await put(farmerA, id, data({ local_name: "Fungicida reportado", unit: "KG" }))).status).toBe(201);
    });

    it("the farmer lists only own requests; no query parameters", async () => {
      const own: Res = await http().get(BASE).set("Authorization", auth(farmerA));
      expect(own.status).toBe(200);
      expect(own.headers["cache-control"]).toBe("no-store");
      expect(own.body.requests.map((r: any) => r.request_id)).toContain(id);
      expect(own.body.requests.every((r: any) => !("id" in r))).toBe(true);
      const other: Res = await http().get(BASE).set("Authorization", auth(farmerA2));
      expect(other.body.requests.map((r: any) => r.request_id)).not.toContain(id);
      const withQuery: Res = await http().get(`${BASE}?status=ALL`).set("Authorization", auth(farmerA));
      expect(withQuery.status).toBe(400);
    });

    it("Directiva and Administrador list the tenant without the farmer's identity", async () => {
      for (const session of [director, admin]) {
        const list: Res = await http().get(`${BASE}?status=ALL`).set("Authorization", auth(session));
        expect(list.status).toBe(200);
        expect(list.headers["cache-control"]).toBe("no-store");
        const mine = list.body.requests.find((r: any) => r.request_id === id);
        expect(mine).toMatchObject({ id: await serverId(id), status: "PENDING", unit: "KG", base_unit: "G" });
        expect(mine.photo).toHaveProperty("content_type");
        expectNoFarmerIdentity(list.body);
        // Tenant B's requests never appear.
        const tenantB = await prisma.productIdentificationRequest.findMany({ where: { tenantId: f.tenantB }, select: { id: true } });
        for (const row of tenantB) expect(list.body.requests.map((r: any) => r.id)).not.toContain(row.id);
      }
      const pending: Res = await http().get(BASE).set("Authorization", auth(director));
      expect(pending.body.requests.every((r: any) => r.status === "PENDING")).toBe(true);
      expect((await http().get(`${BASE}?status=OTRO`).set("Authorization", auth(director))).status).toBe(400);
    });

    it("AGRICULTOR cannot use institutional routes; Directiva cannot use the farmer's; other tenant is 404", async () => {
      const sid = await serverId(id);
      const asFarmer: Res = await http().get(`${BASE}/${sid}/candidates`).set("Authorization", auth(farmerA));
      expect(asFarmer.status).toBe(403);
      expect(asFarmer.body).toEqual({ errorCode: "AUTH_CONTEXT_FORBIDDEN" });
      const linkAsFarmer: Res = await http()
        .post(`${BASE}/${sid}/link`)
        .set("Authorization", auth(farmerA))
        .send({ product_ref: f.products.solidA, reason: "x", confirmed: true });
      expect(linkAsFarmer.status).toBe(403);
      const asDirector = await put(director, randomUUID(), data());
      expect(asDirector.status).toBe(403);
      expect(asDirector.body).toEqual({ errorCode: "AUTH_CONTEXT_FORBIDDEN" });
      const anonymous: Res = await http().get(BASE);
      expect(anonymous.status).toBe(401);
      expect(anonymous.body).toEqual({ errorCode: "AUTH_REQUIRED" });

      const foreignClientId = randomUUID();
      await put(farmerB, foreignClientId, data());
      const foreignId = await serverId(foreignClientId, f.tenantB);
      for (const path of ["candidates", "history"]) {
        const res: Res = await http().get(`${BASE}/${foreignId}/${path}`).set("Authorization", auth(director));
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ errorCode: "REQUEST_NOT_FOUND" });
      }
      const link: Res = await http()
        .post(`${BASE}/${foreignId}/link`)
        .set("Authorization", auth(director))
        .send({ product_ref: f.products.liquidA, reason: "x", confirmed: true });
      expect(link.status).toBe(404);
    });
  });

  describe("rows 3 and 4: photo validation, replacement, removal and unavailable storage", () => {
    let id: string;
    let sid: string;
    beforeAll(async () => {
      id = randomUUID();
      await put(farmerA, id, data({ local_name: "Insecticida con etiqueta" }));
      sid = await serverId(id);
    });

    it("refuses missing consent, fake type, oversize, hash mismatch and a non-binary body", async () => {
      const noConsent = randomUUID();
      await put(farmerA, noConsent, data({ photo_consent: null }));
      expect((await putPhoto(farmerA, noConsent, await jpeg(800, 600))).body).toEqual({ errorCode: "PHOTO_CONSENT_REQUIRED" });

      const fake = await putPhoto(farmerA, id, Buffer.from("texto con extension jpg, no una imagen"));
      expect(fake.status).toBe(422);
      expect(fake.body).toEqual({ errorCode: "IMAGE_INVALID" });
      expect((await putPhoto(farmerA, id, await png(20, 20))).body).toEqual({ errorCode: "IMAGE_INVALID" });

      const tooLarge = await headersOnly(farmerA, id, {
        "Content-Length": String(2 * 1024 * 1024 + 1),
        "X-Content-SHA256": "a".repeat(64),
      });
      expect(tooLarge).toEqual({ status: 413, body: { errorCode: "IMAGE_TOO_LARGE" } });
      const chunked = await headersOnly(farmerA, id, { "Transfer-Encoding": "chunked", "X-Content-SHA256": "a".repeat(64) });
      expect(chunked).toEqual({ status: 413, body: { errorCode: "IMAGE_TOO_LARGE" } });

      const mismatch = await putPhoto(farmerA, id, await jpeg(800, 600), { sha256: "0".repeat(64) });
      expect(mismatch.status).toBe(422);
      expect(mismatch.body).toEqual({ errorCode: "CONTENT_HASH_MISMATCH" });

      const json: Res = await http()
        .put(`${BASE}/${id}/photo`)
        .set("Authorization", auth(farmerA))
        .set("Content-Type", "application/json")
        .send({ image: "base64..." });
      expect(json.status).toBe(415);
      expect(json.body).toEqual({ errorCode: "UNSUPPORTED_MEDIA_TYPE" });

      const foreign = await putPhoto(farmerA2, id, await jpeg(800, 600));
      expect(foreign.status).toBe(404);
      expect(storedObjects()).toHaveLength(0);
      expect(readdirSync(join(photoDir, "staging"))).toHaveLength(0);
    });

    it("decodes the whole file: a corrupt JPEG with a valid header or EXIF metadata is 422 and nothing is stored", async () => {
      const before = await prisma.productIdentificationRequest.findUniqueOrThrow({ where: { id: sid } });
      for (const bytes of [await corruptJpeg(), await jpegWithExif()]) {
        const res = await putPhoto(farmerA, id, bytes);
        expect(res.status).toBe(422);
        expect(res.body).toEqual({ errorCode: "IMAGE_INVALID" });
        expect(res.headers["cache-control"]).toBe("no-store");
      }
      expect(storedObjects()).toHaveLength(0);
      expect(readdirSync(join(photoDir, "staging"))).toHaveLength(0);
      const after = await prisma.productIdentificationRequest.findUniqueOrThrow({ where: { id: sid } });
      expect(after).toEqual(before);
      const events = await prisma.productIdentificationEvent.findMany({ where: { requestId: sid } });
      expect(events.map((e) => e.kind)).toEqual(["RECEIVED"]);
    });

    it("stores, no-ops on the same hash, replaces removing the old binary, serves it only to its tenant", async () => {
      const first = await jpeg(1600, 1200);
      const stored = await putPhoto(farmerA, id, first);
      expect(stored.status).toBe(201);
      expect(stored.body.photo).toEqual({ state: "STORED", sha256: sha(first), consent_version: "FOTO-1" });
      const firstKey = (await prisma.productIdentificationRequest.findUniqueOrThrow({ where: { id: sid } })).photoStorageKey;
      expect(storedObjects()).toEqual([firstKey]);

      const same = await putPhoto(farmerA, id, first);
      expect(same.status).toBe(200);
      expect(storedObjects()).toEqual([firstKey]);

      const second = await png(1024, 768);
      const replaced = await putPhoto(farmerA, id, second);
      expect(replaced.status).toBe(201);
      const row = await prisma.productIdentificationRequest.findUniqueOrThrow({ where: { id: sid } });
      expect(storedObjects()).toEqual([row.photoStorageKey]);
      expect(row.photoStorageKey).not.toBe(firstKey);
      // §10: the replaced binary is gone at once; no version of it is kept.
      expect(storedObjects()).not.toContain(firstKey);
      await expect(new LocalDiskBackupStorage(photoDir).open(firstKey!)).rejects.toThrow("BACKUP_OBJECT_MISSING");
      expect(row).toMatchObject({ photoContentType: "image/png", photoWidth: 1024, photoHeight: 768, photoSizeBytes: second.length });

      const download: Res = await http()
        .get(`${BASE}/${sid}/photo`)
        .set("Authorization", auth(director))
        .buffer(true)
        .parse((res: any, done: any) => {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () => done(null, Buffer.concat(chunks)));
        });
      expect(download.status).toBe(200);
      expect(Buffer.compare(download.body, second)).toBe(0);
      expect(download.headers["content-type"]).toBe("image/png");
      expect(download.headers["cache-control"]).toBe("private, no-store");
      expect(download.headers["x-content-sha256"]).toBe(sha(second));
      expect(download.headers["content-disposition"]).toBe('inline; filename="etiqueta.png"');

      const institutional: Res = await http().get(`${BASE}?status=ALL`).set("Authorization", auth(director));
      const view = institutional.body.requests.find((r: any) => r.id === sid);
      expect(view.photo).toMatchObject({ state: "STORED", content_type: "image/png", width: 1024, height: 768 });
      expect(JSON.stringify(view)).not.toContain(row.photoStorageKey!);

      const farmerForeign: Res = await http().get(`${BASE}/${sid}/photo`).set("Authorization", auth(farmerA));
      expect(farmerForeign.status).toBe(403);

      const events = await prisma.productIdentificationEvent.findMany({ where: { requestId: sid }, orderBy: { at: "asc" } });
      expect(events.map((e) => e.kind)).toEqual(["RECEIVED", "PHOTO_RECEIVED", "PHOTO_REPLACED"]);
      expect(events.every((e) => e.actorUserId === null && (e.detail ?? "").indexOf(photoDir) < 0)).toBe(true);
    });

    it("another tenant's photo is 404", async () => {
      const foreignClientId = randomUUID();
      await put(farmerB, foreignClientId, data());
      expect((await putPhoto(farmerB, foreignClientId, await jpeg(640, 480))).status).toBe(201);
      const foreignId = await serverId(foreignClientId, f.tenantB);
      const res: Res = await http().get(`${BASE}/${foreignId}/photo`).set("Authorization", auth(director));
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ errorCode: "PHOTO_NOT_FOUND" });
    });

    it("removal deletes the binary (204, idempotent) and the photo is then 404", async () => {
      const before = storedObjects().length;
      const removed: Res = await http().delete(`${BASE}/${id}/photo`).set("Authorization", auth(farmerA));
      expect(removed.status).toBe(204);
      expect(storedObjects()).toHaveLength(before - 1);
      expect((await http().delete(`${BASE}/${id}/photo`).set("Authorization", auth(farmerA))).status).toBe(204);
      const gone: Res = await http().get(`${BASE}/${sid}/photo`).set("Authorization", auth(director));
      expect(gone.status).toBe(404);
      expect(gone.body).toEqual({ errorCode: "PHOTO_NOT_FOUND" });
      expect(gone.headers["cache-control"]).toContain("no-store");
      const own: Res = await http().get(BASE).set("Authorization", auth(farmerA));
      expect(own.body.requests.find((r: any) => r.request_id === id).photo).toEqual({
        state: "REMOVED",
        sha256: null,
        consent_version: "FOTO-1",
      });
    });

    it("without photo storage the data is accepted and the photo routes answer 503", async () => {
      const other = randomUUID();
      const created = await put(farmerA, other, data({ local_name: "Sin almacenamiento" }), unavailableApp);
      expect(created.status).toBe(201);
      const photo = await putPhoto(farmerA, other, await jpeg(800, 600), { target: unavailableApp });
      expect(photo.status).toBe(503);
      expect(photo.body).toEqual({ errorCode: "PHOTO_STORAGE_UNAVAILABLE" });
      const removal: Res = await http(unavailableApp).delete(`${BASE}/${other}/photo`).set("Authorization", auth(farmerA));
      expect(removal.status).toBe(503);
      const download: Res = await http(unavailableApp).get(`${BASE}/${sid}/photo`).set("Authorization", auth(director));
      expect(download.status).toBe(503);
      const list: Res = await http(unavailableApp).get(BASE).set("Authorization", auth(farmerA));
      expect(list.body.requests.map((r: any) => r.request_id)).toContain(other);
    });
  });

  describe("rows 5 and 6: decisions, candidates, history and audit", () => {
    let id: string;
    let sid: string;
    let directorUser: { id: string; name: string };
    const post = (session: TestSession, path: string, body: unknown): Promise<Res> =>
      http().post(`${BASE}/${path}`).set("Authorization", auth(session)).send(body as object);

    beforeAll(async () => {
      id = randomUUID();
      await put(farmerA, id, data({ local_name: "Herbicida sintético", active_ingredient: null }));
      sid = await serverId(id);
      const member = await prisma.member.findUniqueOrThrow({ where: { id: f.members.directorA }, include: { user: true } });
      directorUser = { id: member.user.id, name: member.user.name };
    });

    it("candidates: same dimension, active only, best first; nothing is written", async () => {
      const counts = async () => [
        await prisma.productIdentificationEvent.count(),
        await prisma.auditLog.count(),
        await prisma.product.count(),
        (await prisma.productIdentificationRequest.findUniqueOrThrow({ where: { id: sid } })).updatedAt.toISOString(),
      ];
      const before = await counts();
      const res: Res = await http().get(`${BASE}/${sid}/candidates`).set("Authorization", auth(director));
      expect(res.status).toBe(200);
      expect(res.headers["cache-control"]).toBe("no-store");
      expect(res.body.candidates[0]).toMatchObject({
        product_ref: f.products.liquidA,
        similarity: "ALTA",
        matched_on: ["name"],
        base_unit: "ML",
        is_alias: false,
      });
      const refs = res.body.candidates.map((c: any) => c.product_ref);
      for (const excluded of [f.products.solidA, f.products.inactiveA, f.products.otherUnitA, f.products.liquidB]) {
        expect(refs).not.toContain(excluded);
      }
      expect(await counts()).toEqual(before);
    });

    it("link requires confirmation and reason; refuses inactive, other dimension and foreign products", async () => {
      const attempts: [Record<string, unknown>, number, string][] = [
        [{ product_ref: f.products.liquidA, reason: "x" }, 422, "CONFIRMATION_REQUIRED"],
        [{ product_ref: f.products.liquidA, reason: "x", confirmed: false }, 422, "CONFIRMATION_REQUIRED"],
        [{ product_ref: f.products.liquidA, reason: "  ", confirmed: true }, 422, "REASON_REQUIRED"],
        [{ product_ref: f.products.liquidA, reason: "x".repeat(281), confirmed: true }, 422, "REASON_REQUIRED"],
        [{ product_ref: f.products.inactiveA, reason: "x", confirmed: true }, 422, "PRODUCT_INACTIVE"],
        [{ product_ref: f.products.solidA, reason: "x", confirmed: true }, 422, "UNIT_DIMENSION_MISMATCH"],
        [{ product_ref: f.products.liquidB, reason: "x", confirmed: true }, 404, "PRODUCT_NOT_FOUND"],
        [{ product_ref: randomUUID(), reason: "x", confirmed: true }, 404, "PRODUCT_NOT_FOUND"],
        [{ product_ref: "no-uuid", reason: "x", confirmed: true }, 400, "PAYLOAD_INVALID"],
      ];
      for (const [body, status, code] of attempts) {
        const res = await post(director, `${sid}/link`, body);
        expect([res.status, res.body.errorCode]).toEqual([status, code]);
      }
      expect(await prisma.auditLog.count({ where: { entityId: sid } })).toBe(0);
    });

    it("defer, link, same link, relink: events with actor, AuditLog without the farmer", async () => {
      const deferred = await post(director, `${sid}/defer`, { note: "Falta la foto del envase", confirmed: true });
      expect(deferred.status).toBe(200);
      expect(deferred.body.request).toMatchObject({ status: "PENDING", pending_note: { text: "Falta la foto del envase" } });
      const farmerView: Res = await http().get(BASE).set("Authorization", auth(farmerA));
      const pendingNote = farmerView.body.requests.find((r: any) => r.request_id === id).pending_note;
      expect(Object.keys(pendingNote).sort()).toEqual(["at", "text"]);

      const linked = await post(director, `${sid}/link`, { product_ref: f.products.liquidA, reason: "misma etiqueta", confirmed: true });
      expect(linked.status).toBe(200);
      expect(linked.body.changed).toBe(true);
      expect(linked.body.request).toMatchObject({
        status: "LINKED",
        pending_note: null,
        resolution: { kind: "LINKED_EXISTING", product_ref: f.products.liquidA, product_name: "Herbicida sintético", base_unit: "ML" },
      });
      const same = await post(admin, `${sid}/link`, { product_ref: f.products.liquidA, reason: "otra vez", confirmed: true });
      expect([same.status, same.body.changed]).toEqual([200, false]);

      const second = (await prisma.product.create({ data: { tenantId: f.tenantA, name: "Herbicida sintético 480", unit: "L" } })).id;
      const relinked = await post(admin, `${sid}/link`, { product_ref: second, reason: "era la concentración 480", confirmed: true });
      expect(relinked.body.request.resolution.product_ref).toBe(second);
      expect((await post(director, `${sid}/defer`, { note: "x", confirmed: true })).body).toEqual({ errorCode: "REQUEST_ALREADY_LINKED" });

      const history: Res = await http().get(`${BASE}/${sid}/history`).set("Authorization", auth(director));
      expect(history.status).toBe(200);
      expect(history.body.events.map((e: any) => e.kind)).toEqual(["RECEIVED", "NOTE", "LINKED", "RELINKED"]);
      expect(history.body.events[0].actor).toBeNull();
      expect(history.body.events[2]).toMatchObject({ actor: { name: directorUser.name }, product_ref: f.products.liquidA, detail: "misma etiqueta" });
      expectNoFarmerIdentity(history.body);

      const audits = await prisma.auditLog.findMany({ where: { entityName: "ProductIdentificationRequest", entityId: sid }, orderBy: { createdAt: "asc" } });
      expect(audits).toHaveLength(3);
      for (const audit of audits) {
        expect(audit).toMatchObject({ tenantId: f.tenantA, action: "OTRO", ownerUserId: null, campaignId: null });
        expectNoFarmerIdentity({ summary: audit.summary, metadata: audit.metadata, before: audit.before, after: audit.after });
      }
      expect(audits[1]).toMatchObject({ actorUserId: directorUser.id });

      // The farmer sees the identification, never who decided.
      const own: Res = await http().get(BASE).set("Authorization", auth(farmerA));
      const mine = own.body.requests.find((r: any) => r.request_id === id);
      expect(mine.resolution).toMatchObject({ kind: "LINKED_EXISTING", product_ref: second, product_name: "Herbicida sintético 480", unit: "L" });
      expect(JSON.stringify(mine)).not.toContain(directorUser.name);
    });

    it("create-product: name taken (case-insensitive), concurrent creations serialised, product and link in one step", async () => {
      const clientId = randomUUID();
      await put(farmerA2, clientId, data({ local_name: "Coadyuvante raro", unit: "KG" }));
      const target = await serverId(clientId);
      const taken = await post(director, `${target}/create-product`, { name: "fungicida SINTÉTICO", reason: "nuevo", confirmed: true });
      expect([taken.status, taken.body]).toEqual([409, { errorCode: "PRODUCT_NAME_TAKEN" }]);
      const exact = await post(director, `${target}/create-product`, { name: "Fungicida sintético", reason: "nuevo", confirmed: true });
      expect([exact.status, exact.body]).toEqual([409, { errorCode: "PRODUCT_NAME_TAKEN" }]);

      const [a, b] = await Promise.all([
        post(director, `${target}/create-product`, { name: "Coadyuvante Agrosur", active_ingredient: "Aceite", reason: "no existía", confirmed: true }),
        post(admin, `${target}/create-product`, { name: "Coadyuvante Agrosur", reason: "no existía", confirmed: true }),
      ]);
      expect([a.status, b.status].sort()).toEqual([201, 409]);
      const ok = a.status === 201 ? a : b;
      expect(ok.body.request).toMatchObject({ status: "LINKED", resolution: { kind: "CREATED_PRODUCT", product_ref: ok.body.product_ref, unit: "KG", base_unit: "G" } });
      const product = await prisma.product.findUniqueOrThrow({ where: { id: ok.body.product_ref } });
      expect(product).toMatchObject({ tenantId: f.tenantA, name: "Coadyuvante Agrosur", unit: "KG", isActive: true });
      expect(await prisma.product.count({ where: { tenantId: f.tenantA, name: "Coadyuvante Agrosur" } })).toBe(1);
      const events = await prisma.productIdentificationEvent.findMany({ where: { requestId: target }, orderBy: { at: "asc" } });
      expect(events.map((e) => e.kind)).toEqual(["RECEIVED", "PRODUCT_CREATED"]);
      expect(await prisma.auditLog.count({ where: { entityId: target } })).toBe(1);
    });

    it("the database keeps the history and the state coherent", async () => {
      const event = await prisma.productIdentificationEvent.findFirstOrThrow({ where: { requestId: sid } });
      await expect(prisma.productIdentificationEvent.delete({ where: { id: event.id } })).rejects.toThrow();
      await expect(prisma.productIdentificationEvent.update({ where: { id: event.id }, data: { detail: "x" } })).rejects.toThrow();
      await expect(
        prisma.productIdentificationRequest.update({ where: { id: sid }, data: { productId: null } }),
      ).rejects.toThrow();
      await expect(
        prisma.$executeRawUnsafe(`UPDATE "ProductIdentificationRequest" SET "unit" = 'GL' WHERE "id" = '${sid}'`),
      ).rejects.toThrow();
    });
  });

  describe("§10: photo lifecycle sweep (orphans, staging leftovers, retention after the link)", () => {
    const post = (session: TestSession, path: string, body: unknown): Promise<Res> =>
      http().post(`${BASE}/${path}`).set("Authorization", auth(session)).send(body as object);
    const twoDaysAgo = () => new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

    function plant(area: "objects" | "staging", name: string, at: Date) {
      mkdirSync(join(photoDir, area), { recursive: true });
      const path = join(photoDir, area, name);
      writeFileSync(path, Buffer.from("resto sintetico"));
      utimesSync(path, at, at);
    }

    it("removes old orphans and staging leftovers, purges photos linked past the retention, keeps pending ones", async () => {
      const linkedId = randomUUID();
      await put(farmerA, linkedId, data({ local_name: "Fungicida con foto vencida" }));
      expect((await putPhoto(farmerA, linkedId, await jpeg(640, 480, { seed: 21 }))).status).toBe(201);
      const linkedSid = await serverId(linkedId);
      const link = await post(director, `${linkedSid}/link`, { product_ref: f.products.liquidA, reason: "misma etiqueta", confirmed: true });
      expect(link.status).toBe(200);
      const linkedKey = (await prisma.productIdentificationRequest.findUniqueOrThrow({ where: { id: linkedSid } })).photoStorageKey!;
      // Time passes: the link decision is 100 days old (default retention 90).
      await prisma.productIdentificationRequest.update({
        where: { id: linkedSid },
        data: { resolvedAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000) },
      });

      const pendingId = randomUUID();
      await put(farmerA, pendingId, data({ local_name: "Acaricida pendiente con foto" }));
      expect((await putPhoto(farmerA, pendingId, await jpeg(640, 480, { seed: 22 }))).status).toBe(201);
      const pendingSid = await serverId(pendingId);
      const pendingKey = (await prisma.productIdentificationRequest.findUniqueOrThrow({ where: { id: pendingSid } })).photoStorageKey!;

      const orphan = randomUUID();
      const youngOrphan = randomUUID();
      const leftover = randomUUID();
      plant("objects", orphan, twoDaysAgo());
      plant("objects", youngOrphan, new Date());
      plant("staging", `${leftover}.0123456789abcdef.part`, twoDaysAgo());
      plant("objects", "nota-del-operador.txt", twoDaysAgo());

      const report = await app.get(ProductPhotoSweep).run();
      expect(report).not.toBeNull();
      expect(report!.retention.removed).toBeGreaterThanOrEqual(1);
      expect(report!.orphans).toMatchObject({ removed: 1, failed: 0 });
      expect(report!.staging).toMatchObject({ removed: 1, failed: 0 });
      expect(report!.foreign).toBe(1);

      const objects = storedObjects();
      expect(objects).not.toContain(orphan);
      expect(objects).not.toContain(linkedKey);
      expect(objects).toContain(youngOrphan);
      expect(objects).toContain(pendingKey);
      expect(objects).toContain("nota-del-operador.txt");
      expect(readdirSync(join(photoDir, "staging"))).toHaveLength(0);

      const linked = await prisma.productIdentificationRequest.findUniqueOrThrow({ where: { id: linkedSid } });
      expect(linked).toMatchObject({
        status: "LINKED",
        photoState: "REMOVED",
        photoStorageKey: null,
        photoSha256: null,
        photoContentType: null,
        photoSizeBytes: null,
        photoWidth: null,
        photoHeight: null,
        photoConsentVersion: "FOTO-1",
      });
      const events = await prisma.productIdentificationEvent.findMany({ where: { requestId: linkedSid }, orderBy: { at: "asc" } });
      expect(events.at(-1)).toMatchObject({ kind: "PHOTO_REMOVED", actorUserId: null, detail: RETENTION_DETAIL });
      const gone: Res = await http().get(`${BASE}/${linkedSid}/photo`).set("Authorization", auth(director));
      expect(gone.status).toBe(404);
      expect(gone.body).toEqual({ errorCode: "PHOTO_NOT_FOUND" });
      const history: Res = await http().get(`${BASE}/${linkedSid}/history`).set("Authorization", auth(director));
      expect(history.body.events.at(-1)).toMatchObject({ kind: "PHOTO_REMOVED", actor: null, detail: RETENTION_DETAIL });

      const pending = await prisma.productIdentificationRequest.findUniqueOrThrow({ where: { id: pendingSid } });
      expect(pending).toMatchObject({ status: "PENDING", photoState: "STORED", photoStorageKey: pendingKey });
      expect((await http().get(`${BASE}/${pendingSid}/photo`).set("Authorization", auth(director))).status).toBe(200);

      // Nothing left to do on a second run.
      const again = await app.get(ProductPhotoSweep).run();
      expect(again).toMatchObject({ retention: { planned: 0 }, orphans: { planned: 0 }, staging: { planned: 0 } });
      rmSync(join(photoDir, "objects", youngOrphan), { force: true });
      rmSync(join(photoDir, "objects", "nota-del-operador.txt"), { force: true });
    });
  });

  /**
   * E1-D14, the author's addition in §11.2 and the retention of §10, checked
   * explicitly (verification of 2026-11-13, §11.4: three test gaps, no code
   * discrepancy). Only test code: the rules are the accepted ones.
   */
  describe("§11.2: what a decision and a photo removal leave untouched; correcting the link renews the retention", () => {
    const DAY_MS = 24 * 60 * 60 * 1000;
    const post = (session: TestSession, path: string, body: unknown): Promise<Res> =>
      http().post(`${BASE}/${path}`).set("Authorization", auth(session)).send(body as object);
    const json = (value: unknown) => JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
    /** The only columns a removal, a replacement or the retention may change. */
    const PHOTO_COLUMNS = [
      "photoState",
      "photoStorageKey",
      "photoSha256",
      "photoContentType",
      "photoSizeBytes",
      "photoWidth",
      "photoHeight",
      "photoStoredAt",
      "photoRemovedAt",
      "updatedAt",
    ];
    const request = (id: string) => prisma.productIdentificationRequest.findUniqueOrThrow({ where: { id } });
    const withoutPhotoColumns = async (id: string) => {
      const copy: Record<string, unknown> = { ...(await request(id)) };
      for (const column of PHOTO_COLUMNS) delete copy[column];
      return copy;
    };

    async function requestWithPhoto(session: TestSession, localName: string, seed: number) {
      const clientId = randomUUID();
      expect((await put(session, clientId, data({ local_name: localName }))).status).toBe(201);
      expect((await putPhoto(session, clientId, await jpeg(640, 480, { seed }))).status).toBe(201);
      return { clientId, sid: await serverId(clientId) };
    }

    describe("E1-D14: published and sealed figures", () => {
      type CollectiveSwitches = { mode: string; sealingEnabled: boolean };
      type SyncSwitches = { keyring: FingerprintKeyring | null; admissionOpen: boolean };
      let restore: () => void = () => undefined;
      const farmers: TestSession[] = [];
      let sealedCampaign: string;
      let openCampaign: string;
      let figureProduct: string;
      let correctedProduct: string;

      beforeAll(async () => {
        // As the F07 suite: provisional disclosure (synthetic data only) and
        // sealing switched on for this block, and a Sync v1 fingerprint key so
        // that the contributions are real publications. Restored afterwards.
        const collective = app.get(CollectiveConfig) as unknown as CollectiveSwitches;
        const sync = app.get(SyncV1Config) as unknown as SyncSwitches;
        const saved = {
          mode: collective.mode,
          sealingEnabled: collective.sealingEnabled,
          keyring: sync.keyring,
          admissionOpen: sync.admissionOpen,
        };
        restore = () => {
          collective.mode = saved.mode;
          collective.sealingEnabled = saved.sealingEnabled;
          sync.keyring = saved.keyring;
          sync.admissionOpen = saved.admissionOpen;
        };
        collective.mode = "PROVISIONAL_SYNTHETIC";
        collective.sealingEnabled = true;
        sync.keyring = FingerprintKeyring.fromEnvironment({ key: randomBytes(32).toString("base64"), version: 1 });
        sync.admissionOpen = true;

        for (let i = 0; i < 3; i += 1) {
          const memberId = randomUUID();
          await prisma.user.create({
            data: {
              tenantId: f.tenantA,
              name: "Agricultor sintético cifras",
              email: `e1-figures-${memberId}@example.test`,
              passwordHash: unusablePasswordHash(),
              role: "AGRICULTOR",
              members: { create: { id: memberId, tenantId: f.tenantA, role: "AGRICULTOR" } },
            },
          });
          farmers.push(await createSession(prisma, jwt, memberId));
        }
        sealedCampaign = randomUUID();
        openCampaign = randomUUID();
        for (const [id, name] of [
          [sealedCampaign, "Campaña sellada cifras"],
          [openCampaign, "Campaña abierta cifras"],
        ]) {
          await prisma.agriculturalCampaign.create({
            data: { id: id!, tenantId: f.tenantA, name: name!, status: "ABIERTA", isActive: true, startDate: new Date("2026-09-01T00:00:00.000Z") },
          });
        }
        const suffix = randomUUID().slice(0, 6);
        figureProduct = (await prisma.product.create({ data: { tenantId: f.tenantA, name: `Herbicida de las cifras ${suffix}`, unit: "L" } })).id;
        correctedProduct = (await prisma.product.create({ data: { tenantId: f.tenantA, name: `Herbicida corregido ${suffix}`, unit: "L" } })).id;
      }, 60000);

      afterAll(() => restore());

      async function publish(session: TestSession, campaignId: string, projectionType: string, productId: string, quantity: string) {
        const res: Res = await http()
          .post("/api/v1/sync/v1/push")
          .set("Content-Type", "application/json")
          .set("Authorization", auth(session))
          .send(
            JSON.stringify({
              contractVersion: 1,
              operationId: randomUUID(),
              projectionType,
              action: "PUBLISH",
              causal: { predecessorOperationId: null, reconciliationReference: null },
              payload: { campaign_ref: campaignId, product_ref: productId, base_unit: "ML", quantity_base: quantity },
            }),
          );
        expect([res.status, res.body.outcome]).toEqual([200, "APPLIED"]);
      }

      /** What the Directiva is served: seal, cells and coverage of a campaign. */
      async function served(campaignId: string) {
        const res: Res = await http().get(`/api/v1/collective/campaigns/${campaignId}/summary`).set("Authorization", auth(director));
        expect(res.status).toBe(200);
        return { seal: res.body.seal, cells: res.body.cells, coverage: res.body.coverage };
      }

      /** Every row behind a published or sealed figure, complete. */
      async function figures() {
        const [contributions, journal, disputes, releases, items, seals, entries, coverage, associations, products] = await Promise.all([
          prisma.syncV1Contribution.findMany({ orderBy: { id: "asc" } }),
          prisma.syncV1OperationJournal.findMany({ orderBy: { id: "asc" } }),
          prisma.syncV1Dispute.findMany({ orderBy: { id: "asc" } }),
          prisma.collectiveRelease.findMany({ orderBy: { id: "asc" } }),
          prisma.collectiveReleaseItem.findMany({ orderBy: [{ releaseId: "asc" }, { contributionId: "asc" }] }),
          prisma.collectiveSeal.findMany({ orderBy: { id: "asc" } }),
          prisma.collectiveSealEntry.findMany({
            orderBy: [{ sealId: "asc" }, { projectionType: "asc" }, { canonicalProductId: "asc" }, { baseUnit: "asc" }],
          }),
          prisma.collectiveSealConsumptionCoverage.findMany({ orderBy: { sealId: "asc" } }),
          prisma.productCanonicalAssociation.findMany({ orderBy: { id: "asc" } }),
          prisma.product.findMany({ where: { id: { in: [figureProduct, correctedProduct] } }, orderBy: { id: "asc" } }),
        ]);
        return {
          counts: { contributions: contributions.length, releases: releases.length, items: items.length, seals: seals.length, entries: entries.length },
          text: json({ contributions, journal, disputes, releases, items, seals, entries, coverage, associations, products }),
        };
      }

      it("defer, link, correct the link and create a product change no contribution, disclosure or seal", async () => {
        const quantities = ["1000", "2000", "3000"];
        for (const [i, session] of farmers.entries()) {
          for (const campaignId of [sealedCampaign, openCampaign]) {
            await publish(session, campaignId, "DECLARED_NEED", figureProduct, quantities[i]!);
            await publish(session, campaignId, "CONSUMPTION_TOTAL", figureProduct, String(100 * (i + 1)));
          }
        }
        // The open campaign publishes its figures (the summary writes the release).
        const open = await served(openCampaign);
        const disclosed = (open.cells as any[]).filter((cell) => cell.status === "DISCLOSED").map((c) => [c.projection_type, c.total_base]);
        expect(disclosed.sort()).toEqual([
          ["CONSUMPTION_TOTAL", "600"],
          ["DECLARED_NEED", "6000"],
        ]);
        // The other campaign is closed and sealed.
        await served(sealedCampaign);
        expect((await http().post(`/api/v1/campaigns/${sealedCampaign}/close`).set("Authorization", auth(director)).send({})).status).toBe(200);
        const state: Res = await http().get(`/api/v1/collective/campaigns/${sealedCampaign}/seal`).set("Authorization", auth(director));
        expect(state.body.can_seal).toBe(true);
        const sealed: Res = await http()
          .post(`/api/v1/collective/campaigns/${sealedCampaign}/seal`)
          .set("Authorization", auth(director))
          .send({ confirmed: true, review_ref: state.body.review.review_ref });
        expect([sealed.status, sealed.body.state, sealed.body.created]).toEqual([200, "SEALED", true]);

        const servedBefore = json({ sealed: await served(sealedCampaign), open: await served(openCampaign) });
        expect(servedBefore).toContain('"total_base":"6000"');
        const before = await figures();
        expect(before.counts.contributions).toBeGreaterThanOrEqual(12);
        expect(before.counts.releases).toBeGreaterThanOrEqual(4);
        expect(before.counts.items).toBeGreaterThanOrEqual(12);
        expect(before.counts.seals).toBe(1);
        expect(before.counts.entries).toBeGreaterThanOrEqual(2);
        const auditsBefore = await prisma.auditLog.count();

        // A contributor asks to identify a product; the Directiva and the
        // Administrador decide every way the contract allows.
        const asked = randomUUID();
        expect((await put(farmers[0]!, asked, data({ local_name: "Herbicida de las cifras", active_ingredient: null }))).status).toBe(201);
        const sid = await serverId(asked);
        expect((await post(director, `${sid}/defer`, { note: "Falta la foto del envase", confirmed: true })).status).toBe(200);
        const linked = await post(director, `${sid}/link`, { product_ref: figureProduct, reason: "misma etiqueta", confirmed: true });
        expect([linked.status, linked.body.changed]).toEqual([200, true]);
        const corrected = await post(admin, `${sid}/link`, { product_ref: correctedProduct, reason: "era otra concentración", confirmed: true });
        expect([corrected.status, corrected.body.request.resolution.product_ref]).toEqual([200, correctedProduct]);
        const other = randomUUID();
        expect((await put(farmers[1]!, other, data({ local_name: "Adherente fuera del catálogo" }))).status).toBe(201);
        const created = await post(director, `${await serverId(other)}/create-product`, {
          name: `Adherente nuevo ${randomUUID().slice(0, 6)}`,
          reason: "no existía",
          confirmed: true,
        });
        expect([created.status, created.body.request.resolution.kind]).toEqual([201, "CREATED_PRODUCT"]);
        // The decisions were recorded (E1-D13): 4 AuditLog entries, nothing else.
        expect(await prisma.auditLog.count()).toBe(auditsBefore + 4);

        expect((await figures()).text).toBe(before.text);
        // The Directiva is served the same figures and seal, and serving them
        // did not need to write a new disclosure.
        expect(json({ sealed: await served(sealedCampaign), open: await served(openCampaign) })).toBe(servedBefore);
        expect((await figures()).text).toBe(before.text);

        // Control: the snapshot does see a real change in the figures.
        await publish(farmerA, openCampaign, "DECLARED_NEED", figureProduct, "4000");
        expect((await figures()).text).not.toBe(before.text);
      }, 120000);
    });

    it("removing, uploading again, replacing and the retention keep the whole resolution, its AuditLog and the earlier events", async () => {
      const { clientId, sid } = await requestWithPhoto(farmerA2, "Insecticida resuelto con foto", 41);
      expect((await post(director, `${sid}/defer`, { note: "La foto está borrosa", confirmed: true })).status).toBe(200);
      const link = await post(director, `${sid}/link`, { product_ref: f.products.liquidA, reason: "misma etiqueta", confirmed: true });
      expect(link.status).toBe(200);

      const directorUserId = (await prisma.member.findUniqueOrThrow({ where: { id: f.members.directorA } })).userId;
      const resolution = await withoutPhotoColumns(sid);
      expect(resolution).toMatchObject({
        status: "LINKED",
        resolution: "LINKED_EXISTING",
        productId: f.products.liquidA,
        resolvedByUserId: directorUserId,
        resolutionReason: "misma etiqueta",
        photoConsentVersion: "FOTO-1",
      });
      expect(resolution["resolvedAt"]).toBeInstanceOf(Date);
      const resolvedAt = resolution["resolvedAt"] as Date;
      const auditOf = () =>
        prisma.auditLog.findMany({
          where: { entityName: "ProductIdentificationRequest", entityId: sid },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        });
      const eventsOf = () => prisma.productIdentificationEvent.findMany({ where: { requestId: sid } });
      const audits = await auditOf();
      expect(audits).toHaveLength(2);
      expect(audits.every((a) => a.actorUserId === directorUserId)).toBe(true);
      const auditTotal = await prisma.auditLog.count();
      let events = await eventsOf();
      expect(events.map((e) => e.kind).sort()).toEqual(["LINKED", "NOTE", "PHOTO_RECEIVED", "RECEIVED"]);

      /** Only the photo columns changed, and exactly one event was added. */
      async function expectKept(kind: string, detail: string | null = null) {
        expect(await withoutPhotoColumns(sid)).toEqual(resolution);
        expect(await auditOf()).toEqual(audits);
        expect(await prisma.auditLog.count()).toBe(auditTotal);
        const now = await eventsOf();
        const earlier = new Set(events.map((e) => e.id));
        for (const event of events) expect(now.find((e) => e.id === event.id)).toEqual(event);
        const added = now.filter((e) => !earlier.has(e.id));
        expect(added).toEqual([expect.objectContaining({ kind, actorUserId: null, productId: null, detail })]);
        events = now;
        const own: Res = await http().get(BASE).set("Authorization", auth(farmerA2));
        expect(own.body.requests.find((r: any) => r.request_id === clientId).resolution).toMatchObject({
          kind: "LINKED_EXISTING",
          product_ref: f.products.liquidA,
        });
        const list: Res = await http().get(`${BASE}?status=ALL`).set("Authorization", auth(director));
        expect(list.body.requests.find((r: any) => r.id === sid)).toMatchObject({
          status: "LINKED",
          resolution: { kind: "LINKED_EXISTING", product_ref: f.products.liquidA },
        });
      }

      expect((await http().delete(`${BASE}/${clientId}/photo`).set("Authorization", auth(farmerA2))).status).toBe(204);
      expect(await request(sid)).toMatchObject({ photoState: "REMOVED", photoStorageKey: null });
      await expectKept("PHOTO_REMOVED");

      expect((await putPhoto(farmerA2, clientId, await jpeg(640, 480, { seed: 42 }))).status).toBe(201);
      expect(await request(sid)).toMatchObject({ photoState: "STORED" });
      await expectKept("PHOTO_RECEIVED");

      const replacedKey = (await request(sid)).photoStorageKey;
      expect((await putPhoto(farmerA2, clientId, await png(800, 600))).status).toBe(201);
      const stored = await request(sid);
      expect(stored).toMatchObject({ photoState: "STORED", photoContentType: "image/png" });
      expect(stored.photoStorageKey).not.toBe(replacedKey);
      await expectKept("PHOTO_REPLACED");

      // The retention: 91 days after the link decision.
      await app.get(ProductPhotoSweep).run({ now: new Date(resolvedAt.getTime() + 91 * DAY_MS) });
      expect(await request(sid)).toMatchObject({ photoState: "REMOVED", photoStorageKey: null });
      expect(storedObjects()).not.toContain(stored.photoStorageKey);
      await expectKept("PHOTO_REMOVED", RETENTION_DETAIL);
    }, 60000);

    it("correcting the link renews the start of the retention: 90 days from the last link decision", async () => {
      const relinked = await requestWithPhoto(farmerA, "Fungicida con vínculo corregido", 51);
      const control = await requestWithPhoto(farmerA, "Fungicida con vínculo sin corregir", 52);
      // t0: both are linked 60 days ago (only Date is faked: the code under
      // test writes resolvedAt = new Date()).
      const t0 = new Date(Date.now() - 60 * DAY_MS);
      jest.useFakeTimers({
        now: t0,
        doNotFake: [
          "hrtime",
          "nextTick",
          "performance",
          "queueMicrotask",
          "requestAnimationFrame",
          "cancelAnimationFrame",
          "requestIdleCallback",
          "cancelIdleCallback",
          "setImmediate",
          "clearImmediate",
          "setInterval",
          "clearInterval",
          "setTimeout",
          "clearTimeout",
        ],
      });
      try {
        for (const { sid } of [relinked, control]) {
          const res = await post(director, `${sid}/link`, { product_ref: f.products.liquidA, reason: "misma etiqueta", confirmed: true });
          expect(res.status).toBe(200);
        }
      } finally {
        jest.useRealTimers();
      }
      expect((await request(relinked.sid)).resolvedAt).toEqual(t0);
      expect((await request(control.sid)).resolvedAt).toEqual(t0);

      // t1 (now): the Administrador corrects one of them.
      const second = (await prisma.product.create({ data: { tenantId: f.tenantA, name: `Fungicida 250 ${randomUUID().slice(0, 6)}`, unit: "L" } })).id;
      const corrected = await post(admin, `${relinked.sid}/link`, { product_ref: second, reason: "era la concentración 250", confirmed: true });
      expect([corrected.status, corrected.body.changed]).toEqual([200, true]);
      const afterCorrection = await request(relinked.sid);
      const t1 = afterCorrection.resolvedAt!;
      expect(t1.getTime() - t0.getTime()).toBeGreaterThanOrEqual(60 * DAY_MS);
      const key = afterCorrection.photoStorageKey!;
      const controlKey = (await request(control.sid)).photoStorageKey!;
      const sweep = app.get(ProductPhotoSweep);

      // t0 + 91 days: past the retention for the first link, 31 days after the correction.
      await sweep.run({ now: new Date(t0.getTime() + 91 * DAY_MS) });
      expect(await request(control.sid)).toMatchObject({ status: "LINKED", photoState: "REMOVED", photoStorageKey: null, resolvedAt: t0 });
      expect(storedObjects()).not.toContain(controlKey);
      expect(await request(relinked.sid)).toMatchObject({ status: "LINKED", productId: second, resolvedAt: t1, photoState: "STORED", photoStorageKey: key });
      expect(storedObjects()).toContain(key);
      expect((await http().get(`${BASE}/${relinked.sid}/photo`).set("Authorization", auth(director))).status).toBe(200);

      // t1 + 91 days: past the retention for the correction too.
      await sweep.run({ now: new Date(t1.getTime() + 91 * DAY_MS) });
      expect(await request(relinked.sid)).toMatchObject({ status: "LINKED", productId: second, resolvedAt: t1, photoState: "REMOVED", photoStorageKey: null });
      expect(storedObjects()).not.toContain(key);
      const events = await prisma.productIdentificationEvent.findMany({ where: { requestId: relinked.sid } });
      expect(events.filter((e) => e.kind === "PHOTO_REMOVED")).toEqual([expect.objectContaining({ actorUserId: null, detail: RETENTION_DETAIL })]);
    }, 60000);
  });
});
