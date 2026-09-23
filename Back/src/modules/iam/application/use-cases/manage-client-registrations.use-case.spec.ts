import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ValidationPipe,
} from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { beforeEach } from "@jest/globals";
import { RegisterClientDto } from "../dtos/register-client.dto";
import {
  ClientRegistrationRecord,
  ClientRegistrationRepositoryPort,
} from "../../domain/ports/client-registration.repository.port";
import { ManageClientRegistrationsUseCase } from "./manage-client-registrations.use-case";

describe("ManageClientRegistrationsUseCase", () => {
  const now = new Date("2026-09-23T05:00:00.000Z");
  const registration: ClientRegistrationRecord = {
    id: "11111111-1111-4111-8111-111111111111",
    status: "ACTIVE",
    createdAt: now,
    lastSeenAt: now,
    revokedAt: null,
  };
  let repository: jest.Mocked<ClientRegistrationRepositoryPort>;
  let useCase: ManageClientRegistrationsUseCase;

  beforeEach(() => {
    repository = {
      register: jest.fn(),
      list: jest.fn(),
      revoke: jest.fn(),
    };
    useCase = new ManageClientRegistrationsUseCase(repository);
  });

  it("hashes the canonical UUID and never returns the raw clientId", async () => {
    repository.register.mockResolvedValue({
      outcome: "registered",
      registration,
    });

    const result = await useCase.register(
      "user-a",
      "tenant-a",
      "550E8400-E29B-41D4-A716-446655440000",
    );

    expect(repository.register).toHaveBeenCalledWith(
      { tenantId: "tenant-a", userId: "user-a" },
      "a3a9e1ed9732cab28868127be00f1ce921acaefdd5c3b23a6e9e0072bd9c1a34",
      expect.any(Date),
    );
    expect(result).toEqual({
      registrationId: registration.id,
      status: "ACTIVE",
      createdAt: now,
      lastSeenAt: now,
      revokedAt: null,
    });
    expect(result).not.toHaveProperty("clientId");
    expect(result).not.toHaveProperty("clientIdHash");
  });

  it("returns the same logical registration after idempotent re-registration", async () => {
    repository.register.mockResolvedValue({
      outcome: "existing",
      registration,
    });

    await expect(
      useCase.register(
        "user-a",
        "tenant-a",
        "550e8400-e29b-41d4-a716-446655440000",
      ),
    ).resolves.toMatchObject({
      registrationId: registration.id,
      status: "ACTIVE",
    });
  });

  it("does not automatically reactivate a revoked client", async () => {
    repository.register.mockResolvedValue({
      outcome: "revoked",
      registration: { ...registration, status: "REVOKED", revokedAt: now },
    });

    await expect(
      useCase.register(
        "user-a",
        "tenant-a",
        "550e8400-e29b-41d4-a716-446655440000",
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("rejects a missing, inactive, or cross-tenant membership context", async () => {
    repository.register.mockResolvedValue({ outcome: "inactive-context" });

    await expect(
      useCase.register(
        "user-a",
        "tenant-b",
        "550e8400-e29b-41d4-a716-446655440000",
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("lists only registrations returned for the authenticated context", async () => {
    repository.list.mockResolvedValue({
      outcome: "ok",
      registrations: [registration],
    });

    await expect(useCase.list("user-a", "tenant-a")).resolves.toHaveLength(1);
    expect(repository.list).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      userId: "user-a",
    });
  });

  it("revokes an owned registration and keeps repeat revoke idempotent", async () => {
    const revoked = {
      ...registration,
      status: "REVOKED" as const,
      revokedAt: now,
    };
    repository.revoke
      .mockResolvedValueOnce({ outcome: "revoked", registration: revoked })
      .mockResolvedValueOnce({
        outcome: "already-revoked",
        registration: revoked,
      });

    await expect(
      useCase.revoke("user-a", "tenant-a", registration.id),
    ).resolves.toMatchObject({
      status: "REVOKED",
    });
    await expect(
      useCase.revoke("user-a", "tenant-a", registration.id),
    ).resolves.toEqual(
      expect.objectContaining({
        registrationId: registration.id,
        revokedAt: now,
      }),
    );
  });

  it("does not expose a registration owned by another member or tenant", async () => {
    repository.revoke.mockResolvedValue({ outcome: "not-found" });

    await expect(
      useCase.revoke("user-b", "tenant-b", registration.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("accepts only UUID v4 at the request contract boundary", async () => {
    const valid = plainToInstance(RegisterClientDto, {
      clientId: "550e8400-e29b-41d4-a716-446655440000",
    });
    const wrongVersion = plainToInstance(RegisterClientDto, {
      clientId: "550e8400-e29b-11d4-a716-446655440000",
    });
    const hardwareLike = plainToInstance(RegisterClientDto, {
      clientId: "android-id-123",
    });

    await expect(validate(valid)).resolves.toHaveLength(0);
    await expect(validate(wrongVersion)).resolves.not.toHaveLength(0);
    await expect(validate(hardwareLike)).resolves.not.toHaveLength(0);
  });

  it("rejects forged tenant, user, member, or role fields in the request body", async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });

    await expect(
      pipe.transform(
        {
          clientId: "550e8400-e29b-41d4-a716-446655440000",
          tenantId: "tenant-forged",
          userId: "user-forged",
          memberId: "member-forged",
          role: "ADMINISTRADOR",
        },
        { type: "body", metatype: RegisterClientDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
