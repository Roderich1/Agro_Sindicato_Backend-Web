import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Prisma } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { createHash, randomBytes } from "node:crypto";
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { LoginV2Dto, RefreshTransportDto } from "../dtos/auth-v2.dto";
import { JwtPayload } from "../types/jwt-payload.type";
import { AuthTtlPolicy } from "./auth-ttl-policy";

const INVALID_CREDENTIALS = "Credenciales invÃ¡lidas";
const INVALID_SESSION = "SesiÃ³n V2 no vÃ¡lida";
const TIMING_SAFE_FAKE_HASH = "$2b$12$invalidhashfortimingattackprotectiononly";

type RefreshCredentialSource = "COOKIE" | "BODY";

export interface V2AuthContext {
  account: {
    id: string;
    name: string;
    email: string;
    isActive: boolean;
  };
  member: {
    id: string;
    role: string;
    isActive: boolean;
  };
  tenant: {
    id: string;
    name: string;
    slug: string;
    isActive: boolean;
  };
  role: string;
  session: {
    id: string;
    status: string;
    refreshTransport: string;
    createdAt: Date;
    lastSeenAt: Date;
    expiresAt: Date;
    clientRegistrationId: string | null;
  };
}

interface V2TokenResult {
  accessToken: string;
  rawRefreshToken: string;
  sessionExpiresAt: Date;
  refreshTransport: RefreshTransportDto;
  context: V2AuthContext;
}

