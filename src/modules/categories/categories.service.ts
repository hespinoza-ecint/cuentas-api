import { Injectable } from '@nestjs/common';
import { Category } from '@prisma/client';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnprocessableEntityError,
} from '../../common/errors/http-errors';
import { RequestMeta } from '../../common/http/request-meta';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

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

  async create(userId: string, dto: CreateCategoryDto, meta: RequestMeta): Promise<CategoryResponse> {
    const name = dto.name.trim();
    await this.assertNameAvailable(userId, name);
    if (dto.parentId) {
      await this.assertParent(userId, dto.parentId, dto.kind);
    }

    const category = await this.prisma.category.create({
      data: {
        userId,
        name,
        kind: dto.kind,
        parentId: dto.parentId ?? null,
        icon: dto.icon ?? null,
      },
    });

    await this.audit.record({
      action: 'category.created',
      entityType: 'Category',
      entityId: category.id,
      userId,
      actorUserId: userId,
      changes: { name: category.name, kind: category.kind, parentId: category.parentId },
      ...meta,
    });

    return this.toResponse(category);
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateCategoryDto,
    meta: RequestMeta,
  ): Promise<CategoryResponse> {
    const category = await this.findOwnable(userId, id);
    const nextKind = dto.kind ?? category.kind;
    const nextName = dto.name?.trim() ?? category.name;

    if (dto.name !== undefined) {
      await this.assertNameAvailable(userId, nextName, category.id);
    }

    let nextParentId = category.parentId;
    if (dto.parentId !== undefined) {
      nextParentId = dto.parentId;
    }
    if (nextParentId) {
      if (nextParentId === category.id) {
        throw new BadRequestError('Una categoria no puede ser su propio padre.', {
          reason: 'SELF_PARENT',
        });
      }
      await this.assertParent(userId, nextParentId, nextKind);
    }

    const updated = await this.prisma.category.update({
      where: { id: category.id },
      data: {
        ...(dto.name !== undefined ? { name: nextName } : {}),
        ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
        ...(dto.parentId !== undefined ? { parentId: dto.parentId } : {}),
        ...(dto.icon !== undefined ? { icon: dto.icon } : {}),
      },
    });

    await this.audit.record({
      action: 'category.updated',
      entityType: 'Category',
      entityId: updated.id,
      userId,
      actorUserId: userId,
      changes: { name: updated.name, kind: updated.kind, parentId: updated.parentId, icon: updated.icon },
      ...meta,
    });

    return this.toResponse(updated);
  }

  async remove(userId: string, id: string, meta: RequestMeta): Promise<void> {
    const category = await this.findOwnable(userId, id);

    const children = await this.prisma.category.count({
      where: { parentId: category.id, deletedAt: null },
    });
    if (children > 0) {
      throw new UnprocessableEntityError(
        'No se puede eliminar una categoria con subcategorias activas.',
        { reason: 'CATEGORY_HAS_CHILDREN', children },
      );
    }

    await this.prisma.category.update({
      where: { id: category.id },
      data: { deletedAt: new Date() },
    });

    await this.audit.record({
      action: 'category.deleted',
      entityType: 'Category',
      entityId: category.id,
      userId,
      actorUserId: userId,
      changes: { name: category.name },
      ...meta,
    });
  }

  /** Categoria propia editable (las del sistema y las ajenas no se tocan). */
  private async findOwnable(userId: string, id: string): Promise<Category> {
    const category = await this.prisma.category.findUnique({ where: { id } });

    if (!category || category.deletedAt) {
      throw new NotFoundError('La categoria no existe.', { reason: 'CATEGORY_NOT_FOUND' });
    }
    if (category.userId === null) {
      throw new UnprocessableEntityError(
        'Las categorias del sistema no se pueden modificar.',
        { reason: 'SYSTEM_CATEGORY_READ_ONLY' },
      );
    }
    if (category.userId !== userId) {
      throw new NotFoundError('La categoria no existe.', { reason: 'CATEGORY_NOT_FOUND' });
    }

    return category;
  }

  private async assertNameAvailable(
    userId: string,
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const categories = await this.prisma.category.findMany({
      where: {
        userId,
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true, name: true },
    });

    const normalized = name.toLowerCase();
    if (categories.some((category) => category.name.trim().toLowerCase() === normalized)) {
      throw new ConflictError('Ya existe una categoria con ese nombre.', {
        reason: 'CATEGORY_NAME_TAKEN',
      });
    }
  }

  private async assertParent(userId: string, parentId: string, kind: string): Promise<void> {
    const parent = await this.prisma.category.findFirst({
      where: {
        id: parentId,
        deletedAt: null,
        OR: [{ userId: null }, { userId }],
      },
    });

    if (!parent) {
      throw new BadRequestError('La categoria padre no existe.', {
        reason: 'PARENT_CATEGORY_NOT_FOUND',
      });
    }
    if (parent.parentId) {
      throw new BadRequestError('Solo se permite un nivel de anidacion.', {
        reason: 'CATEGORY_NESTING_LIMIT',
      });
    }
    if (parent.kind !== 'BOTH' && kind !== 'BOTH' && parent.kind !== kind) {
      throw new BadRequestError('La categoria hija no es compatible con el tipo del padre.', {
        reason: 'CATEGORY_KIND_MISMATCH',
      });
    }
  }

  private toResponse(category: Category): CategoryResponse {
    return {
      id: category.id,
      userId: category.userId,
      parentId: category.parentId,
      name: category.name,
      kind: category.kind,
      icon: category.icon,
      isSystem: category.isSystem,
    };
  }
}
