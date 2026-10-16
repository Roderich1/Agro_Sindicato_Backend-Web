import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Request } from "express";
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import type { JwtPayload } from "@/modules/iam/application/types/jwt-payload.type";
import {
  SyncV1Context,
  SyncV1HttpError,
} from "../../application/sync-v1-http-error";

export type SyncV1Request = Request & { syncV1Context?: SyncV1Context };

const AUTH_REQUIRED = () =>
  new SyncV1HttpError(401, "AUTH_REQUIRED", {
    "WWW-Authenticate": 'Bearer error="invalid_token"',
  });
const FORBIDDEN = () => new SyncV1HttpError(403, "AUTH_CONTEXT_FORBIDDEN");

/**
 * Authentication context of contract §3, revalidated on every request:
 * Account, Member AGRICULTOR, Tenant, AuthSession and the ClientRegistration
 * linked to that session must all be active and consistent.
 *
 * 401 AUTH_REQUIRED: credential missing, invalid or expired (refresh may help).
 * 403 AUTH_CONTEXT_FORBIDDEN: session, Member, account, tenant, registration
 * or role revoked, inactive or not allowed (contract §9, C22/C23/C40).
 * Directiva and Administrador do not publish on behalf of a farmer.
 */
@Injectable()
export class SyncV1AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<SyncV1Request>();
    const header = request.headers.authorization;
    const match = typeof header === "string" ? /^Bearer (\S+)$/.exec(header) : null;
    if (!match) throw AUTH_REQUIRED();

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(match[1], {
        secret: this.config.getOrThrow<string>("JWT_SECRET"),
      });
    } catch {
      throw AUTH_REQUIRED();
    }
    // Sync v1 requires an Auth V2 session linked to a ClientRegistration.
    if (payload.ver !== 2 || !payload.sessionId || !payload.memberId)
      throw FORBIDDEN();

    const session = await this.prisma.authSession.findUnique({
      where: { id: payload.sessionId },
      include: {
        member: { include: { user: true, tenant: true } },
        clientRegistration: true,
      },
    });
    if (!session || session.expiresAt <= new Date()) throw AUTH_REQUIRED();
    const member = session.member;
    const registration = session.clientRegistration;
    if (
      session.status !== "ACTIVE" ||
      session.memberId !== payload.memberId ||
      member.userId !== payload.sub ||
      member.tenantId !== payload.tenantId ||
      member.user.tenantId !== member.tenantId ||
      !member.user.isActive ||
      !member.isActive ||
      !member.tenant.isActive ||
      member.role !== "AGRICULTOR" ||
      !registration ||
      registration.status !== "ACTIVE" ||
      registration.tenantId !== member.tenantId ||
      registration.memberId !== member.id
    ) {
      throw FORBIDDEN();
    }
    request.syncV1Context = {
      tenantId: member.tenantId,
      memberId: member.id,
      sessionId: session.id,
    };
    return true;
  }
}
