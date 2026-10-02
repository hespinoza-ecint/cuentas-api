import { HttpException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppError } from './app-error';
import { ProblemDetails } from './problem-details';

export interface ProblemContext {
  instance?: string;
  requestId?: string;
}

const TITLES: Record<number, string> = {
  400: 'Solicitud invalida',
  401: 'No autorizado',
  403: 'Prohibido',
  404: 'No encontrado',
  405: 'Metodo no permitido',
  409: 'Conflicto',
  413: 'Contenido demasiado grande',
  415: 'Tipo de contenido no soportado',
  422: 'Entidad no procesable',
  429: 'Demasiadas solicitudes',
  500: 'Error interno del servidor',
  503: 'Servicio no disponible',
};

const CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'TOO_MANY_REQUESTS',
  500: 'INTERNAL_ERROR',
  503: 'SERVICE_UNAVAILABLE',
};

/**
 * Convierte cualquier excepcion en un cuerpo RFC 9457 uniforme.
 * Funcion pura: facil de probar sin levantar la aplicacion.
 */
export function buildProblemDetails(
  exception: unknown,
  context: ProblemContext = {},
): ProblemDetails {
  const base = {
    type: 'about:blank',
    instance: context.instance,
    requestId: context.requestId,
    timestamp: new Date().toISOString(),
  };

  if (exception instanceof AppError) {
    return {
      ...base,
      title: exception.title ?? titleFor(exception.status),
      status: exception.status,
      code: exception.code,
      detail: exception.detail,
      ...(exception.extensions ?? {}),
    };
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const response = exception.getResponse();

    let detail = exception.message;
    let code = codeFor(status);
    let extensions: Record<string, unknown> = {};

    if (typeof response === 'string') {
      detail = response;
    } else if (response && typeof response === 'object') {
      const body = response as Record<string, unknown>;
      if (Array.isArray(body.message)) {
        detail = body.message.map(String).join('; ');
      } else if (typeof body.message === 'string') {
        detail = body.message;
      }
      if (typeof body.code === 'string') {
        code = body.code;
      }
      if (body.errors) {
        extensions = { errors: body.errors };
      }
    }

    return {
      ...base,
      title: titleFor(status),
      status,
      code,
      detail,
      ...extensions,
    };
  }

  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    switch (exception.code) {
      case 'P2002': {
        const fields = normalizeTarget(exception.meta?.target);
        return {
          ...base,
          title: titleFor(409),
          status: 409,
          code: 'CONFLICT',
          detail: 'Ya existe un registro con esos datos.',
          ...(fields ? { fields } : {}),
        };
      }
      case 'P2003':
        return {
          ...base,
          title: titleFor(409),
          status: 409,
          code: 'REFERENCE_CONFLICT',
          detail: 'La operacion hace referencia a un registro que no existe o esta en uso.',
        };
      case 'P2025':
        return {
          ...base,
          title: titleFor(404),
          status: 404,
          code: 'NOT_FOUND',
          detail: 'El recurso solicitado no existe.',
        };
      case 'P2034':
        return {
          ...base,
          title: titleFor(409),
          status: 409,
          code: 'CONCURRENCY_CONFLICT',
          detail:
            'No se pudo completar la operacion por un conflicto de concurrencia. Vuelve a intentarlo.',
        };
      default:
        break;
    }
  }

  if (exception instanceof Prisma.PrismaClientInitializationError) {
    return {
      ...base,
      title: titleFor(503),
      status: 503,
      code: 'DATABASE_UNAVAILABLE',
      detail: 'La base de datos no esta disponible.',
    };
  }

  return {
    ...base,
    title: titleFor(500),
    status: 500,
    code: 'INTERNAL_ERROR',
    detail: 'Ocurrio un error inesperado. Vuelve a intentarlo mas tarde.',
  };
}

function titleFor(status: number): string {
  return TITLES[status] ?? 'Error';
}

function codeFor(status: number): string {
  return CODES[status] ?? `HTTP_${status}`;
}

function normalizeTarget(target: unknown): string[] | undefined {
  if (Array.isArray(target)) {
    return target.map(String);
  }
  if (typeof target === 'string') {
    return [target];
  }
  return undefined;
}
