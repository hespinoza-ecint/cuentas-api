import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { RequireVerifiedEmail } from '../../common/auth/require-verified-email.decorator';
import { requestMeta } from '../../common/http/request-meta';
import { PrepayPlanDto } from './dto/purchase.dto';
import { PurchasesService } from './purchases.service';

@ApiTags('installment-plans')
@ApiBearerAuth('access-token')
@Controller('installment-plans')
export class InstallmentPlansController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @Get(':id')
  getPlan(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.purchasesService.getPlan(user.id, id);
  }

  @Post(':id/prepay')
  @RequireVerifiedEmail()
  prepay(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PrepayPlanDto,
    @Req() request: FastifyRequest,
  ) {
    return this.purchasesService.prepay(user.id, id, dto, requestMeta(request));
  }
}
