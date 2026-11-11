import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { UserRole } from "@prisma/client";
import { SyncV1AuthGuard, SyncV1Request } from "@/modules/sync-v1/api/rest/sync-v1-auth.guard";
import { SyncV1HttpError } from "@/modules/sync-v1/application/sync-v1-http-error";
import type { AuthenticatedPrincipal } from "@/modules/iam/application/types/authenticated-principal.type";
import { IdentificationHttpError } from "../../domain/identification-error";

export const INSTITUTIONAL_ROLES: readonly UserRole[] = [UserRole.DIRECTIVA, UserRole.ADMINISTRADOR];

export type IdentificationListRequest = SyncV1Request & { user?: AuthenticatedPrincipal };

/**
 * `GET /catalog/identification-requests` serves two audiences on one path
 * (E1 §4.1 and §4.2): the farmer's mobile installation (own requests) and the
 * Directiva/Administrador (the tenant's list). The farmer context is tried
 * first with the full Sync v1 revalidation; a context that is not a farmer's
 * (403) is then authenticated as the Web does (JWT strategy, current role
 * from the database) and must be DIRECTIVA or ADMINISTRADOR. An absent,
 * invalid or expired credential stays 401.
 */
@Injectable()
export class IdentificationListAuthGuard implements CanActivate {
  private readonly institutional = new (AuthGuard("jwt"))();

  constructor(private readonly farmer: SyncV1AuthGuard) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      return await this.farmer.canActivate(context);
    } catch (error) {
      if (!(error instanceof SyncV1HttpError) || error.status !== 403) throw error;
    }
    const request = context.switchToHttp().getRequest<IdentificationListRequest>();
    delete request.syncV1Context;
    await this.institutional.canActivate(context);
    if (!request.user || !INSTITUTIONAL_ROLES.includes(request.user.role)) {
      throw new IdentificationHttpError(403, "AUTH_CONTEXT_FORBIDDEN");
    }
    return true;
  }
}
