import { registerDecorator, ValidationOptions } from 'class-validator';
import { isValidLocalDate } from '../../domain/shared/local-date';

/** Valida una fecha de calendario "YYYY-MM-DD" real (incluye dias del mes). */
export function IsLocalDate(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isLocalDate',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && isValidLocalDate(value);
        },
      },
    });
  };
}
