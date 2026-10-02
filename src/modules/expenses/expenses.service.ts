import { Injectable } from '@nestjs/common';
import { ConflictError, NotFoundError } from '../../common/errors/http-errors';
import { RequestMeta } from '../../common/http/request-meta';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CategoriesService } from '../categories/categories.service';
import { LedgerService } from '../ledger/ledger.service';
import { CreateExpenseDto, ListExpensesQueryDto, ReverseExpenseDto } from './dto/expense.dto';
import { ExpensesRepository, ExpenseWithCategory } from './repositories/expenses.repository';

export interface PaginatedExpenses {
  data: ExpenseWithCategory[];
  meta: { limit: number; nextCursor: string | null; hasMore: boolean };
}

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly expenses: ExpensesRepository,
    private readonly ledger: LedgerService,
    private readonly categories: CategoriesService,
    private readonly audit: AuditService,
  ) {}

  async list(userId: string, query: ListExpensesQueryDto): Promise<PaginatedExpenses> {
    const limit = query.limit ?? 20;
    const { items, nextCursor } = await this.expenses.listExpenses(userId, query, limit);
    return { data: items, meta: { limit, nextCursor, hasMore: nextCursor !== null } };
  }

  async get(userId: string, id: string): Promise<ExpenseWithCategory> {
    const found = await this.prisma.expense.findFirst({
      where: { id, userId },
      include: { category: { select: { id: true, name: true } } },
    });

    if (!found) {
      throw new NotFoundError('El gasto no existe.', { reason: 'EXPENSE_NOT_FOUND' });
    }

    return found;
  }

  /** RN-25: un gasto pagado con efectivo siempre genera su movimiento. */
  async create(userId: string, dto: CreateExpenseDto, meta: RequestMeta) {
    if (dto.categoryId) {
      await this.categories.assertUsable(userId, dto.categoryId, 'EXPENSE');
    }

    return this.prisma.$transaction(async (tx) => {
      const movement = await this.ledger.postMovement(
        {
          userId,
          cashAccountId: dto.cashAccountId,
          type: 'EXPENSE',
          amount: -dto.amount,
          occurredOn: dto.expenseDate,
          description: dto.description,
          sourceType: 'Expense',
          createdById: userId,
        },
        tx,
      );

      const expense = await tx.expense.create({
        data: {
          userId,
          cashAccountId: dto.cashAccountId,
          categoryId: dto.categoryId,
          cashMovementId: movement.id,
          description: dto.description,
          amount: dto.amount,
          expenseDate: dto.expenseDate,
          notes: dto.notes,
        },
      });

      await tx.cashMovement.update({
        where: { id: movement.id },
        data: { sourceId: expense.id },
      });

      await this.audit.record(
        {
          action: 'expense.created',
          entityType: 'Expense',
          entityId: expense.id,
          userId,
          actorUserId: userId,
          changes: {
            cashAccountId: dto.cashAccountId,
            amount: dto.amount,
            expenseDate: dto.expenseDate,
          },
          ...meta,
        },
        tx,
      );

      return expense;
    });
  }

  /** RN-26: los errores se corrigen con un reverso, nunca editando. */
  async reverse(
    userId: string,
    id: string,
    dto: ReverseExpenseDto,
    meta: RequestMeta,
  ): Promise<{ expenseId: string; reversalMovementId: string }> {
    const expense = await this.expenses.findExpense(userId, id);
    if (!expense) {
      throw new NotFoundError('El gasto no existe.', { reason: 'EXPENSE_NOT_FOUND' });
    }
    if (expense.status === 'REVERSED') {
      throw new ConflictError('El gasto ya fue revertido.', { reason: 'EXPENSE_ALREADY_REVERSED' });
    }

    return this.prisma.$transaction(async (tx) => {
      const reversal = await this.ledger.reverseMovement(
        userId,
        expense.cashMovementId,
        dto.reason,
        userId,
        tx,
      );

      await tx.expense.update({ where: { id }, data: { status: 'REVERSED' } });

      await this.audit.record(
        {
          action: 'expense.reversed',
          entityType: 'Expense',
          entityId: id,
          userId,
          actorUserId: userId,
          changes: { reversalMovementId: reversal.id, amount: expense.amount, reason: dto.reason },
          ...meta,
        },
        tx,
      );

      return { expenseId: id, reversalMovementId: reversal.id };
    });
  }
}
