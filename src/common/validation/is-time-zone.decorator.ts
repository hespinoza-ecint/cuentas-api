import { registerDecorator, ValidationOptions } from 'class-validator';
import { isValidTimeZone } from '../../domain/shared/local-date';

/** Valida una zona horaria IANA real (por ejemplo America/Mexico_City). */
export function IsTimeZone(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isTimeZone',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && isValidTimeZone(value);
        },
      },
    });
  };
}
