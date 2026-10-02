import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { RequireVerifiedEmail } from '../../common/auth/require-verified-email.decorator';
import { requestMeta } from '../../common/http/request-meta';
import { CashAccountsService } from './cash-accounts.service';
import {
  CreateCashAccountDto,
  OpeningBalanceDto,
  TransferDto,
  UpdateCashAccountDto,
} from './dto/cash-account.dto';

@ApiTags('cash-accounts')
@ApiBearerAuth('access-token')
@Controller('cash-accounts')
export class CashAccountsController {
  constructor(private readonly accountsService: CashAccountsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.accountsService.list(user.id);
  }

  @Post()
  @RequireVerifiedEmail()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCashAccountDto,
    @Req() request: FastifyRequest,
  ) {
    return this.accountsService.create(user.id, dto, requestMeta(request));
  }

  @Post('transfer')
  @RequireVerifiedEmail()
  transfer(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: TransferDto,
    @Req() request: FastifyRequest,
  ) {
    return this.accountsService.transfer(user.id, dto, requestMeta(request));
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.accountsService.get(user.id, id);
  }

  @Patch(':id')
  @RequireVerifiedEmail()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCashAccountDto,
    @Req() request: FastifyRequest,
  ) {
    return this.accountsService.update(user.id, id, dto, requestMeta(request));
  }

  @Delete(':id')
  @HttpCode(204)
  @RequireVerifiedEmail()
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    await this.accountsService.remove(user.id, id, requestMeta(request));
  }

  @Post(':id/opening-balance')
  @RequireVerifiedEmail()
  setOpeningBalance(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OpeningBalanceDto,
    @Req() request: FastifyRequest,
  ) {
    return this.accountsService.setOpeningBalance(user.id, id, dto, requestMeta(request));
  }

  @Post(':id/recalculate')
  recalculate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: FastifyRequest,
  ) {
    return this.accountsService.recalculate(user.id, id, requestMeta(request));
  }
}
