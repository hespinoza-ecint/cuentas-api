import { Injectable } from '@nestjs/common';
import { UnprocessableEntityError } from '../../common/errors/http-errors';
import { compareLocalDates, daysBetween } from '../../domain/shared/local-date';
import { ClockService } from '../../infrastructure/clock/clock.module';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

/**
 * Politica de fechas para cualquier registro financiero (efectivo o tarjeta):
 * - No se permiten fechas futuras (RN-07).
 * - Hacia atras rige `backdateLimitDays` (RN-06).
 * - "Hoy" se calcula en la zona horaria del usuario.
 */
@Injectable()
export class FinancialDatePolicy {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
  ) {}

  async today(userId: string): Promise<string> {
    const settings = await this.prisma.userSettings.findUnique({ where: { userId } });
    return this.clock.today(settings?.timezone ?? 'America/Mexico_City');
  }

  async assertAllowed(userId: string, occurredOn: string): Promise<void> {
    const settings = await this.prisma.userSettings.findUnique({ where: { userId } });
    const timeZone = settings?.timezone ?? 'America/Mexico_City';
    const backdateLimit = settings?.backdateLimitDays ?? 60;
    const today = this.clock.today(timeZone);

    if (compareLocalDates(occurredOn, today) > 0) {
      throw new UnprocessableEntityError(
        'No se pueden registrar movimientos con fecha futura. Los flujos futuros se capturan como ingresos o gastos programados.',
        { reason: 'FUTURE_DATE_NOT_ALLOWED' },
      );
    }

    if (daysBetween(occurredOn, today) > backdateLimit) {
      throw new UnprocessableEntityError(
        `La fecha excede el limite de ${backdateLimit} dias hacia atras.`,
        { reason: 'BACKDATE_LIMIT_EXCEEDED' },
      );
    }
  }
}
