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
