import { Body, Controller, Param, Patch, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { requestMeta } from '../../common/http/request-meta';
import { AdminUpdateRuleDto } from './dto/recommendation.dto';
import { RecommendationsService } from './recommendations.service';

@ApiTags('admin')
@ApiBearerAuth('access-token')
@Roles('ADMIN')
@Controller('admin/recommendation-rules')
export class AdminRecommendationRulesController {
  constructor(private readonly recommendationsService: RecommendationsService) {}

  @Patch(':code')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('code') code: string,
    @Body() dto: AdminUpdateRuleDto,
    @Req() request: FastifyRequest,
  ) {
    return this.recommendationsService.adminUpdateRule(code, dto, user.id, requestMeta(request));
  }
}
