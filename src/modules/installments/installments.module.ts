import { Global, Module } from '@nestjs/common';
import { InstallmentsService } from './installments.service';

@Global()
@Module({
  providers: [InstallmentsService],
  exports: [InstallmentsService],
})
export class InstallmentsModule {}
