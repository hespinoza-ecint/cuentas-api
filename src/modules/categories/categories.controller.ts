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
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { RequireVerifiedEmail } from '../../common/auth/require-verified-email.decorator';
import { requestMeta } from '../../common/http/request-meta';
import { CategoriesService, CategoryResponse } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

@ApiTags('categories')
@ApiBearerAuth('access-token')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @ApiQuery({ name: 'kind', required: false, enum: ['EXPENSE', 'INCOME'] })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('kind') kind?: string,
  ): Promise<CategoryResponse[]> {
    const normalizedKind = kind === 'EXPENSE' || kind === 'INCOME' ? kind : undefined;
    return this.categoriesService.list(user.id, normalizedKind);
  }

  @Post()
  @RequireVerifiedEmail()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCategoryDto,
    @Req() request: FastifyRequest,
  ): Promise<CategoryResponse> {
    return this.categoriesService.create(user.id, dto, requestMeta(request));
  }

  @Patch(':id')
  @RequireVerifiedEmail()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
    @Req() request: FastifyRequest,
  ): Promise<CategoryResponse> {
    return this.categoriesService.update(user.id, id, dto, requestMeta(request));
  }

  @Delete(':id')
  @HttpCode(204)
  @RequireVerifiedEmail()
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    return this.categoriesService.remove(user.id, id, requestMeta(request));
  }
}
