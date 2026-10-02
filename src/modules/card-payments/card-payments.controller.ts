import {
  Body,
  Controller,
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
import { CardPaymentsService } from './card-payments.service';
import {
  CreateCardPaymentDto,
  ListCardPaymentsQueryDto,
  ReverseCardPaymentDto,
} from './dto/card-payment.dto';

@ApiTags('card-payments')
@ApiBearerAuth('access-token')
@Controller('card-payments')
export class CardPaymentsController {
  constructor(private readonly paymentsService: CardPaymentsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListCardPaymentsQueryDto) {
    return this.paymentsService.list(user.id, query);
  }

  @Post()
  @RequireVerifiedEmail()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCardPaymentDto,
    @Req() request: FastifyRequest,
  ) {
    return this.paymentsService.create(user.id, dto, requestMeta(request));
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.paymentsService.get(user.id, id);
  }

  @Post(':id/reverse')
  @RequireVerifiedEmail()
  reverse(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReverseCardPaymentDto,
    @Req() request: FastifyRequest,
  ) {
    return this.paymentsService.reverse(user.id, id, dto, requestMeta(request));
  }
}
