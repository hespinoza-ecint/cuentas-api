import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppError } from '../../../src/common/errors/app-error';
import { RequestValidationError } from '../../../src/common/errors/http-errors';
import { buildProblemDetails } from '../../../src/common/errors/problem-details.factory';

describe('buildProblemDetails', () => {
  const context = { instance: '/api/v1/test', requestId: 'req-1' };

  it('convierte AppError e incluye extensiones', () => {
    const problem = buildProblemDetails(
      new RequestValidationError([{ field: 'amount', errors: ['debe ser un entero'] }]),
      context,
    );

    expect(problem).toMatchObject({
      type: 'about:blank',
      status: 400,
      code: 'VALIDATION_ERROR',
      instance: '/api/v1/test',
      requestId: 'req-1',
    });
    expect(problem.errors).toEqual([{ field: 'amount', errors: ['debe ser un entero'] }]);
    expect(problem.timestamp).toEqual(expect.any(String));
  });

  it('respeta el title personalizado de un AppError', () => {
    const problem = buildProblemDetails(
      new AppError({ code: 'BUSINESS_RULE', status: 422, detail: 'Regla incumplida', title: 'Regla de negocio' }),
      context,
    );

    expect(problem.title).toBe('Regla de negocio');
    expect(problem.status).toBe(422);
  });

  it('mapea HttpException 404', () => {
    const problem = buildProblemDetails(new NotFoundException(), context);
    expect(problem.status).toBe(404);
    expect(problem.code).toBe('NOT_FOUND');
  });

  it('une arreglos de mensajes de HttpException', () => {
    const problem = buildProblemDetails(new BadRequestException(['a', 'b']), context);
    expect(problem.detail).toBe('a; b');
  });

  it('mapea P2002 a 409 con los campos en conflicto', () => {
    const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['email'] },
    });

    const problem = buildProblemDetails(error, context);
    expect(problem.status).toBe(409);
    expect(problem.code).toBe('CONFLICT');
    expect(problem.fields).toEqual(['email']);
  });

  it('mapea P2025 a 404', () => {
    const error = new Prisma.PrismaClientKnownRequestError('Record not found', {
      code: 'P2025',
      clientVersion: 'test',
    });

    const problem = buildProblemDetails(error, context);
    expect(problem.status).toBe(404);
    expect(problem.code).toBe('NOT_FOUND');
  });

  it('oculta los errores desconocidos como 500 generico', () => {
    const problem = buildProblemDetails(new Error('detalle interno secreto'), context);
    expect(problem.status).toBe(500);
    expect(problem.code).toBe('INTERNAL_ERROR');
    expect(problem.detail).not.toContain('secreto');
  });
});
