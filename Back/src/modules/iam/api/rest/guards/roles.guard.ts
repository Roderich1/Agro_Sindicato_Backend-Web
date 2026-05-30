import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { Request } from 'express';
import { JwtPayload } from '../../../application/types/jwt-payload.type';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as JwtPayload | undefined;

    if (!user) throw new ForbiddenException('Acceso denegado');

    if (!requiredRoles.includes(user.role as UserRole)) {
      throw new ForbiddenException('No tienes permisos para esta acción');
    }

    return true;
  }
}
