import { PrismaClientRegistrationRepository } from "./prisma-client-registration.repository";

describe("PrismaClientRegistrationRepository", () => {
  const now = new Date("2026-09-23T05:00:00.000Z");
  const registration = {
    id: "11111111-1111-4111-8111-111111111111",
    status: "ACTIVE" as const,
    createdAt: now,
    lastSeenAt: now,
    revokedAt: null,
  };
  const member = { id: "member-a", isActive: true, tenant: { isActive: true } };

  function setup() {
    const tx = {
      member: { findUnique: jest.fn().mockResolvedValue(member) },
      clientRegistration: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const repository = new PrismaClientRegistrationRepository(prisma as never);
    return { repository, prisma, tx };
  }

  it("creates a registration scoped to the authenticated tenant and Member", async () => {
    const { repository, tx } = setup();
    tx.clientRegistration.findUnique.mockResolvedValue(null);
    tx.clientRegistration.create.mockResolvedValue(registration);

    await expect(
      repository.register(
        { tenantId: "tenant-a", userId: "user-a" },
        "hash-a",
        now,
      ),
    ).resolves.toEqual({ outcome: "registered", registration });

    expect(tx.member.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId_userId: { tenantId: "tenant-a", userId: "user-a" } },
      }),
    );
    expect(tx.clientRegistration.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: "tenant-a",
          memberId: "member-a",
          clientIdHash: "hash-a",
        }),
      }),
    );
  });

  it("updates only lastSeenAt for an active idempotent registration", async () => {
    const { repository, tx } = setup();
    tx.clientRegistration.findUnique.mockResolvedValue(registration);
    tx.clientRegistration.update.mockResolvedValue({
      ...registration,
      lastSeenAt: now,
    });

    await expect(
      repository.register(
        { tenantId: "tenant-a", userId: "user-a" },
        "hash-a",
        now,
      ),
    ).resolves.toMatchObject({ outcome: "existing" });
    expect(tx.clientRegistration.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { lastSeenAt: now } }),
    );
  });

  it("does not mutate a revoked registration during re-registration", async () => {
    const { repository, tx } = setup();
    tx.clientRegistration.findUnique.mockResolvedValue({
      ...registration,
      status: "REVOKED",
      revokedAt: now,
    });

    await expect(
      repository.register(
        { tenantId: "tenant-a", userId: "user-a" },
        "hash-a",
        now,
      ),
    ).resolves.toMatchObject({ outcome: "revoked" });
    expect(tx.clientRegistration.update).not.toHaveBeenCalled();
  });

  it("lists registrations only for the resolved Member and tenant", async () => {
    const { repository, tx } = setup();
    tx.clientRegistration.findMany.mockResolvedValue([registration]);

    await repository.list({ tenantId: "tenant-a", userId: "user-a" });

    expect(tx.clientRegistration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "tenant-a", memberId: "member-a" },
      }),
    );
  });

  it("cannot revoke another member or tenant registration", async () => {
    const { repository, tx } = setup();
    tx.clientRegistration.findFirst.mockResolvedValue(null);

    await expect(
      repository.revoke(
        { tenantId: "tenant-a", userId: "user-a" },
        registration.id,
        now,
      ),
    ).resolves.toEqual({ outcome: "not-found" });
    expect(tx.clientRegistration.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: registration.id,
          tenantId: "tenant-a",
          memberId: "member-a",
        },
      }),
    );
    expect(tx.clientRegistration.update).not.toHaveBeenCalled();
  });

  it("keeps repeated revocation idempotent", async () => {
    const { repository, tx } = setup();
    tx.clientRegistration.findFirst.mockResolvedValue({
      ...registration,
      status: "REVOKED",
      revokedAt: now,
    });

    await expect(
      repository.revoke(
        { tenantId: "tenant-a", userId: "user-a" },
        registration.id,
        now,
      ),
    ).resolves.toMatchObject({ outcome: "already-revoked" });
    expect(tx.clientRegistration.update).not.toHaveBeenCalled();
  });

  it("rejects inactive Member or Tenant contexts before any registration access", async () => {
    const { repository, tx } = setup();
    tx.member.findUnique.mockResolvedValue({
      id: "member-a",
      isActive: false,
      tenant: { isActive: true },
    });

    await expect(
      repository.list({ tenantId: "tenant-a", userId: "user-a" }),
    ).resolves.toEqual({ outcome: "inactive-context" });
    expect(tx.clientRegistration.findMany).not.toHaveBeenCalled();
  });
});