@Injectable()
export class AuthV2Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly ttl: AuthTtlPolicy,
  ) {}

  async login(
    dto: LoginV2Dto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<V2TokenResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { tenant: true },
    });
    const passwordValid = await bcrypt.compare(
      dto.password,
      user?.passwordHash ?? TIMING_SAFE_FAKE_HASH,
    );
    if (!user || !passwordValid || !user.isActive || !user.tenant.isActive) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const member = await this.prisma.member.findUnique({
      where: {
        tenantId_userId: { tenantId: user.tenantId, userId: user.id },
      },
    });
    if (!member?.isActive) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const now = new Date();
    const expiresAt = this.ttl.refreshExpiresAt(now);
    const rawRefreshToken = this.createRefreshToken();
    const tokenHash = this.hashRefreshToken(rawRefreshToken);

    const created = await this.prisma.$transaction(async (tx) => {
      const currentMember = await tx.member.findUnique({
        where: { id: member.id },
        include: { user: true, tenant: true },
      });
      if (
        !currentMember?.isActive ||
        !currentMember.user.isActive ||
        !currentMember.tenant.isActive
      ) {
        return null;
      }

      const session = await tx.authSession.create({
        data: {
          memberId: currentMember.id,
          status: "ACTIVE",
          refreshTransport: dto.refreshTransport,
          createdAt: now,
          lastSeenAt: now,
          expiresAt,
          ipAddress,
          userAgent,
        },
      });
      await tx.refreshToken.create({
        data: {
          tokenHash,
          userId: currentMember.user.id,
          tenantId: currentMember.tenant.id,
          sessionId: session.id,
          contractVersion: 2,
          expiresAt: session.expiresAt,
          ipAddress,
          userAgent,
        },
      });
      await tx.user.update({
        where: { id: currentMember.user.id },
        data: { lastLoginAt: now },
      });
      return { session, member: currentMember };
    });

    if (!created) throw new UnauthorizedException(INVALID_CREDENTIALS);

    const context = this.toContext(created.session, created.member);
    return {
      accessToken: this.issueAccessToken(context),
      rawRefreshToken,
      sessionExpiresAt: created.session.expiresAt,
      refreshTransport: dto.refreshTransport,
      context,
    };
  }

  async refresh(
    rawToken: string | undefined,
    source: RefreshCredentialSource,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<V2TokenResult> {
    if (!rawToken) throw new UnauthorizedException(INVALID_SESSION);
    const tokenHash = this.hashRefreshToken(rawToken);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      let outcome: Awaited<ReturnType<AuthV2Service["rotateInTransaction"]>>;
      try {
        outcome = await this.rotateInTransaction(
          tokenHash,
          source,
          ipAddress,
          userAgent,
        );
      } catch (error) {
        if (this.isTransactionContention(error) && attempt < 2) continue;
        throw error;
      }
      if (outcome.kind === "retry") continue;
      if (outcome.kind === "reuse") {
        throw new UnauthorizedException(
          "Reuso de refresh detectado; la sesiÃ³n fue comprometida.",
        );
      }
      if (outcome.kind === "invalid") {
        throw new UnauthorizedException(INVALID_SESSION);
      }

      return {
        accessToken: this.issueAccessToken(outcome.context),
        rawRefreshToken: outcome.rawRefreshToken,
        sessionExpiresAt: outcome.sessionExpiresAt,
        refreshTransport: outcome.refreshTransport,
        context: outcome.context,
      };
    }
    throw new ServiceUnavailableException(
      "No se pudo completar la rotaciÃ³n atÃ³mica.",
    );
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    const token = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hashRefreshToken(rawToken) },
      select: { contractVersion: true, sessionId: true },
    });
    if (token?.contractVersion !== 2 || !token.sessionId) return;
    const sessionId = token.sessionId;

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.authSession.updateMany({
        where: { id: sessionId, status: "ACTIVE" },
        data: { status: "REVOKED", revokedAt: now },
      });
      await tx.refreshToken.updateMany({
        where: { sessionId, revokedAt: null },
        data: { revokedAt: now },
      });
    });
  }

  async me(payload: JwtPayload): Promise<V2AuthContext> {
    return this.loadCurrentContext(payload);
  }

  async bindClient(payload: JwtPayload, registrationId: string) {
    const context = await this.loadCurrentContext(payload);
    const registration = await this.prisma.clientRegistration.findFirst({
      where: {
        id: registrationId,
        tenantId: context.tenant.id,
        memberId: context.member.id,
        status: "ACTIVE",
      },
      select: { id: true, status: true },
    });
    if (!registration) {
      throw new NotFoundException("Registro de cliente no encontrado.");
    }

    if (context.session.clientRegistrationId === registration.id) {
      return { registrationId: registration.id, status: registration.status };
    }
    if (context.session.clientRegistrationId) {
      throw new ConflictException(
        "La sesiÃ³n ya estÃ¡ asociada a otro registro de cliente.",
      );
    }

    const updated = await this.prisma.authSession.updateMany({
      where: {
        id: context.session.id,
        memberId: context.member.id,
        status: "ACTIVE",
        clientRegistrationId: null,
      },
      data: { clientRegistrationId: registration.id },
    });
    if (updated.count !== 1) {
      const current = await this.prisma.authSession.findUnique({
        where: { id: context.session.id },
        select: { clientRegistrationId: true },
      });
      if (current?.clientRegistrationId === registration.id) {
        return { registrationId: registration.id, status: registration.status };
      }
      throw new ConflictException(
        "La sesiÃ³n ya estÃ¡ asociada a otro registro de cliente.",
      );
    }
    return { registrationId: registration.id, status: registration.status };
  }

  private async rotateInTransaction(
    tokenHash: string,
    source: RefreshCredentialSource,
    ipAddress?: string,
    userAgent?: string,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const token = await tx.refreshToken.findUnique({
          where: { tokenHash },
          include: {
            session: {
              include: {
                member: { include: { user: true, tenant: true } },
                clientRegistration: true,
              },
            },
          },
        });
        if (token?.contractVersion !== 2 || !token.session) {
          return { kind: "invalid" as const };
        }

        const now = new Date();
        if (token.consumedAt) {
          await tx.authSession.updateMany({
            where: { id: token.session.id, status: { not: "COMPROMISED" } },
            data: {
              status: "COMPROMISED",
              compromisedAt: now,
              revokedAt: now,
            },
          });
          await tx.refreshToken.updateMany({
            where: { sessionId: token.session.id, revokedAt: null },
            data: { revokedAt: now },
          });
          return { kind: "reuse" as const };
        }
        if (
          token.revokedAt ||
          token.expiresAt <= now ||
          token.session.status !== "ACTIVE" ||
          token.session.expiresAt <= now ||
          token.session.refreshTransport !== source ||
          !token.session.member.isActive ||
          !token.session.member.user.isActive ||
          !token.session.member.tenant.isActive ||
          (token.session.clientRegistration !== null &&
            token.session.clientRegistration.status !== "ACTIVE")
        ) {
          return { kind: "invalid" as const };
        }

        const consumed = await tx.refreshToken.updateMany({
          where: { id: token.id, consumedAt: null, revokedAt: null },
          data: { consumedAt: now, revokedAt: now },
        });
        if (consumed.count !== 1) return { kind: "retry" as const };

        const rawRefreshToken = this.createRefreshToken();
        await tx.refreshToken.create({
          data: {
            tokenHash: this.hashRefreshToken(rawRefreshToken),
            userId: token.session.member.user.id,
            tenantId: token.session.member.tenant.id,
            sessionId: token.session.id,
            contractVersion: 2,
            expiresAt: token.session.expiresAt,
            ipAddress,
            userAgent,
          },
        });
        const session = await tx.authSession.update({
          where: { id: token.session.id },
          data: { lastSeenAt: now },
        });
        const context = this.toContext(session, token.session.member);
        return {
          kind: "success" as const,
          rawRefreshToken,
          sessionExpiresAt: session.expiresAt,
          refreshTransport: session.refreshTransport as RefreshTransportDto,
          context,
        };
      },
      { maxWait: 10_000, timeout: 10_000 },
    );
  }

  private async loadCurrentContext(
    payload: JwtPayload,
  ): Promise<V2AuthContext> {
    if (payload.ver !== 2 || !payload.memberId || !payload.sessionId) {
      throw new UnauthorizedException(INVALID_SESSION);
    }
    const session = await this.prisma.authSession.findUnique({
      where: { id: payload.sessionId },
      include: {
        member: { include: { user: true, tenant: true } },
        clientRegistration: true,
      },
    });
    const now = new Date();
    if (
      !session ||
      session.memberId !== payload.memberId ||
      session.member.user.id !== payload.sub ||
      session.member.tenant.id !== payload.tenantId ||
      session.status !== "ACTIVE" ||
      session.expiresAt <= now ||
      !session.member.isActive ||
      !session.member.user.isActive ||
      !session.member.tenant.isActive ||
      (session.clientRegistration !== null &&
        session.clientRegistration.status !== "ACTIVE")
    ) {
      throw new UnauthorizedException(INVALID_SESSION);
    }
    return this.toContext(session, session.member);
  }

  private toContext(
    session: {
      id: string;
      status: string;
      refreshTransport: string;
      createdAt: Date;
      lastSeenAt: Date;
      expiresAt: Date;
      clientRegistrationId: string | null;
    },
    member: {
      id: string;
      role: string;
      isActive: boolean;
      user: {
        id: string;
        name: string;
        email: string;
        isActive: boolean;
      };
      tenant: {
        id: string;
        name: string;
        slug: string;
        isActive: boolean;
      };
    },
  ): V2AuthContext {
    return {
      account: {
        id: member.user.id,
        name: member.user.name,
        email: member.user.email,
        isActive: member.user.isActive,
      },
      member: {
        id: member.id,
        role: member.role,
        isActive: member.isActive,
      },
      tenant: member.tenant,
      role: member.role,
      session: {
        id: session.id,
        status: session.status,
        refreshTransport: session.refreshTransport,
        createdAt: session.createdAt,
        lastSeenAt: session.lastSeenAt,
        expiresAt: session.expiresAt,
        clientRegistrationId: session.clientRegistrationId,
      },
    };
  }

  private issueAccessToken(context: V2AuthContext): string {
    const payload: JwtPayload = {
      sub: context.account.id,
      email: context.account.email,
      tenantId: context.tenant.id,
      role: context.member.role,
      memberId: context.member.id,
      sessionId: context.session.id,
      ver: 2,
    };
    return this.jwt.sign(payload, { expiresIn: this.ttl.accessTtl as never });
  }

  private createRefreshToken(): string {
    return randomBytes(32).toString("base64url");
  }

  private hashRefreshToken(rawToken: string): string {
    return createHash("sha256").update(rawToken, "utf8").digest("hex");
  }

  private isTransactionContention(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2028" || error.code === "P2034")
    );
  }
}
