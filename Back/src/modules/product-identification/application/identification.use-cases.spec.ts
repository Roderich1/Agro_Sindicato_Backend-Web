import { afterEach, beforeEach } from "@jest/globals";
import { ConflictException, Logger } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { IdentificationHttpError } from "../domain/identification-error";
import { FakeIdentificationPrisma } from "../test-support/fake-identification-prisma";
import { InMemoryPhotoStorage } from "../test-support/in-memory-photo-storage";
import { jpeg, png } from "../test-support/images";
import { FarmerIdentificationUseCase, parsePhotoHeaders } from "./farmer-identification.use-case";
import { InstitutionalIdentificationUseCase } from "./institutional-identification.use-case";

const TENANT = "tenant-a";
const OTHER_TENANT = "tenant-b";
const FARMER = { tenantId: TENANT, memberId: "member-1" };
const FARMER_2 = { tenantId: TENANT, memberId: "member-2" };
const DIRECTOR = "user-director";

function uuid4() {
  return randomUUID();
}

const body = (overrides: Record<string, unknown> = {}) => ({
  contractVersion: 1,
  local_name: "  Glifosato 480 Agroquímicos del Sur ",
  active_ingredient: "Glifosato",
  unit: "L",
  photo_consent: { version: "FOTO-1", accepted_at: "2026-11-11T18:20:00.000Z" },
  ...overrides,
});

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof IdentificationHttpError) return `${error.status} ${error.errorCode}`;
    throw error;
  }
  return "resolved";
}

