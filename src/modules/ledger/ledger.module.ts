import { Global, Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { FinancialDatePolicy } from './financial-date.policy';
import { LedgerService } from './ledger.service';

@Global()
@Module({
  imports: [AuditModule],
  providers: [LedgerService, FinancialDatePolicy],
  exports: [LedgerService, FinancialDatePolicy],
})
export class LedgerModule {}
