import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { AuthenticatedPrincipal } from "../types/authenticated-principal.type";
import { JwtPayload } from "../types/jwt-payload.type";

const INVALID_CONTEXT = "Credenciales no válidas";

@Injectable()
export class CurrentAuthContextResolver {
  constructor(private readonly prisma: PrismaService) {}

  /** A signed JWT is a locator, not current authorization state. */
  async resolve(payload: JwtPayload): Promise<AuthenticatedPrincipal> {
    if (!payload?.sub || !payload.tenantId) {
      throw new UnauthorizedException(INVALID_CONTEXT);
    }
    if (payload.ver === 2) return this.resolveV2(payload);
    if (payload.ver === undefined || payload.ver === 1) return this.resolveV1(payload);
    throw new UnauthorizedException(INVALID_CONTEXT);
  }

  private async resolveV1(payload: JwtPayload): Promise<AuthenticatedPrincipal> {
    // V1 has no AuthSession. User.tenantId selects the legacy single membership,
    // but the JWT tenant claim is checked only for consistency, never authority.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        tenantId: true,
        isActive: true,
        tenant: { select: { id: true, isActive: true } },
        members: { select: { id: true, tenantId: true, role: true, isActive: true } },
      },
    });
    const member = user?.members.find((row) => row.tenantId === user.tenantId);
    if (
      !user?.isActive ||
      !user.tenant.isActive ||
      !member?.isActive ||
      payload.tenantId !== user.tenantId ||
      user.tenant.id !== member.tenantId ||
      payload.memberId !== undefined ||
      payload.sessionId !== undefined
    ) {
      throw new UnauthorizedException(INVALID_CONTEXT);
    }
    return {
      sub: user.id,
      email: user.email,
      tenantId: member.tenantId,
      role: member.role,
      memberId: member.id,
      tokenVersion: 1,
    };
  }

  private async resolveV2(payload: JwtPayload): Promise<AuthenticatedPrincipal> {
    if (!payload.memberId || !payload.sessionId) {
      throw new UnauthorizedException(INVALID_CONTEXT);
    }
    // One query includes every authorization dependency; no stale cache or N+1.
    const session = await this.prisma.authSession.findUnique({
      where: { id: payload.sessionId },
      include: {
        member: { include: { user: true, tenant: true } },
        clientRegistration: true,
      },
    });
    if (
      !session ||
      session.status !== "ACTIVE" ||
      session.expiresAt <= new Date() ||
      session.memberId !== payload.memberId ||
      session.member.userId !== payload.sub ||
      session.member.tenantId !== payload.tenantId ||
      session.member.user.tenantId !== session.member.tenantId ||
      !session.member.user.isActive ||
      !session.member.isActive ||
      !session.member.tenant.isActive ||
      (session.clientRegistration !== null &&
        (session.clientRegistration.status !== "ACTIVE" ||
          session.clientRegistration.tenantId !== session.member.tenantId ||
          session.clientRegistration.memberId !== session.memberId))
    ) {
      throw new UnauthorizedException(INVALID_CONTEXT);
    }
    return {
      sub: session.member.user.id,
      email: session.member.user.email,
      tenantId: session.member.tenantId,
      role: session.member.role,
      memberId: session.member.id,
      tokenVersion: 2,
      ver: 2,
      sessionId: session.id,
      clientRegistrationId: session.clientRegistrationId,
    };
  }
}
