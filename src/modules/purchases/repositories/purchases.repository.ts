import { Injectable } from '@nestjs/common';
import { InstallmentPlan, Prisma, Purchase } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

export type PurchaseWithPlan = Prisma.PurchaseGetPayload<{
  include: {
    category: { select: { id: true; name: true } };
    installmentPlan: { include: { installments: true } };
  };
}>;

export type PlanWithPurchase = Prisma.InstallmentPlanGetPayload<{
  include: {
    purchase: true;
    creditCard: { select: { id: true; alias: true; cutDay: true; sameDayCutIncluded: true } };
    installments: true;
  };
}>;

@Injectable()
export class PurchasesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    userId: string,
    filters: {
      creditCardId?: string;
      type?: string;
      status?: string;
      from?: string;
      to?: string;
      cursor?: string;
    },
    limit: number,
  ): Promise<{ items: PurchaseWithPlan[]; nextCursor: string | null }> {
    const cursor = filters.cursor
      ? await this.prisma.purchase.findFirst({ where: { id: filters.cursor, userId } })
      : null;

    const items = await this.prisma.purchase.findMany({
      where: {
        userId,
        ...(filters.creditCardId ? { creditCardId: filters.creditCardId } : {}),
        ...(filters.type ? { type: filters.type } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.from || filters.to
          ? {
              purchaseDate: {
                ...(filters.from ? { gte: filters.from } : {}),
                ...(filters.to ? { lte: filters.to } : {}),
              },
            }
          : {}),
        ...(cursor ? { createdAt: { lt: cursor.createdAt } } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        category: { select: { id: true, name: true } },
        installmentPlan: { include: { installments: { orderBy: { number: 'asc' } } } },
      },
    });

    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;

    return { items: page, nextCursor: hasMore && page.length > 0 ? page[page.length - 1].id : null };
  }

  findById(userId: string, id: string): Promise<PurchaseWithPlan | null> {
    return this.prisma.purchase.findFirst({
      where: { id, userId },
      include: {
        category: { select: { id: true, name: true } },
        installmentPlan: { include: { installments: { orderBy: { number: 'asc' } } } },
      },
    });
  }

  findRaw(
    userId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<(Purchase & { installmentPlan: InstallmentPlan | null }) | null> {
    const client = tx ?? this.prisma;
    return client.purchase.findFirst({ where: { id, userId }, include: { installmentPlan: true } });
  }

  create(
    data: Prisma.PurchaseUncheckedCreateInput,
    tx: Prisma.TransactionClient,
  ): Promise<Purchase> {
    return tx.purchase.create({ data });
  }

  update(
    id: string,
    data: Prisma.PurchaseUpdateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<Purchase> {
    const client = tx ?? this.prisma;
    return client.purchase.update({ where: { id }, data });
  }

  findPlan(userId: string, planId: string): Promise<PlanWithPurchase | null> {
    return this.prisma.installmentPlan.findFirst({
      where: { id: planId, userId },
      include: {
        purchase: true,
        creditCard: { select: { id: true, alias: true, cutDay: true, sameDayCutIncluded: true } },
        installments: { orderBy: { number: 'asc' } },
      },
    });
  }

  createPlan(
    data: Prisma.InstallmentPlanUncheckedCreateInput,
    tx: Prisma.TransactionClient,
  ): Promise<InstallmentPlan> {
    return tx.installmentPlan.create({ data });
  }

  createInstallments(
    data: Prisma.InstallmentCreateManyInput[],
    tx: Prisma.TransactionClient,
  ): Promise<{ count: number }> {
    return tx.installment.createMany({ data });
  }

  updateInstallmentsStatus(
    planId: string,
    status: string,
    tx: Prisma.TransactionClient,
  ): Promise<{ count: number }> {
    return tx.installment.updateMany({
      where: { planId, status: { not: 'PAID' } },
      data: { status },
    });
  }
}
