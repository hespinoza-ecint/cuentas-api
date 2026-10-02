import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ForbiddenError, UnauthorizedError } from '../../../src/common/errors/http-errors';
import { RolesGuard } from '../../../src/modules/auth/guards/roles.guard';

function createContext(user?: { role: string }): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function createReflector(requiredRoles?: string[]): Reflector {
  return {
    getAllAndOverride: jest.fn().mockReturnValue(requiredRoles),
  } as unknown as Reflector;
}

describe('RolesGuard', () => {
  it('permite el paso cuando la ruta no exige roles', () => {
    const guard = new RolesGuard(createReflector(undefined));
    expect(guard.canActivate(createContext())).toBe(true);
  });

  it('permite el paso al rol requerido', () => {
    const guard = new RolesGuard(createReflector(['ADMIN']));
    expect(guard.canActivate(createContext({ role: 'ADMIN' }))).toBe(true);
  });

  it('rechaza con 403 al rol insuficiente', () => {
    const guard = new RolesGuard(createReflector(['ADMIN']));

    try {
      guard.canActivate(createContext({ role: 'USER' }));
      fail('El guard debio lanzar ForbiddenError');
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenError);
      expect((error as ForbiddenError).status).toBe(403);
    }
  });

  it('rechaza con 401 cuando no hay usuario autenticado', () => {
    const guard = new RolesGuard(createReflector(['ADMIN']));
    expect(() => guard.canActivate(createContext(undefined))).toThrow(UnauthorizedError);
  });
});
