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
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { RequireVerifiedEmail } from '../../common/auth/require-verified-email.decorator';
import { requestMeta } from '../../common/http/request-meta';
import {
  ConfirmRecurringExpenseDto,
  CreateRecurringExpenseDto,
  UpdateRecurringExpenseDto,
  UpcomingQueryDto,
} from './dto/recurring-expense.dto';
import { RecurringExpensesService } from './recurring-expenses.service';

@ApiTags('recurring-expenses')
@ApiBearerAuth('access-token')
@Controller('recurring-expenses')
export class RecurringExpensesController {
  constructor(private readonly recurringService: RecurringExpensesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.recurringService.list(user.id, includeInactive === 'true');
  }

  @Post()
  @RequireVerifiedEmail()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRecurringExpenseDto,
    @Req() request: FastifyRequest,
  ) {
    return this.recurringService.create(user.id, dto, requestMeta(request));
  }

  @Get('upcoming')
  upcoming(@CurrentUser() user: AuthenticatedUser, @Query() query: UpcomingQueryDto) {
    return this.recurringService.upcoming(user.id, query);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.recurringService.get(user.id, id);
  }

  @Patch(':id')
  @RequireVerifiedEmail()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRecurringExpenseDto,
    @Req() request: FastifyRequest,
  ) {
    return this.recurringService.update(user.id, id, dto, requestMeta(request));
  }

  @Delete(':id')
  @HttpCode(204)
  @RequireVerifiedEmail()
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    await this.recurringService.remove(user.id, id, requestMeta(request));
  }

  @Get(':id/upcoming')
  upcomingForOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: UpcomingQueryDto,
  ) {
    return this.recurringService.upcoming(user.id, query, id);
  }

  @Post(':id/confirm')
  @RequireVerifiedEmail()
  confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmRecurringExpenseDto,
    @Req() request: FastifyRequest,
  ) {
    return this.recurringService.confirm(user.id, id, dto, requestMeta(request));
  }
}
