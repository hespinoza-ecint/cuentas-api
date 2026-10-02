import { Global, Injectable, Module } from '@nestjs/common';
import { todayInTimeZone } from '../../domain/shared/local-date';

/**
 * Reloj inyectable: permite calcular "hoy" en la zona horaria del usuario
 * y sustituirlo en pruebas.
 */
@Injectable()
export class ClockService {
  now(): Date {
    return new Date();
  }

  today(timeZone: string): string {
    return todayInTimeZone(timeZone, this.now());
  }
}

@Global()
@Module({
  providers: [ClockService],
  exports: [ClockService],
})
export class ClockModule {}
