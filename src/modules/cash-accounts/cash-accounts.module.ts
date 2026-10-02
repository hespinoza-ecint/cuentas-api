import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CashAccountsController } from './cash-accounts.controller';
import { CashAccountsService } from './cash-accounts.service';
import { CashAccountsRepository } from './repositories/cash-accounts.repository';

@Module({
  imports: [AuditModule],
  controllers: [CashAccountsController],
  providers: [CashAccountsService, CashAccountsRepository],
  exports: [CashAccountsRepository],
})
export class CashAccountsModule {}
