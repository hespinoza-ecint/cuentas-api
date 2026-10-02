import { Injectable } from '@nestjs/common';
import { Category } from '@prisma/client';
import { BadRequestError } from '../../common/errors/http-errors';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

export type CategoryKind = 'EXPENSE' | 'INCOME';

export interface CategoryResponse {
  id: string;
  userId: string | null;
  parentId: string | null;
  name: string;
  kind: string;
  icon: string | null;
  isSystem: boolean;
}

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Categorias globales del sistema mas las propias del usuario. */
  async list(userId: string, kind?: CategoryKind): Promise<CategoryResponse[]> {
    const categories = await this.prisma.category.findMany({
      where: {
        deletedAt: null,
        OR: [{ userId: null }, { userId }],
        ...(kind ? { kind: { in: [kind, 'BOTH'] } } : {}),
      },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        userId: true,
        parentId: true,
        name: true,
        kind: true,
        icon: true,
        isSystem: true,
      },
    });

    return categories;
  }

  /** Valida que la categoria exista, sea global o del usuario y del tipo correcto. */
  async assertUsable(userId: string, categoryId: string, kind: CategoryKind): Promise<Category> {
    const category = await this.prisma.category.findFirst({
      where: {
        id: categoryId,
        deletedAt: null,
        OR: [{ userId: null }, { userId }],
      },
    });

    if (!category) {
      throw new BadRequestError('La categoria indicada no existe.', {
        reason: 'CATEGORY_NOT_FOUND',
      });
    }

    if (category.kind !== kind && category.kind !== 'BOTH') {
      throw new BadRequestError(
        `La categoria no corresponde a ${kind === 'EXPENSE' ? 'gastos' : 'ingresos'}.`,
        { reason: 'CATEGORY_KIND_MISMATCH' },
      );
    }

    return category;
  }
}
