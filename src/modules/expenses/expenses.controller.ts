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
import { CreateExpenseDto, ListExpensesQueryDto, ReverseExpenseDto } from './dto/expense.dto';
import { ExpensesService } from './expenses.service';

@ApiTags('expenses')
@ApiBearerAuth('access-token')
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListExpensesQueryDto) {
    return this.expensesService.list(user.id, query);
  }

  @Post()
  @RequireVerifiedEmail()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateExpenseDto,
    @Req() request: FastifyRequest,
  ) {
    return this.expensesService.create(user.id, dto, requestMeta(request));
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.expensesService.get(user.id, id);
  }

  @Post(':id/reverse')
  @RequireVerifiedEmail()
  reverse(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReverseExpenseDto,
    @Req() request: FastifyRequest,
  ) {
    return this.expensesService.reverse(user.id, id, dto, requestMeta(request));
  }
}
