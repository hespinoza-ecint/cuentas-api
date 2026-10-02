import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { RequireVerifiedEmail } from '../../common/auth/require-verified-email.decorator';
import { requestMeta } from '../../common/http/request-meta';
import {
  ConfirmIncomeDto,
  ListIncomeTransactionsQueryDto,
  SkipIncomeDto,
  UpcomingIncomeQueryDto,
} from './dto/income.dto';
import { IncomeService } from './income.service';

@ApiTags('income')
@ApiBearerAuth('access-token')
@Controller('income')
export class IncomeTransactionsController {
  constructor(private readonly incomeService: IncomeService) {}

  @Get('upcoming')
  upcoming(@CurrentUser() user: AuthenticatedUser, @Query() query: UpcomingIncomeQueryDto) {
    return this.incomeService.upcoming(user.id, query);
  }

  @Get('transactions')
  listTransactions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListIncomeTransactionsQueryDto,
  ) {
    return this.incomeService.listTransactions(user.id, query);
  }

  @Post('transactions/confirm')
  @RequireVerifiedEmail()
  confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ConfirmIncomeDto,
    @Req() request: FastifyRequest,
  ) {
    return this.incomeService.confirm(user.id, dto, requestMeta(request));
  }

  @Post('transactions/skip')
  @RequireVerifiedEmail()
  skip(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SkipIncomeDto,
    @Req() request: FastifyRequest,
  ) {
    return this.incomeService.skip(user.id, dto, requestMeta(request));
  }
}
