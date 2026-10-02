import { ValidationError } from 'class-validator';
import type { FieldError } from '../errors/problem-details';

/**
 * Convierte los errores anidados de class-validator en una lista plana
 * `{ field, errors }`, facil de consumir desde la PWA o la app nativa.
 */
export function flattenValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): FieldError[] {
  const result: FieldError[] = [];

  for (const error of errors) {
    const field = parentPath ? `${parentPath}.${error.property}` : error.property;

    const messages = error.constraints ? Object.values(error.constraints) : [];
    if (messages.length > 0) {
      result.push({ field, errors: messages });
    }

    if (error.children && error.children.length > 0) {
      result.push(...flattenValidationErrors(error.children, field));
    }
  }

  return result;
}
