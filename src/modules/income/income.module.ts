import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CategoriesModule } from '../categories/categories.module';
import { HolidaysModule } from '../holidays/holidays.module';
import { IncomeSourcesController } from './income-sources.controller';
import { IncomeTransactionsController } from './income-transactions.controller';
import { IncomeService } from './income.service';
import { IncomeRepository } from './repositories/income.repository';

@Module({
  imports: [AuditModule, CategoriesModule, HolidaysModule],
  controllers: [IncomeSourcesController, IncomeTransactionsController],
  providers: [IncomeService, IncomeRepository],
  exports: [IncomeRepository],
})
export class IncomeModule {}
