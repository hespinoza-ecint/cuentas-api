import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CardsModule } from '../cards/cards.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { HolidaysModule } from '../holidays/holidays.module';
import { IncomeModule } from '../income/income.module';
import { AdminRecommendationRulesController } from './admin-recommendation-rules.controller';
import { RecommendationRulesController } from './recommendation-rules.controller';
import { RecommendationsController } from './recommendations.controller';
import { RecommendationsService } from './recommendations.service';

@Module({
  imports: [AuditModule, CardsModule, IncomeModule, ExpensesModule, HolidaysModule],
  controllers: [
    RecommendationsController,
    RecommendationRulesController,
    AdminRecommendationRulesController,
  ],
  providers: [RecommendationsService],
  exports: [RecommendationsService],
})
export class RecommendationsModule {}
