import {
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { afterAll, beforeAll, beforeEach } from "@jest/globals";
import * as bcrypt from "bcrypt";
import { createHash } from "node:crypto";
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { PrismaClientRegistrationRepository } from "../../infrastructure/persistence/prisma-client-registration.repository";
import { PrismaRefreshTokenRepository } from "../../infrastructure/persistence/prisma-refresh-token.repository";
import { PrismaUserRepository } from "../../infrastructure/persistence/prisma-user.repository";
import { RefreshTransportDto } from "../dtos/auth-v2.dto";
import { JwtPayload } from "../types/jwt-payload.type";
import { LoginUseCase } from "../use-cases/login.use-case";
import { RefreshSessionUseCase } from "../use-cases/refresh-session.use-case";
import { AuthTtlPolicy } from "./auth-ttl-policy";
import { AuthV2Service } from "./auth-v2.service";

const postgresUrl = process.env["F02_PG_TEST_URL"];
const describePostgres = postgresUrl ? describe : describe.skip;

describePostgres("AuthV2Service with PostgreSQL 16", () => {
  let prisma: PrismaService;
  let jwt: JwtService;
  let auth: AuthV2Service;
  let passwordHash: string;

  const password = "StrongPassword123!";
  const tenantA = "tenant-a";
  const tenantB = "tenant-b";
  const userA = "user-a";
  const userB = "user-b";
  const memberA = "member-a";
  const memberB = "member-b";

  beforeAll(async () => {
    process.env["DATABASE_URL"] = postgresUrl;
    prisma = new PrismaService();
    await prisma.$connect();
    jwt = new JwtService({ secret: "f02-test-jwt-secret-long-enough" });
    const config = new ConfigService({
      JWT_EXPIRES_IN: "15m",
      JWT_REFRESH_EXPIRES_IN: "7d",
    });
    auth = new AuthV2Service(prisma, jwt, new AuthTtlPolicy(config));
    passwordHash = await bcrypt.hash(password, 4);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.refreshToken.deleteMany();
    await prisma.authSession.deleteMany();
    await prisma.clientRegistration.deleteMany();
    await prisma.member.deleteMany();
    await prisma.user.deleteMany();
    await prisma.tenant.deleteMany();

    await prisma.tenant.createMany({
      data: [
        { id: tenantA, name: "Tenant A", slug: "tenant-a" },
        { id: tenantB, name: "Tenant B", slug: "tenant-b" },
      ],
    });
    await prisma.user.createMany({
      data: [
        {
          id: userA,
          tenantId: tenantA,
          name: "User A",
          email: "a@example.test",
          passwordHash,
          role: "AGRICULTOR",
        },
        {
          id: userB,
          tenantId: tenantB,
          name: "User B",
          email: "b@example.test",
          passwordHash,
          role: "AGRICULTOR",
        },
      ],
    });
    await prisma.member.createMany({
      data: [
        {
          id: memberA,
          tenantId: tenantA,
          userId: userA,
          role: "DIRECTIVA",
        },
        {
          id: memberB,
          tenantId: tenantB,
          userId: userB,
          role: "AGRICULTOR",
        },
      ],
    });
  });

  function loginA(refreshTransport = RefreshTransportDto.BODY) {
    return auth.login({
      email: "a@example.test",
      password,
      refreshTransport,
    });
  }

  function payloadOf(accessToken: string): JwtPayload {
    return jwt.verify<JwtPayload>(accessToken, {
      secret: "f02-test-jwt-secret-long-enough",
    });
  }

  async function createRegistration(
    id: string,
    memberId = memberA,
    tenantId = tenantA,
    status: "ACTIVE" | "REVOKED" = "ACTIVE",
  ) {
    return prisma.clientRegistration.create({
      data: {
        id,
        tenantId,
        memberId,
        clientIdHash: createHash("sha256").update(id).digest("hex"),
        status,
        revokedAt: status === "REVOKED" ? new Date() : null,
      },
    });
  }

  it("creates a V2 session from current Member/Tenant and stores only the refresh hash", async () => {
    const before = Date.now();
    const result = await loginA();
    const claims = payloadOf(result.accessToken);
    const stored = await prisma.refreshToken.findFirstOrThrow({
      where: { sessionId: result.context.session.id },
    });

    expect(claims).toMatchObject({
      sub: userA,
      tenantId: tenantA,
      role: "DIRECTIVA",
      memberId: memberA,
      sessionId: result.context.session.id,
      ver: 2,
    });
    expect(result.rawRefreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(stored.tokenHash).toHaveLength(64);
    expect(stored.tokenHash).not.toBe(result.rawRefreshToken);
    expect(stored.contractVersion).toBe(2);
    expect(stored.expiresAt).toEqual(result.sessionExpiresAt);
    expect(result.sessionExpiresAt.getTime() - before).toBeGreaterThan(
      7 * 86_400_000 - 5_000,
    );
  });

  it("keeps V1 login/refresh operational and isolates V1 reuse from V2", async () => {
    const policy = new AuthTtlPolicy(
      new ConfigService({
        JWT_EXPIRES_IN: "15m",
        JWT_REFRESH_EXPIRES_IN: "7d",
      }),
    );
    const userRepository = new PrismaUserRepository(prisma);
    const refreshRepository = new PrismaRefreshTokenRepository(prisma);
    const loginV1 = new LoginUseCase(
      userRepository,
      refreshRepository,
      jwt,
      policy,
    );
    const refreshV1 = new RefreshSessionUseCase(
      userRepository,
      refreshRepository,
      jwt,
      policy,
    );

    const legacy = await loginV1.execute({
      email: "a@example.test",
      password,
    });
    const legacyClaims = payloadOf(legacy.accessToken);
    const initialLegacyRow = await prisma.refreshToken.findUniqueOrThrow({
      where: {
        tokenHash: createHash("sha256")
          .update(legacy.rawRefreshToken)
          .digest("hex"),
      },
    });
    expect(legacyClaims.ver).toBeUndefined();
    expect(initialLegacyRow).toMatchObject({
      contractVersion: 1,
      sessionId: null,
    });

    const rotatedLegacy = await refreshV1.execute(legacy.rawRefreshToken);
    await expect(
      prisma.refreshToken.findUniqueOrThrow({
        where: {
          tokenHash: createHash("sha256")
            .update(rotatedLegacy.rawRefreshToken)
            .digest("hex"),
        },
      }),
    ).resolves.toMatchObject({ contractVersion: 1, sessionId: null });

    const versionTwo = await loginA();
    await expect(
      refreshV1.execute(legacy.rawRefreshToken),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    const v2Row = await prisma.refreshToken.findFirstOrThrow({
      where: { sessionId: versionTwo.context.session.id },
    });
    expect(v2Row.revokedAt).toBeNull();
    await expect(
      prisma.authSession.findUniqueOrThrow({
        where: { id: versionTwo.context.session.id },
      }),
    ).resolves.toMatchObject({ status: "ACTIVE" });
  });

  it("rejects invalid password and inactive User, Member, or Tenant uniformly", async () => {
    await expect(
      auth.login({
        email: "a@example.test",
        password: "wrong-password",
        refreshTransport: RefreshTransportDto.BODY,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    await prisma.user.update({
      where: { id: userA },
      data: { isActive: false },
    });
    await expect(loginA()).rejects.toBeInstanceOf(UnauthorizedException);
    await prisma.user.update({
      where: { id: userA },
      data: { isActive: true },
    });

    await prisma.member.update({
      where: { id: memberA },
      data: { isActive: false },
    });
    await expect(loginA()).rejects.toBeInstanceOf(UnauthorizedException);
    await prisma.member.update({
      where: { id: memberA },
      data: { isActive: true },
    });

    const userInactiveLogin = await loginA();
    await prisma.user.update({
      where: { id: userA },
      data: { isActive: false },
    });
    await expect(
      auth.refresh(userInactiveLogin.rawRefreshToken, "BODY"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await prisma.user.update({
      where: { id: userA },
      data: { isActive: true },
    });

    const tenantInactiveLogin = await loginA();
    await prisma.tenant.update({
      where: { id: tenantA },
      data: { isActive: false },
    });
    await expect(
      auth.refresh(tenantInactiveLogin.rawRefreshToken, "BODY"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await prisma.tenant.update({
      where: { id: tenantA },
      data: { isActive: true },
    });

    const tokenRevokedLogin = await loginA();
    await prisma.refreshToken.updateMany({
      where: { sessionId: tokenRevokedLogin.context.session.id },
      data: { revokedAt: new Date() },
    });
    await expect(
      auth.refresh(tokenRevokedLogin.rawRefreshToken, "BODY"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      prisma.authSession.findUniqueOrThrow({
        where: { id: tokenRevokedLogin.context.session.id },
      }),
    ).resolves.toMatchObject({ status: "ACTIVE" });

    await prisma.tenant.update({
      where: { id: tenantA },
      data: { isActive: false },
    });
    await expect(loginA()).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rotates once in the same session without extending absolute expiry", async () => {
    const login = await loginA();
    const oldToken = await prisma.refreshToken.findFirstOrThrow({
      where: { sessionId: login.context.session.id },
    });
    const rotated = await auth.refresh(login.rawRefreshToken, "BODY");
    const storedOld = await prisma.refreshToken.findUniqueOrThrow({
      where: { id: oldToken.id },
    });
    const successors = await prisma.refreshToken.findMany({
      where: { sessionId: login.context.session.id, id: { not: oldToken.id } },
    });

    expect(storedOld.consumedAt).not.toBeNull();
    expect(storedOld.revokedAt).not.toBeNull();
    expect(successors).toHaveLength(1);
    expect(successors[0].expiresAt).toEqual(login.sessionExpiresAt);
    expect(rotated.context.session.id).toBe(login.context.session.id);
    expect(rotated.sessionExpiresAt).toEqual(login.sessionExpiresAt);
  });

  it("rejects expired/revoked/compromised/inactive/client-revoked contexts and V1 tokens", async () => {
    const expiredTokenLogin = await loginA();
    await prisma.refreshToken.updateMany({
      where: { sessionId: expiredTokenLogin.context.session.id },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    await expect(
      auth.refresh(expiredTokenLogin.rawRefreshToken, "BODY"),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    const expiredSessionLogin = await loginA();
    await prisma.authSession.update({
      where: { id: expiredSessionLogin.context.session.id },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    await expect(
      auth.refresh(expiredSessionLogin.rawRefreshToken, "BODY"),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    const revokedLogin = await loginA();
    await prisma.authSession.update({
      where: { id: revokedLogin.context.session.id },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    await expect(
      auth.refresh(revokedLogin.rawRefreshToken, "BODY"),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    const compromisedLogin = await loginA();
    await prisma.authSession.update({
      where: { id: compromisedLogin.context.session.id },
      data: { status: "COMPROMISED", compromisedAt: new Date() },
    });
    await expect(
      auth.refresh(compromisedLogin.rawRefreshToken, "BODY"),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    const memberInactiveLogin = await loginA();
    await prisma.member.update({
      where: { id: memberA },
      data: { isActive: false },
    });
    await expect(
      auth.refresh(memberInactiveLogin.rawRefreshToken, "BODY"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await prisma.member.update({
      where: { id: memberA },
      data: { isActive: true },
    });

    const clientLogin = await loginA();
    const client = await createRegistration(
      "11111111-1111-4111-8111-111111111111",
    );
    await auth.bindClient(payloadOf(clientLogin.accessToken), client.id);
    await prisma.clientRegistration.update({
      where: { id: client.id },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    await expect(
      auth.refresh(clientLogin.rawRefreshToken, "BODY"),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    const legacyRaw = "legacy-refresh-token";
    const legacy = await prisma.refreshToken.create({
      data: {
        tokenHash: createHash("sha256").update(legacyRaw).digest("hex"),
        userId: userA,
        tenantId: tenantA,
        contractVersion: 1,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await expect(auth.refresh(legacyRaw, "BODY")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(
      prisma.refreshToken.findUniqueOrThrow({ where: { id: legacy.id } }),
    ).resolves.toMatchObject({ revokedAt: null, consumedAt: null });
  });

  it("enforces the transport chosen when the session was created", async () => {
    const cookie = await loginA(RefreshTransportDto.COOKIE);
    await expect(
      auth.refresh(cookie.rawRefreshToken, "BODY"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      auth.refresh(cookie.rawRefreshToken, "COOKIE"),
    ).resolves.toMatchObject({ refreshTransport: RefreshTransportDto.COOKIE });
  });

  it("compromises only the reused session and leaves another session usable", async () => {
    const first = await loginA();
    const second = await loginA();
    await auth.refresh(first.rawRefreshToken, "BODY");

    await expect(auth.refresh(first.rawRefreshToken, "BODY")).rejects.toThrow(
      "Reuso de refresh detectado",
    );
    const [firstSession, secondSession] = await Promise.all([
      prisma.authSession.findUniqueOrThrow({
        where: { id: first.context.session.id },
      }),
      prisma.authSession.findUniqueOrThrow({
        where: { id: second.context.session.id },
      }),
    ]);
    expect(firstSession.status).toBe("COMPROMISED");
    expect(secondSession.status).toBe("ACTIVE");
    await expect(
      auth.refresh(second.rawRefreshToken, "BODY"),
    ).resolves.toMatchObject({
      context: { session: { id: secondSession.id } },
    });
  });

  it("allows at most one concurrent successor on real PostgreSQL", async () => {
    const current = await loginA();
    const independent = await loginA();
    const initial = await prisma.refreshToken.findFirstOrThrow({
      where: { sessionId: current.context.session.id },
    });

    const outcomes = await Promise.allSettled([
      auth.refresh(current.rawRefreshToken, "BODY"),
      auth.refresh(current.rawRefreshToken, "BODY"),
    ]);
    const successors = await prisma.refreshToken.findMany({
      where: {
        sessionId: current.context.session.id,
        id: { not: initial.id },
      },
    });
    expect(outcomes.filter((item) => item.status === "fulfilled")).toHaveLength(
      1,
    );
    expect(outcomes.filter((item) => item.status === "rejected")).toHaveLength(
      1,
    );
    const rejected = outcomes.find(
      (item): item is PromiseRejectedResult => item.status === "rejected",
    );
    expect(rejected?.reason).toBeInstanceOf(UnauthorizedException);
    expect(successors).toHaveLength(1);
    expect(successors[0].revokedAt).not.toBeNull();
    await expect(
      prisma.authSession.findUniqueOrThrow({
        where: { id: current.context.session.id },
      }),
    ).resolves.toMatchObject({ status: "COMPROMISED" });
    await expect(
      auth.refresh(independent.rawRefreshToken, "BODY"),
    ).resolves.toBeDefined();
  });

  it("binds idempotently and rejects cross-owner, revoked, or silent rebind", async () => {
    const login = await loginA();
    const payload = payloadOf(login.accessToken);
    const first = await createRegistration(
      "11111111-1111-4111-8111-111111111111",
    );
    const second = await createRegistration(
      "22222222-2222-4222-8222-222222222222",
    );
    const foreign = await createRegistration(
      "33333333-3333-4333-8333-333333333333",
      memberB,
      tenantB,
    );
    const revoked = await createRegistration(
      "44444444-4444-4444-8444-444444444444",
      memberA,
      tenantA,
      "REVOKED",
    );

    await expect(auth.bindClient(payload, first.id)).resolves.toMatchObject({
      registrationId: first.id,
    });
    await expect(auth.bindClient(payload, first.id)).resolves.toMatchObject({
      registrationId: first.id,
    });
    await expect(auth.bindClient(payload, second.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(auth.bindClient(payload, foreign.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(auth.bindClient(payload, revoked.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("logout is idempotent, preserves ClientRegistration, and leaves other sessions active", async () => {
    const current = await loginA();
    const other = await loginA();
    const registration = await createRegistration(
      "11111111-1111-4111-8111-111111111111",
    );
    await auth.bindClient(payloadOf(current.accessToken), registration.id);

    await auth.logout(current.rawRefreshToken);
    await auth.logout(current.rawRefreshToken);

    await expect(
      prisma.authSession.findUniqueOrThrow({
        where: { id: current.context.session.id },
      }),
    ).resolves.toMatchObject({ status: "REVOKED" });
    await expect(
      prisma.authSession.findUniqueOrThrow({
        where: { id: other.context.session.id },
      }),
    ).resolves.toMatchObject({ status: "ACTIVE" });
    await expect(
      prisma.clientRegistration.findUniqueOrThrow({
        where: { id: registration.id },
      }),
    ).resolves.toMatchObject({ status: "ACTIVE" });
  });

  it("ClientRegistration revoke propagates only to bound active sessions", async () => {
    const bound = await loginA();
    const unbound = await loginA();
    const registration = await createRegistration(
      "11111111-1111-4111-8111-111111111111",
    );
    await auth.bindClient(payloadOf(bound.accessToken), registration.id);

    const repository = new PrismaClientRegistrationRepository(prisma);
    await repository.revoke(
      { tenantId: tenantA, userId: userA },
      registration.id,
      new Date(),
    );

    await expect(
      prisma.authSession.findUniqueOrThrow({
        where: { id: bound.context.session.id },
      }),
    ).resolves.toMatchObject({ status: "REVOKED" });
    await expect(
      prisma.authSession.findUniqueOrThrow({
        where: { id: unbound.context.session.id },
      }),
    ).resolves.toMatchObject({ status: "ACTIVE" });
  });

  it("/me revalidates current role/state instead of trusting stale V2 claims", async () => {
    const login = await loginA();
    const payload = payloadOf(login.accessToken);
    await prisma.member.update({
      where: { id: memberA },
      data: { role: "ADMINISTRADOR" },
    });
    await expect(auth.me(payload)).resolves.toMatchObject({
      role: "ADMINISTRADOR",
      member: { role: "ADMINISTRADOR" },
    });

    await prisma.member.update({
      where: { id: memberA },
      data: { isActive: false },
    });
    await expect(auth.me(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
