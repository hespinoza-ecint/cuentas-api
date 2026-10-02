import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { HolidaysModule } from '../holidays/holidays.module';
import { CardsController } from './cards.controller';
import { CardsService } from './cards.service';
import { CardsRepository } from './repositories/cards.repository';
import { StatementsService } from './statements.service';

@Module({
  imports: [AuditModule, HolidaysModule],
  controllers: [CardsController],
  providers: [CardsService, StatementsService, CardsRepository],
  exports: [CardsRepository, CardsService, StatementsService],
})
export class CardsModule {}
