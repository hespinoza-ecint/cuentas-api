import { ValidationPipe } from '@nestjs/common';
import { RequestValidationError } from '../errors/http-errors';
import { flattenValidationErrors } from './flatten-validation-errors';

/**
 * Pipe de validacion global.
 *
 * - `whitelist` + `forbidNonWhitelisted`: rechaza propiedades no declaradas.
 * - `transform`: instancia los DTOs.
 * - No se usa conversion implicita de tipos: cada DTO declara sus conversiones
 *   con `@Type`/`@Transform` para no aceptar valores laxos en datos financieros.
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
    transform: true,
    stopAtFirstError: false,
    exceptionFactory: (errors) => new RequestValidationError(flattenValidationErrors(errors)),
  });
}
