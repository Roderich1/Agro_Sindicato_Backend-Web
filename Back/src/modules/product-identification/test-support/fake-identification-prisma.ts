import { randomUUID } from "node:crypto";

/**
 * Minimal in-memory stand-in for the Prisma calls of the E1 use cases (unit
 * tests only; the PostgreSQL spec covers the real queries, CHECKs and lock).
 * `where` supports equality and `{ equals, mode: "insensitive" }`.
 */
function matches(row: any, where: Record<string, any> = {}): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (expected && typeof expected === "object" && "equals" in expected) {
      return String(row[key]).toLowerCase() === String(expected.equals).toLowerCase();
    }
    return row[key] === expected;
  });
}

export class FakeIdentificationPrisma {
  requests: any[] = [];
  events: any[] = [];
  audits: any[] = [];
  products: any[] = [];
  associations: any[] = [];
  locks: string[] = [];

  $executeRaw = async (_strings: TemplateStringsArray, ...values: unknown[]) => {
    this.locks.push(String(values[0]));
    return 1;
  };

  $transaction = async (body: (tx: any) => Promise<unknown>) => body(this);

  private withProduct = (row: any) => ({
    ...row,
    product: row.productId ? (this.products.find((p) => p.id === row.productId) ?? null) : null,
  });

  private pushEvent(requestId: string, events: any) {
    if (events?.create) this.events.push({ id: randomUUID(), requestId, at: new Date(), productId: null, detail: null, ...events.create });
  }

  productIdentificationRequest = {
    findMany: async ({ where }: any) => this.requests.filter((row) => matches(row, where)).map(this.withProduct),
    findFirst: async ({ where }: any) => {
      const row = this.requests.find((r) => matches(r, where));
      return row ? this.withProduct(row) : null;
    },
    create: async ({ data }: any) => {
      const { events, ...fields } = data;
      const now = new Date();
      const row = {
        id: randomUUID(),
        status: "PENDING",
        resolution: null,
        productId: null,
        resolvedByUserId: null,
        resolvedAt: null,
        resolutionReason: null,
        pendingNote: null,
        pendingNoteByUserId: null,
        pendingNoteAt: null,
        photoState: "NONE",
        photoStorageKey: null,
        photoSha256: null,
        photoContentType: null,
        photoSizeBytes: null,
        photoWidth: null,
        photoHeight: null,
        photoStoredAt: null,
        photoRemovedAt: null,
        receivedAt: now,
        updatedAt: now,
        ...fields,
      };
      this.requests.push(row);
      this.pushEvent(row.id, events);
      return this.withProduct(row);
    },
    update: async ({ where, data }: any) => {
      const row = this.requests.find((r) => r.id === where.id);
      if (!row) throw new Error("not found");
      const { events, ...fields } = data;
      Object.assign(row, fields, { updatedAt: new Date() });
      this.pushEvent(row.id, events);
      return this.withProduct(row);
    },
  };

  productIdentificationEvent = {
    findMany: async ({ where }: any) =>
      this.events
        .filter((event) => matches(event, where))
        .map((event) => ({
          ...event,
          actor: event.actorUserId ? { name: `Nombre de ${event.actorUserId}` } : null,
          product: event.productId ? { name: this.products.find((p) => p.id === event.productId)?.name } : null,
        })),
  };

  product = {
    findFirst: async ({ where }: any) => this.products.find((p) => matches(p, where)) ?? null,
    findMany: async ({ where }: any) => this.products.filter((p) => matches(p, where)),
  };

  productCanonicalAssociation = {
    findMany: async ({ where }: any) => this.associations.filter((a) => matches(a, where)),
  };

  auditLog = {
    create: async ({ data }: any) => {
      this.audits.push(data);
      return data;
    },
  };
}
