import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { FastifyRequest } from 'fastify';
import { ALLOW_PENDING_DELETION_KEY } from '../../../common/auth/allow-pending-deletion.decorator';
import { AuthenticatedUser } from '../../../common/auth/authenticated-user';
import { IS_PUBLIC_KEY } from '../../../common/auth/public.decorator';
import { ForbiddenError, UnauthorizedError } from '../../../common/errors/http-errors';
import { SessionsRepository } from '../repositories/sessions.repository';

export interface AccessTokenPayload {
  sub: string;
  sid: string;
  role: string;
}

type AuthenticatedRequest = FastifyRequest & { user?: AuthenticatedUser };

/**
 * Guard global de autenticacion.
 *
 * Valida el JWT y ademas comprueba que la sesion siga activa en la base de
 * datos, de modo que cerrar sesion (o detectar reutilizacion de un refresh
 * token) invalida de inmediato el access token.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly sessions: SessionsRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedError('Se requiere autenticacion para acceder a este recurso.');
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedError('El token de acceso es invalido o expiro.', {
        reason: 'INVALID_ACCESS_TOKEN',
      });
    }

    const session = await this.sessions.findActiveByIdForUser(payload.sid, payload.sub);
    if (!session) {
      throw new UnauthorizedError('La sesion ya no es valida.', { reason: 'SESSION_REVOKED' });
    }

    const user = session.user;
    if (user.deletedAt) {
      throw new UnauthorizedError('La cuenta ya no esta disponible.', {
        reason: 'ACCOUNT_DELETED',
      });
    }

    const allowPendingDeletion = this.reflector.getAllAndOverride<boolean>(
      ALLOW_PENDING_DELETION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (user.status === 'PENDING_DELETION' && !allowPendingDeletion) {
      throw new ForbiddenError(
        'La cuenta esta programada para eliminacion. Puedes cancelar la eliminacion o exportar tus datos.',
        { reason: 'PENDING_DELETION' },
      );
    }

    request.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      emailVerified: user.emailVerifiedAt !== null,
      sessionId: session.id,
    };

    return true;
  }

  private extractBearerToken(request: FastifyRequest): string | undefined {
    const header = request.headers.authorization;
    if (typeof header !== 'string') {
      return undefined;
    }

    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      return undefined;
    }

    return token;
  }
}
