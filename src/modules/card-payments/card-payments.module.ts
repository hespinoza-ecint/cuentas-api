import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CardsModule } from '../cards/cards.module';
import { CardPaymentsController } from './card-payments.controller';
import { CardPaymentsService } from './card-payments.service';
import { CardPaymentsRepository } from './repositories/card-payments.repository';

@Module({
  imports: [AuditModule, CardsModule],
  controllers: [CardPaymentsController],
  providers: [CardPaymentsService, CardPaymentsRepository],
  exports: [CardPaymentsRepository],
})
export class CardPaymentsModule {}
