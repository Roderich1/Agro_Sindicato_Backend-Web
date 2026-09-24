import { UnauthorizedException } from "@nestjs/common";
import { RefreshSessionUseCase } from "./refresh-session.use-case";

describe("RefreshSessionUseCase V1/V2 isolation", () => {
  it("rejects a V2 token without invoking legacy revokeAllByUser", async () => {
    const refreshRepo = {
      findByHash: jest.fn().mockResolvedValue({
        id: "refresh-v2",
        userId: "user-a",
        tenantId: "tenant-a",
        sessionId: "session-a",
        contractVersion: 2,
        expiresAt: new Date(Date.now() + 60_000),
        consumedAt: null,
        revokedAt: null,
      }),
      save: jest.fn(),
      revokeById: jest.fn(),
      revokeAllByUser: jest.fn(),
    };
    const useCase = new RefreshSessionUseCase(
      { findById: jest.fn() } as never,
      refreshRepo,
      { sign: jest.fn() } as never,
      { refreshExpiresAt: jest.fn() } as never,
    );

    await expect(useCase.execute("v2-token")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(refreshRepo.revokeAllByUser).not.toHaveBeenCalled();
    expect(refreshRepo.revokeById).not.toHaveBeenCalled();
  });
});
