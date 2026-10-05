import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CashflowModule } from '../cashflow/cashflow.module';
import { HolidaysModule } from '../holidays/holidays.module';
import { AdminRecommendationRulesController } from './admin-recommendation-rules.controller';
import { RecommendationRulesController } from './recommendation-rules.controller';
import { RecommendationsController } from './recommendations.controller';
import { RecommendationsService } from './recommendations.service';

@Module({
  imports: [AuditModule, CashflowModule, HolidaysModule],
  controllers: [
    RecommendationsController,
    RecommendationRulesController,
    AdminRecommendationRulesController,
  ],
  providers: [RecommendationsService],
  exports: [RecommendationsService],
})
export class RecommendationsModule {}
