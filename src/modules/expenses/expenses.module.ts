import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CategoriesModule } from '../categories/categories.module';
import { HolidaysModule } from '../holidays/holidays.module';
import { PurchasesModule } from '../purchases/purchases.module';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { RecurringExpensesController } from './recurring-expenses.controller';
import { RecurringExpensesService } from './recurring-expenses.service';
import { ExpensesRepository } from './repositories/expenses.repository';

@Module({
  imports: [AuditModule, CategoriesModule, HolidaysModule, PurchasesModule],
  controllers: [ExpensesController, RecurringExpensesController],
  providers: [ExpensesService, RecurringExpensesService, ExpensesRepository],
  exports: [ExpensesRepository, RecurringExpensesService],
})
export class ExpensesModule {}
