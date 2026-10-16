import { CanActivate, ForbiddenException, Injectable } from '@nestjs/common';

/**
 * F10-SEC-02 (#45/#81): closes a legacy route that contradicts the boundary
 * between the farmer's private operation and the institutional collective
 * view (for example, executing a joint purchase that creates lots, movements
 * and debts, or listing every farmer's lots). The route, its use case, tables
 * and migrations are kept for the transition (TRANSITION_PLAN.md); this guard
 * only refuses the request. Rollback: revert the commit that applies it.
 */
export const LEGACY_ROUTE_CLOSED = 'LEGACY_ROUTE_CLOSED';

@Injectable()
export class LegacyRouteClosedGuard implements CanActivate {
  canActivate(): boolean {
    throw new ForbiddenException(LEGACY_ROUTE_CLOSED);
  }
}
