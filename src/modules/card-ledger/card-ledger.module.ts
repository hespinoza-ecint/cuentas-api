import { Global, Module } from '@nestjs/common';
import { CardLedgerService } from './card-ledger.service';

@Global()
@Module({
  providers: [CardLedgerService],
  exports: [CardLedgerService],
})
export class CardLedgerModule {}
