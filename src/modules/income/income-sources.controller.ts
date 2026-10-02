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
  CreateIncomeSourceDto,
  IncomeScheduleInputDto,
  UpdateIncomeScheduleDto,
  UpdateIncomeSourceDto,
} from './dto/income.dto';
import { IncomeService } from './income.service';

@ApiTags('income')
@ApiBearerAuth('access-token')
@Controller('income/sources')
export class IncomeSourcesController {
  constructor(private readonly incomeService: IncomeService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.incomeService.listSources(user.id, includeInactive === 'true');
  }

  @Post()
  @RequireVerifiedEmail()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateIncomeSourceDto,
    @Req() request: FastifyRequest,
  ) {
    return this.incomeService.createSource(user.id, dto, requestMeta(request));
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.incomeService.getSource(user.id, id);
  }

  @Patch(':id')
  @RequireVerifiedEmail()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIncomeSourceDto,
    @Req() request: FastifyRequest,
  ) {
    return this.incomeService.updateSource(user.id, id, dto, requestMeta(request));
  }

  @Delete(':id')
  @HttpCode(204)
  @RequireVerifiedEmail()
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    await this.incomeService.removeSource(user.id, id, requestMeta(request));
  }

  @Post(':id/schedules')
  @RequireVerifiedEmail()
  addSchedule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: IncomeScheduleInputDto,
    @Req() request: FastifyRequest,
  ) {
    return this.incomeService.addSchedule(user.id, id, dto, requestMeta(request));
  }

  @Patch(':id/schedules/:scheduleId')
  @RequireVerifiedEmail()
  updateSchedule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('scheduleId', ParseUUIDPipe) scheduleId: string,
    @Body() dto: UpdateIncomeScheduleDto,
    @Req() request: FastifyRequest,
  ) {
    return this.incomeService.updateSchedule(user.id, id, scheduleId, dto, requestMeta(request));
  }

  @Delete(':id/schedules/:scheduleId')
  @HttpCode(204)
  @RequireVerifiedEmail()
  async deactivateSchedule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('scheduleId', ParseUUIDPipe) scheduleId: string,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    await this.incomeService.deactivateSchedule(user.id, id, scheduleId, requestMeta(request));
  }
}