function sha(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

function upload(bytes: Buffer, overrides: Partial<{ contentType: string; contentLength: string; sha256: string }> = {}) {
  return {
    headers: {
      contentType: "application/octet-stream",
      contentLength: String(bytes.length),
      sha256: sha(bytes),
      ...overrides,
    },
    stream: Readable.from([bytes]),
  };
}

describe("E1 farmer identification use case", () => {
  let prisma: FakeIdentificationPrisma;
  let storage: InMemoryPhotoStorage;
  let farmer: FarmerIdentificationUseCase;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    prisma = new FakeIdentificationPrisma();
    storage = new InMemoryPhotoStorage();
    farmer = new FarmerIdentificationUseCase(prisma as any, storage);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("creates once, then answers the current state (idempotent) under the tenant lock", async () => {
    const id = uuid4();
    const first = await farmer.upsert(FARMER, id, body());
    expect(first.created).toBe(true);
    expect(first.view).toMatchObject({
      request_id: id,
      status: "PENDING",
      local_name: "Glifosato 480 Agroquímicos del Sur",
      unit: "L",
      base_unit: "ML",
      photo: { state: "NONE", sha256: null, consent_version: "FOTO-1" },
    });
    const again = await farmer.upsert(FARMER, id, body());
    expect(again.created).toBe(false);
    expect(prisma.requests).toHaveLength(1);
    expect(prisma.events.map((e) => e.kind)).toEqual(["RECEIVED"]);
    expect(prisma.events.every((e) => e.actorUserId === null)).toBe(true);
    expect(prisma.locks).toEqual([`product-identification:${TENANT}`, `product-identification:${TENANT}`]);
    expect(prisma.audits).toHaveLength(0);
  });

  it("updates name or ingredient while PENDING with an UPDATED event; keeps the consent", async () => {
    const id = uuid4();
    await farmer.upsert(FARMER, id, body());
    const result = await farmer.upsert(FARMER, id, body({ local_name: "Glifosato 480", photo_consent: null }));
    expect(result.view.local_name).toBe("Glifosato 480");
    expect(result.view.photo.consent_version).toBe("FOTO-1");
    expect(prisma.events.map((e) => e.kind)).toEqual(["RECEIVED", "UPDATED"]);
  });

  it("unit is immutable, other units are unsupported, ids are UUID v4 lowercase", async () => {
    const id = uuid4();
    await farmer.upsert(FARMER, id, body());
    expect(await code(farmer.upsert(FARMER, id, body({ unit: "KG" })))).toBe("409 UNIT_IMMUTABLE");
    expect(await code(farmer.upsert(FARMER, uuid4(), body({ unit: "kg" })))).toBe("422 UNIT_UNSUPPORTED");
    expect(await code(farmer.upsert(FARMER, id.toUpperCase(), body()))).toBe("400 PAYLOAD_INVALID");
    expect(await code(farmer.upsert(FARMER, uuid4(), body({ local_name: "   " })))).toBe("400 PAYLOAD_INVALID");
    expect(await code(farmer.upsert(FARMER, uuid4(), body({ local_name: "x".repeat(121) })))).toBe("400 PAYLOAD_INVALID");
  });

  it("a request_id of another Member of the tenant is a conflict; another tenant's is not", async () => {
    const id = uuid4();
    await farmer.upsert(FARMER, id, body());
    expect(await code(farmer.upsert(FARMER_2, id, body()))).toBe("409 REQUEST_ID_CONFLICT");
    expect((await farmer.upsert({ tenantId: OTHER_TENANT, memberId: "member-9" }, id, body())).created).toBe(true);
  });

  it("a LINKED request does not change", async () => {
    const id = uuid4();
    await farmer.upsert(FARMER, id, body());
    prisma.products.push({ id: "p-1", tenantId: TENANT, name: "Glifosato 48 SL", unit: "L", isActive: true });
    Object.assign(prisma.requests[0], {
      status: "LINKED",
      resolution: "LINKED_EXISTING",
      productId: "p-1",
      resolvedAt: new Date(),
    });
    const result = await farmer.upsert(FARMER, id, body({ local_name: "Otro nombre" }));
    expect(result.view.local_name).toBe("Glifosato 480 Agroquímicos del Sur");
    expect(result.view.resolution).toMatchObject({ product_ref: "p-1", product_name: "Glifosato 48 SL" });
  });

  describe("photo", () => {
    let id: string;
    beforeEach(async () => {
      id = uuid4();
      await farmer.upsert(FARMER, id, body());
    });

    it("stores a valid JPEG, answers the same SHA-256 as a no-op and replaces removing the old object", async () => {
      const first = jpeg(1600, 1200);
      const a = upload(first);
      const stored = await farmer.storePhoto(FARMER, id, a.headers, a.stream);
      expect(stored.created).toBe(true);
      expect(stored.view.photo).toEqual({ state: "STORED", sha256: sha(first), consent_version: "FOTO-1" });
      expect(storage.objects.size).toBe(1);
      const oldKey = prisma.requests[0].photoStorageKey;

      const same = upload(first);
      const again = await farmer.storePhoto(FARMER, id, same.headers, same.stream);
      expect(again.created).toBe(false);
      expect(prisma.requests[0].photoStorageKey).toBe(oldKey);
      expect(storage.staging.size).toBe(0);

      const second = png(800, 600);
      const b = upload(second);
      const replaced = await farmer.storePhoto(FARMER, id, b.headers, b.stream);
      expect(replaced.view.photo.sha256).toBe(sha(second));
      expect(storage.objects.has(oldKey)).toBe(false);
      expect(storage.objects.size).toBe(1);
      expect(prisma.requests[0]).toMatchObject({ photoContentType: "image/png", photoWidth: 800, photoHeight: 600 });
      expect(prisma.events.map((e) => e.kind)).toEqual(["RECEIVED", "PHOTO_RECEIVED", "PHOTO_REPLACED"]);
    });

    it("refuses a fake type, wrong dimensions and a hash mismatch, keeping nothing", async () => {
      const text = Buffer.from("esto no es una imagen, aunque se llame etiqueta.jpg");
      const fake = upload(text);
      expect(await code(farmer.storePhoto(FARMER, id, fake.headers, fake.stream))).toBe("422 IMAGE_INVALID");
      const tiny = upload(jpeg(32, 32));
      expect(await code(farmer.storePhoto(FARMER, id, tiny.headers, tiny.stream))).toBe("422 IMAGE_INVALID");
      const bytes = jpeg(800, 600);
      const mismatch = upload(bytes, { sha256: "0".repeat(64) });
      expect(await code(farmer.storePhoto(FARMER, id, mismatch.headers, mismatch.stream))).toBe("422 CONTENT_HASH_MISMATCH");
      expect(storage.objects.size).toBe(0);
      expect(storage.staging.size).toBe(0);
      expect(prisma.requests[0].photoState).toBe("NONE");
    });

    it("needs a registered consent and an own request", async () => {
      const noConsent = uuid4();
      await farmer.upsert(FARMER, noConsent, body({ photo_consent: null }));
      const a = upload(jpeg(800, 600));
      expect(await code(farmer.storePhoto(FARMER, noConsent, a.headers, a.stream))).toBe("409 PHOTO_CONSENT_REQUIRED");
      const b = upload(jpeg(800, 600));
      expect(await code(farmer.storePhoto(FARMER_2, id, b.headers, b.stream))).toBe("404 REQUEST_NOT_FOUND");
    });

    it("removal deletes the binary first and is idempotent", async () => {
      const a = upload(jpeg(800, 600));
      await farmer.storePhoto(FARMER, id, a.headers, a.stream);
      storage.removeFailures = 1;
      expect(await code(farmer.removePhoto(FARMER, id))).toBe("503 PHOTO_STORAGE_UNAVAILABLE");
      expect(prisma.requests[0].photoState).toBe("STORED");
      await farmer.removePhoto(FARMER, id);
      await farmer.removePhoto(FARMER, id);
      expect(storage.objects.size).toBe(0);
      expect(prisma.requests[0]).toMatchObject({ photoState: "REMOVED", photoStorageKey: null, photoSha256: null });
      expect(prisma.events.filter((e) => e.kind === "PHOTO_REMOVED")).toHaveLength(1);
    });

    it("without storage the photo routes are 503 and the data route still works", async () => {
      const withoutStorage = new FarmerIdentificationUseCase(prisma as any, null);
      const a = upload(jpeg(800, 600));
      expect(await code(withoutStorage.storePhoto(FARMER, id, a.headers, a.stream))).toBe("503 PHOTO_STORAGE_UNAVAILABLE");
      expect(await code(withoutStorage.removePhoto(FARMER, id))).toBe("503 PHOTO_STORAGE_UNAVAILABLE");
      expect((await withoutStorage.upsert(FARMER, uuid4(), body())).created).toBe(true);
    });
  });

  it("checks upload headers before reading the body", () => {
    const ok = { contentType: "application/octet-stream", contentLength: "10", sha256: "a".repeat(64) };
    expect(parsePhotoHeaders(ok)).toEqual({ length: 10, sha256: "a".repeat(64) });
    const failing = (headers: typeof ok | Record<string, string | undefined>) => {
      try {
        parsePhotoHeaders(headers as typeof ok);
      } catch (error) {
        return `${(error as IdentificationHttpError).status} ${(error as IdentificationHttpError).errorCode}`;
      }
      return "ok";
    };
    expect(failing({ ...ok, contentType: "image/jpeg" })).toBe("415 UNSUPPORTED_MEDIA_TYPE");
    expect(failing({ ...ok, contentLength: undefined })).toBe("413 IMAGE_TOO_LARGE");
    expect(failing({ ...ok, contentLength: String(2 * 1024 * 1024 + 1) })).toBe("413 IMAGE_TOO_LARGE");
    expect(failing({ ...ok, contentLength: "0" })).toBe("422 IMAGE_INVALID");
    expect(failing({ ...ok, sha256: "A".repeat(64) })).toBe("400 PAYLOAD_INVALID");
  });
});

describe("E1 institutional identification use case", () => {
  let prisma: FakeIdentificationPrisma;
  let institutional: InstitutionalIdentificationUseCase;
  let farmer: FarmerIdentificationUseCase;
  let catalogCreate: jest.Mock;
  let requestId: string;

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    prisma = new FakeIdentificationPrisma();
    catalogCreate = jest.fn(async (tenantId: string, dto: any) => {
      const product = { id: randomUUID(), tenantId, name: dto.name, unit: dto.unit, isActive: true, activeIngredient: dto.activeIngredient ?? null };
      prisma.products.push(product);
      return product;
    });
    institutional = new InstitutionalIdentificationUseCase(prisma as any, { create: catalogCreate } as any, null);
    farmer = new FarmerIdentificationUseCase(prisma as any, null);
    await farmer.upsert(FARMER, uuid4(), body());
    requestId = prisma.requests[0].id;
    prisma.products.push(
      { id: "liquid", tenantId: TENANT, name: "Glifosato 48 SL", unit: "L", isActive: true, activeIngredient: "Glifosato" },
      { id: "solid", tenantId: TENANT, name: "Glifosato granulado", unit: "kg", isActive: true, activeIngredient: null },
      { id: "retired", tenantId: TENANT, name: "Glifosato viejo", unit: "L", isActive: false, activeIngredient: null },
      { id: "liquid-2", tenantId: TENANT, name: "Glifosato 480", unit: "L", isActive: true, activeIngredient: null },
      { id: "foreign", tenantId: OTHER_TENANT, name: "Glifosato B", unit: "L", isActive: true, activeIngredient: null },
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("requires confirmation and a reason of 1-280 characters", async () => {
    expect(await code(institutional.link(TENANT, DIRECTOR, requestId, { product_ref: "liquid", reason: "x" }))).toBe("422 CONFIRMATION_REQUIRED");
    expect(await code(institutional.link(TENANT, DIRECTOR, requestId, { product_ref: "liquid", reason: " ", confirmed: true }))).toBe("422 REASON_REQUIRED");
    expect(await code(institutional.link(TENANT, DIRECTOR, requestId, { product_ref: "liquid", reason: "x".repeat(281), confirmed: true }))).toBe("422 REASON_REQUIRED");
    expect(await code(institutional.defer(TENANT, DIRECTOR, requestId, { note: "", confirmed: true }))).toBe("422 REASON_REQUIRED");
  });

  it("refuses foreign, inactive and other-dimension products, and other tenants' requests", async () => {
    const link = (product_ref: string, tenant = TENANT) =>
      code(institutional.link(tenant, DIRECTOR, requestId, { product_ref, reason: "misma etiqueta", confirmed: true }));
    expect(await link("foreign")).toBe("404 PRODUCT_NOT_FOUND");
    expect(await link("retired")).toBe("422 PRODUCT_INACTIVE");
    expect(await link("solid")).toBe("422 UNIT_DIMENSION_MISMATCH");
    expect(await link("liquid", OTHER_TENANT)).toBe("404 REQUEST_NOT_FOUND");
    expect(prisma.audits).toHaveLength(0);
  });

  it("links, answers changed:false for the same link, relinks; events and AuditLog without the farmer", async () => {
    const first = await institutional.link(TENANT, DIRECTOR, requestId, { product_ref: "liquid", reason: "misma etiqueta", confirmed: true });
    expect(first.changed).toBe(true);
    expect(first.request).toMatchObject({ status: "LINKED", resolution: { kind: "LINKED_EXISTING", product_ref: "liquid" } });
    const same = await institutional.link(TENANT, DIRECTOR, requestId, { product_ref: "liquid", reason: "otra vez", confirmed: true });
    expect(same.changed).toBe(false);
    await institutional.link(TENANT, DIRECTOR, requestId, { product_ref: "liquid-2", reason: "era la de 480", confirmed: true });
    const decisions = prisma.events.filter((e) => e.actorUserId !== null);
    expect(decisions.map((e) => [e.kind, e.productId, e.actorUserId])).toEqual([
      ["LINKED", "liquid", DIRECTOR],
      ["RELINKED", "liquid-2", DIRECTOR],
    ]);
    expect(prisma.audits).toHaveLength(2);
    for (const audit of prisma.audits) {
      expect(audit).toMatchObject({ tenantId: TENANT, actorUserId: DIRECTOR, ownerUserId: null, action: "OTRO", entityName: "ProductIdentificationRequest", entityId: requestId });
      expect(JSON.stringify(audit)).not.toContain(FARMER.memberId);
    }
    const history = await institutional.history(TENANT, requestId);
    expect(history.events[0]).toMatchObject({ kind: "RECEIVED", actor: null });
    expect(history.events.at(-1)).toMatchObject({ kind: "RELINKED", product_ref: "liquid-2", product_name: "Glifosato 480" });
    expect(JSON.stringify(await institutional.list(TENANT, "ALL"))).not.toContain(FARMER.memberId);
  });

  it("creates the product with the request's unit in the same transaction, or answers PRODUCT_NAME_TAKEN", async () => {
    expect(
      await code(institutional.createProduct(TENANT, DIRECTOR, requestId, { name: "glifosato 48 sl", reason: "nuevo", confirmed: true })),
    ).toBe("409 PRODUCT_NAME_TAKEN");
    catalogCreate.mockRejectedValueOnce(new ConflictException("dup"));
    expect(
      await code(institutional.createProduct(TENANT, DIRECTOR, requestId, { name: "Carrera", reason: "nuevo", confirmed: true })),
    ).toBe("409 PRODUCT_NAME_TAKEN");
    const created = await institutional.createProduct(TENANT, DIRECTOR, requestId, {
      name: " Glifosato Agrosur 480 ",
      active_ingredient: "Glifosato",
      reason: "no estaba en el catálogo",
      confirmed: true,
    });
    expect(catalogCreate).toHaveBeenLastCalledWith(TENANT, { name: "Glifosato Agrosur 480", activeIngredient: "Glifosato", unit: "L" }, prisma);
    expect(created.request).toMatchObject({ status: "LINKED", resolution: { kind: "CREATED_PRODUCT", product_ref: created.product_ref } });
    expect(prisma.events.at(-1)).toMatchObject({ kind: "PRODUCT_CREATED", productId: created.product_ref, actorUserId: DIRECTOR });
    expect(prisma.audits.at(-1)?.summary).toContain("Glifosato Agrosur 480");
  });

  it("defers with a note while PENDING; a LINKED request cannot be deferred", async () => {
    const deferred = await institutional.defer(TENANT, DIRECTOR, requestId, { note: "Falta la foto del envase", confirmed: true });
    expect(deferred.request).toMatchObject({ status: "PENDING", pending_note: { text: "Falta la foto del envase" } });
    expect(prisma.events.at(-1)).toMatchObject({ kind: "NOTE", actorUserId: DIRECTOR });
    await institutional.link(TENANT, DIRECTOR, requestId, { product_ref: "liquid", reason: "ya está", confirmed: true });
    expect(prisma.requests[0].pendingNote).toBeNull();
    expect(await code(institutional.defer(TENANT, DIRECTOR, requestId, { note: "otra", confirmed: true }))).toBe("409 REQUEST_ALREADY_LINKED");
  });

  it("candidates are suggestions of the same dimension and write nothing", async () => {
    prisma.associations.push({ tenantId: TENANT, productId: "liquid-2", canonicalProductId: "liquid", validTo: null });
    const before = JSON.stringify({ r: prisma.requests, e: prisma.events, a: prisma.audits });
    const { candidates } = await institutional.candidates(TENANT, requestId);
    expect(candidates.map((c) => c.product_ref)).toEqual(expect.arrayContaining(["liquid", "liquid-2"]));
    expect(candidates.map((c) => c.product_ref)).not.toContain("solid");
    expect(candidates.map((c) => c.product_ref)).not.toContain("retired");
    expect(candidates.map((c) => c.product_ref)).not.toContain("foreign");
    expect(candidates.find((c) => c.product_ref === "liquid-2")).toMatchObject({ is_alias: true, canonical_product_ref: "liquid" });
    expect(JSON.stringify({ r: prisma.requests, e: prisma.events, a: prisma.audits })).toBe(before);
    expect(prisma.locks).toHaveLength(1);
  });

  it("the photo route is 503 without storage", async () => {
    expect(await code(institutional.photo(TENANT, requestId))).toBe("503 PHOTO_STORAGE_UNAVAILABLE");
  });
});
