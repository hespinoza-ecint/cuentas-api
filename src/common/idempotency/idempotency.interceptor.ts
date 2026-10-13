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
import { Observable, catchError, mergeMap, of, throwError } from 'rxjs';
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

    const reservationExpiresAt = new Date(Date.now() + RETENTION_HOURS * 3_600_000);

    const existing = await this.prisma.idempotencyRecord.findUnique({
      where: { userId_key: { userId, key } },
    });

    let expired = false;
    if (existing) {
      expired = existing.expiresAt.getTime() <= Date.now();

      if (expired) {
        // Registro vencido: se libera la llave y la operacion se ejecuta de nuevo.
        await this.prisma.idempotencyRecord.deleteMany({ where: { id: existing.id } });
      } else if (existing.status === 'IN_PROGRESS') {
        throw new ConflictError(
          'Hay otra solicitud en curso con la misma Idempotency-Key. Reintenta en unos segundos.',
          { reason: 'IDEMPOTENCY_IN_PROGRESS' },
        );
      } else if (existing.requestHash !== requestHash) {
        throw new ConflictError(
          'La Idempotency-Key ya fue usada con una solicitud diferente.',
          { reason: 'IDEMPOTENCY_KEY_CONFLICT' },
        );
      } else {
        const reply = context.switchToHttp().getResponse<FastifyReply>();
        reply.status(existing.responseStatus);
        reply.header('x-idempotent-replay', 'true');
        return of(JSON.parse(existing.responseBody) as unknown);
      }
    }

    if (!existing || expired) {
      try {
        await this.prisma.idempotencyRecord.create({
          data: {
            userId,
            key,
            method: request.method,
            path: request.url,
            requestHash,
            status: 'IN_PROGRESS',
            responseStatus: 0,
            responseBody: '',
            expiresAt: reservationExpiresAt,
          },
        });
      } catch {
        // Otra peticion gano la reserva en paralelo.
        throw new ConflictError(
          'Hay otra solicitud en curso con la misma Idempotency-Key. Reintenta en unos segundos.',
          { reason: 'IDEMPOTENCY_IN_PROGRESS' },
        );
      }
    }

    return next.handle().pipe(
      // La respuesta se registra antes de contestar: un reintento con la misma
      // llave responde el mismo resultado sin volver a ejecutar.
      mergeMap(async (body) => {
        const reply = context.switchToHttp().getResponse<FastifyReply>();
        const status = reply.statusCode ?? 201;

        try {
          await this.prisma.idempotencyRecord.update({
            where: { userId_key: { userId, key } },
            data: {
              status: 'COMPLETED',
              responseStatus: status,
              responseBody: JSON.stringify(body ?? null),
              expiresAt: new Date(Date.now() + RETENTION_HOURS * 3_600_000),
            },
          });
        } catch {
          // La reserva desaparecio (limpieza); no hay nada que registrar.
        }

        return body;
      }),
      catchError((error: unknown) => {
        // La operacion fallo: se libera la reserva para permitir reintentos.
        void this.prisma.idempotencyRecord
          .deleteMany({ where: { userId, key, status: 'IN_PROGRESS' } })
          .catch(() => undefined);
        return throwError(() => error);
      }),
    );
  }
}
