import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Request } from "express";
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import type { JwtPayload } from "@/modules/iam/application/types/jwt-payload.type";
import {
  BackupHttpError,
  BackupOwnerContext,
} from "../../application/backup-http-error";

export type BackupsRequest = Request & { backupOwner?: BackupOwnerContext };

const AUTH_REQUIRED = () =>
  new BackupHttpError(401, "AUTH_REQUIRED", {
    "WWW-Authenticate": 'Bearer error="invalid_token"',
  });
const FORBIDDEN = () => new BackupHttpError(403, "AUTH_CONTEXT_FORBIDDEN");

/**
 * Owner of a private backup (#39): the Auth V2 session of the farmer's mobile
 * installation, revalidated on every request with the same rules as the Sync
 * v1 guard (contract F05 §3): active Account, Member AGRICULTOR, Tenant,
 * AuthSession and the ClientRegistration linked to that session.
 *
 * Directiva and Administrador get 403: their role grants no access to any
 * private backup, their own or a farmer's (ADR-003, RU-18). The owner is
 * taken from the session only; ids in path, query, headers or body never
 * widen the scope.
 */
@Injectable()
export class BackupsAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<BackupsRequest>();
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
    request.backupOwner = { tenantId: member.tenantId, memberId: member.id };
    return true;
  }
}
