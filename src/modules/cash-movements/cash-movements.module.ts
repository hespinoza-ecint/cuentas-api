import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CashMovementsController } from './cash-movements.controller';
import { CashMovementsService } from './cash-movements.service';
import { CashMovementsRepository } from './repositories/cash-movements.repository';

@Module({
  imports: [AuditModule],
  controllers: [CashMovementsController],
  providers: [CashMovementsService, CashMovementsRepository],
  exports: [CashMovementsRepository],
})
export class CashMovementsModule {}
