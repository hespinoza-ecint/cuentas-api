import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class HolidayCalendarService {
  constructor(private readonly prisma: PrismaService) {}

  /** Festivos de un calendario (MX_BANKING, MX_LABOR) dentro de un rango. */
  async getHolidaySet(calendarCode: string, from: string, to: string): Promise<Set<string>> {
    const holidays = await this.prisma.holiday.findMany({
      where: { calendarCode, date: { gte: from, lte: to } },
      select: { date: true },
    });

    return new Set(holidays.map((holiday) => holiday.date));
  }
}
