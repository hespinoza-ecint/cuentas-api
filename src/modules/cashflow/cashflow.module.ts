import { Module } from '@nestjs/common';
import { CardsModule } from '../cards/cards.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { IncomeModule } from '../income/income.module';
import { CashflowContextService } from './cashflow-context.service';
import { CashflowController } from './cashflow.controller';
import { CashflowService } from './cashflow.service';

@Module({
  imports: [CardsModule, IncomeModule, ExpensesModule],
  controllers: [CashflowController],
  providers: [CashflowContextService, CashflowService],
  exports: [CashflowContextService, CashflowService],
})
export class CashflowModule {}
