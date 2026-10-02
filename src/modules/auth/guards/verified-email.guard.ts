import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedUser } from '../../../common/auth/authenticated-user';
import { REQUIRE_VERIFIED_EMAIL_KEY } from '../../../common/auth/require-verified-email.decorator';
import { ForbiddenError, UnauthorizedError } from '../../../common/errors/http-errors';

/**
 * Exige correo verificado solo en las rutas marcadas con @RequireVerifiedEmail().
 * En la Fase 2 ninguna ruta lo exige todavia; se aplicara a las operaciones
 * financieras de las fases siguientes.
 */
@Injectable()
export class VerifiedEmailGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<boolean>(REQUIRE_VERIFIED_EMAIL_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedError();
    }

    if (!user.emailVerified) {
      throw new ForbiddenError('Debes verificar tu correo para realizar esta operacion.', {
        reason: 'EMAIL_NOT_VERIFIED',
      });
    }

    return true;
  }
}
