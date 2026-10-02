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
import {
  CreateRecommendationDto,
  ListRecommendationsQueryDto,
} from './dto/recommendation.dto';
import { RecommendationsService } from './recommendations.service';

@ApiTags('recommendations')
@ApiBearerAuth('access-token')
@Controller('recommendations')
export class RecommendationsController {
  constructor(private readonly recommendationsService: RecommendationsService) {}

  @Get()
  listHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListRecommendationsQueryDto,
  ) {
    return this.recommendationsService.listHistory(user.id, query);
  }

  @Post()
  @RequireVerifiedEmail()
  recommend(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRecommendationDto,
    @Req() request: FastifyRequest,
  ) {
    return this.recommendationsService.recommend(user.id, dto, requestMeta(request));
  }

  @Get(':id')
  getHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.recommendationsService.getHistory(user.id, id);
  }
}
