import {
  BadRequestError,
  ConflictError,
} from '../errors/http-errors';
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Reflector } from '@nestjs/core';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Observable, mergeMap, of } from 'rxjs';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { IDEMPOTENT_KEY } from './idempotent.decorator';

const KEY_MIN_LENGTH = 8;
const KEY_MAX_LENGTH = 128;
const RETENTION_HOURS = 24;

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const required = this.reflector.getAllAndOverride<boolean>(IDEMPOTENT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) {
      return next.handle();
    }

    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user?: AuthenticatedUser }>();
    const userId = request.user?.id;
    if (!userId) {
      // Sin autenticacion el guard correspondiente responde; no hay nada que recordar.
      return next.handle();
    }

    const rawKey = request.headers['idempotency-key'];
    const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;

    // La cabecera es opcional: sin ella la operacion se procesa normal.
    if (key === undefined || key === '') {
      return next.handle();
    }

    if (typeof key !== 'string' || key.length < KEY_MIN_LENGTH || key.length > KEY_MAX_LENGTH) {
      throw new BadRequestError(
        `La cabecera Idempotency-Key debe tener entre ${KEY_MIN_LENGTH} y ${KEY_MAX_LENGTH} caracteres.`,
        { reason: 'IDEMPOTENCY_KEY_INVALID' },
      );
    }

    const requestHash = createHash('sha256')
      .update(
        JSON.stringify({
          method: request.method,
          url: request.url,
          body: request.body ?? null,
        }),
      )
      .digest('hex');

    const existing = await this.prisma.idempotencyRecord.findUnique({
      where: { userId_key: { userId, key } },
    });

    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new ConflictError(
          'La Idempotency-Key ya fue usada con una solicitud diferente.',
          { reason: 'IDEMPOTENCY_KEY_CONFLICT' },
        );
      }

      const reply = context.switchToHttp().getResponse<FastifyReply>();
      reply.status(existing.responseStatus);
      reply.header('x-idempotent-replay', 'true');
      return of(JSON.parse(existing.responseBody) as unknown);
    }

    return next.handle().pipe(
      // Se espera a que el registro quede guardado antes de responder: si otra
      // peticion reintenta con la misma llave, el registro ya debe existir.
      mergeMap(async (body) => {
        const reply = context.switchToHttp().getResponse<FastifyReply>();
        const status = reply.statusCode ?? 201;

        try {
          await this.prisma.idempotencyRecord.create({
            data: {
              userId,
              key,
              method: request.method,
              path: request.url,
              requestHash,
              responseStatus: status,
              responseBody: JSON.stringify(body ?? null),
              expiresAt: new Date(Date.now() + RETENTION_HOURS * 3_600_000),
            },
          });
        } catch {
          // Otra peticion con la misma llave gano la carrera; el reintento ya respondio.
        }

        return body;
      }),
    );
  }
}
