import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Put,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { RequireVerifiedEmail } from '../../common/auth/require-verified-email.decorator';
import { requestMeta } from '../../common/http/request-meta';
import { UpdateRuleOverrideDto } from './dto/recommendation.dto';
import { RecommendationsService } from './recommendations.service';

@ApiTags('recommendation-rules')
@ApiBearerAuth('access-token')
@Controller('recommendation-rules')
export class RecommendationRulesController {
  constructor(private readonly recommendationsService: RecommendationsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.recommendationsService.listRules(user.id);
  }

  @Put(':code/override')
  @RequireVerifiedEmail()
  upsertOverride(
    @CurrentUser() user: AuthenticatedUser,
    @Param('code') code: string,
    @Body() dto: UpdateRuleOverrideDto,
    @Req() request: FastifyRequest,
  ) {
    return this.recommendationsService.upsertRuleOverride(
      user.id,
      code,
      dto,
      requestMeta(request),
    );
  }

  @Delete(':code/override')
  @HttpCode(204)
  @RequireVerifiedEmail()
  async removeOverride(
    @CurrentUser() user: AuthenticatedUser,
    @Param('code') code: string,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    await this.recommendationsService.removeRuleOverride(user.id, code, requestMeta(request));
  }
}
