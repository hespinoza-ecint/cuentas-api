import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { RequireVerifiedEmail } from '../../common/auth/require-verified-email.decorator';
import { requestMeta } from '../../common/http/request-meta';
import { Idempotent } from '../../common/idempotency/idempotent.decorator';
import {
  CancelPurchaseDto,
  CreatePurchaseDto,
  DeletePurchaseDto,
  ListPurchasesQueryDto,
} from './dto/purchase.dto';
import { PurchasesService } from './purchases.service';

@ApiTags('purchases')
@ApiBearerAuth('access-token')
@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListPurchasesQueryDto) {
    return this.purchasesService.list(user.id, query);
  }

  @Post()
  @RequireVerifiedEmail()
  @Idempotent()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePurchaseDto,
    @Req() request: FastifyRequest,
  ) {
    return this.purchasesService.create(user.id, dto, requestMeta(request));
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.purchasesService.get(user.id, id);
  }

  @Post(':id/cancel')
  @RequireVerifiedEmail()
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelPurchaseDto,
    @Req() request: FastifyRequest,
  ) {
    return this.purchasesService.cancel(user.id, id, dto, requestMeta(request));
  }

  /** RN-27: elimina la compra con plan y revierte lo pendiente en la tarjeta. */
  @Delete(':id')
  @RequireVerifiedEmail()
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeletePurchaseDto,
    @Req() request: FastifyRequest,
  ) {
    return this.purchasesService.remove(user.id, id, dto, requestMeta(request));
  }
}
