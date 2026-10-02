import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedUser } from './authenticated-user';

/** Inyecta el usuario autenticado (nunca el `userId` del cuerpo o la URL). */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    return request.user as AuthenticatedUser;
  },
);
