import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { CategoriesService, CategoryResponse } from './categories.service';

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
}
