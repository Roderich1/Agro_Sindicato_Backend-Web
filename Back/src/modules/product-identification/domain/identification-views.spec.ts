import { toFarmerView, toHistoryEntry, toInstitutionalView } from "./identification-views";

const MEMBER_ID = "11111111-1111-4111-8111-111111111111";
const TENANT_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";

/** A full database row, with every identity field the views must drop. */
function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    tenantId: TENANT_ID,
    memberId: MEMBER_ID,
    clientRequestId: "7f4b1c2e-9d3a-4f61-8b2c-0e5a6d7c8b9a",
    localName: "Glifosato 480 Agroquímicos del Sur",
    activeIngredient: "Glifosato",
    unit: "L",
    baseUnit: "ML" as const,
    status: "LINKED" as const,
    resolution: "LINKED_EXISTING" as const,
    productId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    resolvedByUserId: USER_ID,
    resolvedAt: new Date("2026-11-12T09:00:00.000Z"),
    resolutionReason: "misma etiqueta",
    pendingNote: null,
    pendingNoteByUserId: null,
    pendingNoteAt: null,
    photoState: "STORED" as const,
    photoStorageKey: "55555555-5555-4555-8555-555555555555",
    photoSha256: "a".repeat(64),
    photoContentType: "image/jpeg",
    photoSizeBytes: 1234,
    photoWidth: 1600,
    photoHeight: 1200,
    photoConsentVersion: "FOTO-1",
    photoConsentAt: new Date("2026-11-11T18:20:00.000Z"),
    photoStoredAt: new Date("2026-11-11T18:21:00.000Z"),
    photoRemovedAt: null,
    receivedAt: new Date("2026-11-11T18:20:05.120Z"),
    updatedAt: new Date("2026-11-12T09:00:00.000Z"),
    product: { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Glifosato 48 SL", unit: "L", isActive: true },
    member: { id: MEMBER_ID, userId: USER_ID, user: { name: "Persona sintética", email: "x@example.test" } },
    ...overrides,
  };
}

describe("E1 views", () => {
  it("the farmer view follows §4.1 and resolves the linked product", () => {
    const view = toFarmerView(row());
    expect(view).toEqual({
      contractVersion: 1,
      request_id: "7f4b1c2e-9d3a-4f61-8b2c-0e5a6d7c8b9a",
      status: "LINKED",
      local_name: "Glifosato 480 Agroquímicos del Sur",
      active_ingredient: "Glifosato",
      unit: "L",
      base_unit: "ML",
      received_at: "2026-11-11T18:20:05.120Z",
      updated_at: "2026-11-12T09:00:00.000Z",
      photo: { state: "STORED", sha256: "a".repeat(64), consent_version: "FOTO-1" },
      resolution: {
        kind: "LINKED_EXISTING",
        product_ref: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        product_name: "Glifosato 48 SL",
        unit: "L",
        base_unit: "ML",
        is_active: true,
        resolved_at: "2026-11-12T09:00:00.000Z",
      },
      pending_note: null,
    });
  });

  it("the institutional view never carries the farmer's identity or the storage key", () => {
    const view = toInstitutionalView(row());
    const serialized = JSON.stringify(view);
    for (const secret of [MEMBER_ID, TENANT_ID, USER_ID, "Persona sintética", "x@example.test", "55555555-5555-4555-8555-555555555555"]) {
      expect(serialized).not.toContain(secret);
    }
    expect(Object.keys(view).sort()).toEqual(
      [
        "active_ingredient",
        "base_unit",
        "contractVersion",
        "id",
        "local_name",
        "pending_note",
        "photo",
        "received_at",
        "request_id",
        "resolution",
        "status",
        "unit",
        "updated_at",
      ].sort(),
    );
    expect(view.photo).toEqual({
      state: "STORED",
      sha256: "a".repeat(64),
      consent_version: "FOTO-1",
      content_type: "image/jpeg",
      width: 1600,
      height: 1200,
      stored_at: "2026-11-11T18:21:00.000Z",
    });
  });

  it("a removed photo shows no hash or metadata; a pending note has no author", () => {
    const view = toInstitutionalView(
      row({
        status: "PENDING",
        resolution: null,
        productId: null,
        product: null,
        resolvedAt: null,
        photoState: "REMOVED",
        photoSha256: null,
        photoStorageKey: null,
        pendingNote: "Falta la foto del envase",
        pendingNoteByUserId: USER_ID,
        pendingNoteAt: new Date("2026-11-12T10:00:00.000Z"),
      }),
    );
    expect(view.photo).toMatchObject({ state: "REMOVED", sha256: null, content_type: null, width: null });
    expect(view.resolution).toBeNull();
    expect(view.pending_note).toEqual({ text: "Falta la foto del envase", at: "2026-11-12T10:00:00.000Z" });
  });

  it("history names the institutional actor only", () => {
    expect(
      toHistoryEntry({
        at: new Date("2026-11-11T18:20:05.120Z"),
        kind: "RECEIVED",
        detail: "Solicitud recibida.",
        productId: null,
        actor: null,
        product: null,
      }),
    ).toEqual({
      at: "2026-11-11T18:20:05.120Z",
      kind: "RECEIVED",
      actor: null,
      product_ref: null,
      product_name: null,
      detail: "Solicitud recibida.",
    });
    expect(
      toHistoryEntry({
        at: new Date("2026-11-12T09:00:00.000Z"),
        kind: "LINKED",
        detail: "misma etiqueta",
        productId: "p-1",
        actor: { name: "Directiva sintética" },
        product: { name: "Glifosato 48 SL" },
      }).actor,
    ).toEqual({ name: "Directiva sintética" });
  });
});
