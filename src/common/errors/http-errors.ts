import { AppError } from './app-error';
import { FieldError } from './problem-details';

/** Codigos de error estables para los errores HTTP mas comunes. */
export class BadRequestError extends AppError {
  constructor(detail = 'La solicitud no es valida.', extensions?: Record<string, unknown>) {
    super({ code: 'BAD_REQUEST', status: 400, detail, extensions });
  }
}

/** Error de validacion de DTOs con detalle por campo. */
export class RequestValidationError extends AppError {
  constructor(errors: FieldError[]) {
    super({
      code: 'VALIDATION_ERROR',
      status: 400,
      detail: 'La solicitud contiene datos invalidos.',
      extensions: { errors },
    });
  }
}

export class UnauthorizedError extends AppError {
  constructor(
    detail = 'Se requiere autenticacion para acceder a este recurso.',
    extensions?: Record<string, unknown>,
  ) {
    super({ code: 'UNAUTHORIZED', status: 401, detail, extensions });
  }
}

export class ForbiddenError extends AppError {
  constructor(detail = 'No tienes permiso para realizar esta operacion.', extensions?: Record<string, unknown>) {
    super({ code: 'FORBIDDEN', status: 403, detail, extensions });
  }
}

export class NotFoundError extends AppError {
  constructor(detail = 'El recurso solicitado no existe.', extensions?: Record<string, unknown>) {
    super({ code: 'NOT_FOUND', status: 404, detail, extensions });
  }
}

export class ConflictError extends AppError {
  constructor(detail = 'La operacion entra en conflicto con el estado actual.', extensions?: Record<string, unknown>) {
    super({ code: 'CONFLICT', status: 409, detail, extensions });
  }
}

export class UnprocessableEntityError extends AppError {
  constructor(detail: string, extensions?: Record<string, unknown>) {
    super({ code: 'UNPROCESSABLE_ENTITY', status: 422, detail, extensions });
  }
}

export class TooManyRequestsError extends AppError {
  constructor(detail = 'Demasiadas solicitudes. Espera un momento antes de reintentar.', extensions?: Record<string, unknown>) {
    super({ code: 'TOO_MANY_REQUESTS', status: 429, detail, extensions });
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(detail = 'El servicio no esta disponible en este momento.', extensions?: Record<string, unknown>) {
    super({ code: 'SERVICE_UNAVAILABLE', status: 503, detail, extensions });
  }
}
