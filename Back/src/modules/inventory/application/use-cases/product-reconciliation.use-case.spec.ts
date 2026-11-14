import { UnprocessableEntityException } from "@nestjs/common";
import { beforeEach } from "@jest/globals";
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { ProductReconciliationUseCase } from "./product-reconciliation.use-case";

/**
 * F07-REC-01 (#108): rules that hold before touching the database. Nothing is
 * associated without an explicit confirmation and a reason (RF-33, RNF-12).
 */
describe("ProductReconciliationUseCase (validation)", () => {
  const transaction = jest.fn();
  const useCase = new ProductReconciliationUseCase({ $transaction: transaction } as unknown as PrismaService);
  const base = { productId: "a", canonicalProductId: "b", reason: "misma fórmula", confirmed: true };

  beforeEach(() => {
    transaction.mockReset();
  });

  it.each([
    ["without confirmation", { ...base, confirmed: false }, "CONFIRMATION_REQUIRED"],
    ["without a reason", { ...base, reason: "   " }, "REASON_REQUIRED"],
    ["with a reason over 280 characters", { ...base, reason: "x".repeat(281) }, "REASON_REQUIRED"],
    ["with itself as canonical", { ...base, canonicalProductId: "a" }, "SELF_ASSOCIATION"],
  ])("rejects an association %s, writing nothing", async (_name, command, code) => {
    await expect(useCase.associate("tenant", "actor", command)).rejects.toThrow(
      new UnprocessableEntityException(code),
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects closing without confirmation, writing nothing", async () => {
    await expect(
      useCase.close("tenant", "actor", { productId: "a", reason: "x", confirmed: false }),
    ).rejects.toThrow(new UnprocessableEntityException("CONFIRMATION_REQUIRED"));
    expect(transaction).not.toHaveBeenCalled();
  });
});

/**
 * RF-25 (D-01): each association change leaves an institutional Bitácora
 * entry with its actor, code, association and reason, in its transaction.
 */
describe("ProductReconciliationUseCase (Bitácora)", () => {
  const tenantId = "tenant-1";
  const products = [
    { id: "alias", name: "Belator", unit: "L" },
    { id: "canon", name: "Belator 20 SC", unit: "L" },
  ];

  function setup(active: Array<{ id: string; productId: string; canonicalProductId: string }> = []) {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      product: {
        findMany: jest.fn().mockResolvedValue(products),
        findFirst: jest.fn().mockResolvedValue({ name: "Belator viejo" }),
      },
      productCanonicalAssociation: {
        findMany: jest.fn().mockResolvedValue(active),
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({ id: "assoc-new" }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = { $transaction: jest.fn((body: (client: typeof tx) => unknown) => body(tx)) };
    return { tx, useCase: new ProductReconciliationUseCase(prisma as unknown as PrismaService) };
  }

  it("records a new association as PRODUCT_ALIAS_ASSOCIATED", async () => {
    const { tx, useCase } = setup();
    await useCase.associate(tenantId, "director-1", { productId: "alias", canonicalProductId: "canon", reason: " misma fórmula ", confirmed: true });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        tenantId,
        actorUserId: "director-1",
        ownerUserId: null,
        action: "CREAR",
        entityName: "ProductCanonicalAssociation",
        entityId: "assoc-new",
        summary: "Nombre «Belator» unido con «Belator 20 SC».",
        after: { canonicalProductRef: "canon", associationRef: "assoc-new" },
        metadata: { event: "PRODUCT_ALIAS_ASSOCIATED", productRef: "alias", reason: "misma fórmula" },
      },
    });
  });

  it("records a correction as PRODUCT_ALIAS_CORRECTED with the previous canonical", async () => {
    const { tx, useCase } = setup([{ id: "assoc-old", productId: "alias", canonicalProductId: "old" }]);
    await useCase.associate(tenantId, "admin-1", { productId: "alias", canonicalProductId: "canon", reason: "se asoció mal", confirmed: true });
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.create.mock.calls[0]![0].data).toMatchObject({
      tenantId,
      actorUserId: "admin-1",
      action: "ACTUALIZAR",
      entityId: "assoc-new",
      summary: "Unión del nombre «Belator» corregida: ahora con «Belator 20 SC» (antes con «Belator viejo»).",
      before: { canonicalProductRef: "old", associationRef: "assoc-old" },
      after: { canonicalProductRef: "canon", associationRef: "assoc-new" },
      metadata: { event: "PRODUCT_ALIAS_CORRECTED", productRef: "alias", reason: "se asoció mal" },
    });
  });

  it("writes nothing when the same association is repeated", async () => {
    const { tx, useCase } = setup([{ id: "assoc-old", productId: "alias", canonicalProductId: "canon" }]);
    await expect(
      useCase.associate(tenantId, "director-1", { productId: "alias", canonicalProductId: "canon", reason: "otra vez", confirmed: true }),
    ).resolves.toEqual({ changed: false, association: "assoc-old" });
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("records undoing an association as PRODUCT_ALIAS_UNDONE", async () => {
    const { tx, useCase } = setup();
    tx.productCanonicalAssociation.findFirst.mockResolvedValue({
      id: "assoc-old",
      productId: "alias",
      canonicalProductId: "canon",
      product: { name: "Belator" },
      canonicalProduct: { name: "Belator 20 SC" },
    });
    await useCase.close(tenantId, "director-1", { productId: "alias", reason: "no era el mismo", confirmed: true });
    expect(tx.auditLog.create.mock.calls[0]![0].data).toMatchObject({
      tenantId,
      actorUserId: "director-1",
      ownerUserId: null,
      action: "INACTIVAR",
      entityName: "ProductCanonicalAssociation",
      entityId: "assoc-old",
      summary: "Unión del nombre «Belator» con «Belator 20 SC» deshecha.",
      metadata: { event: "PRODUCT_ALIAS_UNDONE", productRef: "alias", reason: "no era el mismo" },
    });
  });
});
