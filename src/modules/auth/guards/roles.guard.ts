import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedUser } from '../../../common/auth/authenticated-user';
import { ROLES_KEY } from '../../../common/auth/roles.decorator';
import { ForbiddenError, UnauthorizedError } from '../../../common/errors/http-errors';

/** Restringe las rutas marcadas con `@Roles(...)`. El admin no ve datos financieros. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedError();
    }

    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenError('No tienes permisos para realizar esta operacion.', {
        reason: 'INSUFFICIENT_ROLE',
      });
    }

    return true;
  }
}
