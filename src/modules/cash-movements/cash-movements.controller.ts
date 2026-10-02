import {
  Body,
  Controller,
  Get,
  HttpCode,
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
import { CashMovementsService } from './cash-movements.service';
import {
  AdjustmentDto,
  ListMovementsQueryDto,
  ReverseMovementDto,
} from './dto/cash-movement.dto';

@ApiTags('cash-movements')
@ApiBearerAuth('access-token')
@Controller('cash-movements')
export class CashMovementsController {
  constructor(private readonly movementsService: CashMovementsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListMovementsQueryDto) {
    return this.movementsService.list(user.id, query);
  }

  @Post('adjustments')
  @RequireVerifiedEmail()
  @Idempotent()
  createAdjustment(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AdjustmentDto,
    @Req() request: FastifyRequest,
  ) {
    return this.movementsService.createAdjustment(user.id, dto, requestMeta(request));
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.movementsService.get(user.id, id);
  }

  @Post(':id/reverse')
  @HttpCode(201)
  @RequireVerifiedEmail()
  reverse(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReverseMovementDto,
    @Req() request: FastifyRequest,
  ) {
    return this.movementsService.reverse(user.id, id, dto, requestMeta(request));
  }
}
