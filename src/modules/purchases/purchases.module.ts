import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CardsModule } from '../cards/cards.module';
import { CategoriesModule } from '../categories/categories.module';
import { HolidaysModule } from '../holidays/holidays.module';
import { InstallmentPlansController } from './installment-plans.controller';
import { PurchasesController } from './purchases.controller';
import { PurchasesService } from './purchases.service';
import { PurchasesRepository } from './repositories/purchases.repository';

@Module({
  imports: [AuditModule, CardsModule, CategoriesModule, HolidaysModule],
  controllers: [PurchasesController, InstallmentPlansController],
  providers: [PurchasesService, PurchasesRepository],
  exports: [PurchasesRepository],
})
export class PurchasesModule {}
