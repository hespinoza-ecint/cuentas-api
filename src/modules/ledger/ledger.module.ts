import { Global, Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { LedgerService } from './ledger.service';

@Global()
@Module({
  imports: [AuditModule],
  providers: [LedgerService],
  exports: [LedgerService],
})
export class LedgerModule {}
