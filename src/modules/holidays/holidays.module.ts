import { Module } from '@nestjs/common';
import { HolidayCalendarService } from './holiday-calendar.service';

@Module({
  providers: [HolidayCalendarService],
  exports: [HolidayCalendarService],
})
export class HolidaysModule {}
