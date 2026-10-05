import { Module } from '@nestjs/common';
import { CashflowModule } from '../cashflow/cashflow.module';
import { HolidaysModule } from '../holidays/holidays.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [CashflowModule, HolidaysModule],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
