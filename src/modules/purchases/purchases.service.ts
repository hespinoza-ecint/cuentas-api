import { Injectable } from '@nestjs/common';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnprocessableEntityError,
} from '../../common/errors/http-errors';
import { RequestMeta } from '../../common/http/request-meta';
import { NonBusinessDayRule } from '../../domain/calendar/business-calendar';
import {
  DueDateConfig,
  cutDateForMonth,
  cutDateForPurchase,
  cutDatesFrom,
  dueDateFor,
} from '../../domain/cards/card-cycle';
import {
  buildFrenchSchedule,
  buildMsiSchedule,
} from '../../domain/installments/amortization';
import { addDays, compareLocalDates } from '../../domain/shared/local-date';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CardLedgerService } from '../card-ledger/card-ledger.service';
import { CardsService } from '../cards/cards.service';
import { CategoriesService } from '../categories/categories.service';
import { HolidayCalendarService } from '../holidays/holiday-calendar.service';
import { InstallmentsService } from '../installments/installments.service';
import { LedgerService } from '../ledger/ledger.service';
import { FinancialDatePolicy } from '../ledger/financial-date.policy';
import {
  CancelPurchaseDto,
  CreatePurchaseDto,
  ListPurchasesQueryDto,
  PrepayPlanDto,
} from './dto/purchase.dto';
import {
  PlanWithPurchase,
  PurchaseWithPlan,
  PurchasesRepository,
} from './repositories/purchases.repository';

export interface PaginatedPurchases {
  data: PurchaseWithPlan[];
  meta: { limit: number; nextCursor: string | null; hasMore: boolean };
}

export interface PurchaseOriginOptions {
  /** Solo uso interno: confirma una ocurrencia de gasto recurrente. */
  recurringExpenseId?: string;
  occurrenceDate?: string;
}

@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly purchases: PurchasesRepository,
    private readonly cardsService: CardsService,
    private readonly cardLedger: CardLedgerService,
    private readonly ledger: LedgerService,
    private readonly categories: CategoriesService,
    private readonly holidays: HolidayCalendarService,
    private readonly installments: InstallmentsService,
    private readonly datePolicy: FinancialDatePolicy,
    private readonly audit: AuditService,
  ) {}

  async list(userId: string, query: ListPurchasesQueryDto): Promise<PaginatedPurchases> {
    const limit = query.limit ?? 20;
    const { items, nextCursor } = await this.purchases.list(userId, query, limit);
    return { data: items, meta: { limit, nextCursor, hasMore: nextCursor !== null } };
  }

  async get(userId: string, id: string): Promise<PurchaseWithPlan> {
    const purchase = await this.purchases.findById(userId, id);
    if (!purchase) {
      throw new NotFoundError('La compra no existe.', { reason: 'PURCHASE_NOT_FOUND' });
    }
    return purchase;
  }

  async getPlan(userId: string, planId: string): Promise<PlanWithPurchase> {
    const plan = await this.purchases.findPlan(userId, planId);
    if (!plan) {
      throw new NotFoundError('El plan de mensualidades no existe.', { reason: 'PLAN_NOT_FOUND' });
    }
    return plan;
  }

  /** RN-19 y RN-20: las compras con mensualidades se cargan completas al credito. */
  async create(
    userId: string,
    dto: CreatePurchaseDto,
    meta: RequestMeta,
    origin?: PurchaseOriginOptions,
  ): Promise<PurchaseWithPlan> {
    const card = await this.cardsService.get(userId, dto.creditCardId);

    if (card.status !== 'ACTIVE') {
      throw new UnprocessableEntityError('La tarjeta esta inactiva.', { reason: 'CARD_INACTIVE' });
    }
    if (dto.categoryId) {
      await this.categories.assertUsable(userId, dto.categoryId, 'EXPENSE');
    }

    if (origin?.recurringExpenseId) {
      if (dto.type !== 'REGULAR') {
        throw new BadRequestError('Un gasto recurrente solo genera compras regulares.', {
          reason: 'RECURRING_REQUIRES_REGULAR',
        });
      }
      const recurrence = await this.prisma.recurringExpense.findFirst({
        where: { id: origin.recurringExpenseId, userId, deletedAt: null },
      });
      if (!recurrence) {
        throw new BadRequestError('El gasto recurrente indicado no existe.', {
          reason: 'RECURRING_EXPENSE_NOT_FOUND',
        });
      }
    }

    if (dto.recommendationId) {
      const recommendation = await this.prisma.recommendationHistory.findFirst({
        where: { id: dto.recommendationId, userId },
      });
      if (!recommendation) {
        throw new BadRequestError('La recomendacion indicada no existe.', {
          reason: 'RECOMMENDATION_NOT_FOUND',
        });
      }
    }

    if (dto.firstStatementMonth && dto.type === 'REGULAR') {
      throw new BadRequestError('El mes del primer corte solo aplica a compras a meses o diferidas.', {
        reason: 'START_MONTH_REQUIRES_PLAN',
      });
    }

    if (dto.type === 'REGULAR') {
      const purchase = await this.prisma.$transaction(async (tx) => {
        const created = await this.purchases.create(
          {
            userId,
            creditCardId: card.id,
            categoryId: dto.categoryId,
            description: dto.description,
            amount: dto.amount,
            purchaseDate: dto.purchaseDate,
            type: 'REGULAR',
            status: 'ACTIVE',
            notes: dto.notes,
            recommendationId: dto.recommendationId,
            ...(origin?.recurringExpenseId
              ? {
                  recurringExpenseId: origin.recurringExpenseId,
                  occurrenceDate: origin.occurrenceDate,
                }
              : {}),
          },
          tx,
        );

        await this.cardLedger.postEntry(
          {
            userId,
            creditCardId: card.id,
            type: 'PURCHASE',
            amount: dto.amount,
            occurredOn: dto.purchaseDate,
            description: dto.description,
            sourceType: 'Purchase',
            sourceId: created.id,
            createdById: userId,
          },
          tx,
        );

        await this.audit.record(
          {
            action: 'purchase.created',
            entityType: 'Purchase',
            entityId: created.id,
            userId,
            actorUserId: userId,
            changes: {
              creditCardId: card.id,
              type: 'REGULAR',
              amount: dto.amount,
              purchaseDate: dto.purchaseDate,
            },
            ...meta,
          },
          tx,
        );

        return created;
      });

      return this.get(userId, purchase.id);
    }

    if (!dto.months) {
      throw new BadRequestError('months es obligatorio para compras con mensualidades.', {
        reason: 'MONTHS_REQUIRED',
      });
    }
    if (dto.type === 'MSI' && (dto.annualRateBps ?? 0) > 0) {
      throw new BadRequestError('Las compras a meses sin intereses no llevan tasa.', {
        reason: 'MSI_WITH_RATE',
      });
    }
    if (dto.type === 'DEFERRED_INTEREST' && dto.annualRateBps === undefined) {
      throw new BadRequestError('annualRateBps es obligatorio para compras diferidas.', {
        reason: 'RATE_REQUIRED',
      });
    }

    const annualRateBps = dto.type === 'MSI' ? 0 : (dto.annualRateBps ?? 0);
    const schedule =
      dto.type === 'MSI'
        ? buildMsiSchedule(dto.amount, dto.months)
        : buildFrenchSchedule({
            principal: dto.amount,
            months: dto.months,
            annualRateBps,
            ivaRateBps: 1600,
            commissionAmount: dto.commissionAmount,
            commissionMode: dto.commissionMode as 'NONE' | 'UPFRONT' | 'PRORATED' | undefined,
          });

    const firstCut = dto.firstStatementMonth
      ? cutDateForMonth(
          card.cutDay,
          Number(dto.firstStatementMonth.slice(0, 4)),
          Number(dto.firstStatementMonth.slice(5, 7)),
        )
      : cutDateForPurchase(card.cutDay, dto.purchaseDate, card.sameDayCutIncluded);
    const cuts = cutDatesFrom(card.cutDay, firstCut, dto.months);

    const settings = await this.prisma.userSettings.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
    const holidays = await this.holidays.getHolidaySet(
      settings.holidayCalendarCode,
      addDays(firstCut, -15),
      addDays(cuts[cuts.length - 1], 90),
    );

    const dueConfig: DueDateConfig = {
      mode: card.dueDateMode as DueDateConfig['mode'],
      dueDay: card.dueDay,
      dueDaysAfterCut: card.dueDaysAfterCut,
      rule: card.dueNonBusinessDayRule as NonBusinessDayRule,
    };
    const dueDates = cuts.map((cut) => dueDateFor(cut, dueConfig, holidays));

    // "Al corriente": al indicar el mes del primer corte, las mensualidades ya
    // vencidas se registran como pagadas y la tarjeta solo suma lo pendiente.
    const today = await this.datePolicy.today(userId);
    const paidCount = dto.firstStatementMonth
      ? dueDates.filter((dueDate) => compareLocalDates(dueDate, today) <= 0).length
      : 0;
    if (paidCount >= (dto.months as number)) {
      throw new UnprocessableEntityError(
        'Con ese mes de inicio el plan ya estaria liquidado; revisa el mes o los meses.',
        { reason: 'PLAN_ALREADY_PAID_OFF' },
      );
    }
    const pendingRows = schedule.rows.slice(paidCount);
    const outstandingPrincipal = pendingRows.reduce((total, row) => total + row.principal, 0);
    const estimatedMonthlyPayment = Math.round(
      pendingRows.reduce((total, row) => total + row.totalAmount, 0) / pendingRows.length,
    );
    const firstPendingCut = cuts[paidCount];
    const ledgerDate = dto.firstStatementMonth
      ? compareLocalDates(firstPendingCut, today) <= 0
        ? firstPendingCut
        : today
      : dto.purchaseDate;
    const ledgerAmount = dto.firstStatementMonth ? outstandingPrincipal : dto.amount;

    const purchaseId = await this.prisma.$transaction(async (tx) => {
      const created = await this.purchases.create(
        {
          userId,
          creditCardId: card.id,
          categoryId: dto.categoryId,
          description: dto.description,
          amount: dto.amount,
          purchaseDate: dto.purchaseDate,
          type: dto.type,
          status: 'ACTIVE',
          notes: dto.notes,
          recommendationId: dto.recommendationId,
        },
        tx,
      );

      const plan = await this.purchases.createPlan(
        {
          userId,
          creditCardId: card.id,
          purchaseId: created.id,
          type: dto.type,
          principal: dto.amount,
          months: dto.months as number,
          annualRateBps,
          ivaRateBps: 1600,
          commissionAmount: dto.commissionAmount ?? 0,
          commissionMode: dto.commissionMode ?? 'NONE',
          amortizationMethod: 'FRENCH',
          firstStatementDate: firstCut,
          estimatedMonthlyPayment,
          totalInterest: schedule.totalInterest,
          totalIva: schedule.totalIva,
          outstandingPrincipal: ledgerAmount,
          status: 'ACTIVE',
        },
        tx,
      );

      await this.purchases.createInstallments(
        schedule.rows.map((row, index) => {
          const isPaid = index < paidCount;
          return {
            userId,
            planId: plan.id,
            number: row.number,
            statementCutDate: cuts[index],
            dueDate: dueDates[index],
            principal: row.principal,
            interest: row.interest,
            iva: row.iva,
            fee: row.fee,
            totalAmount: row.totalAmount,
            paidAmount: isPaid ? row.totalAmount : 0,
            status: isPaid ? 'PAID' : 'SCHEDULED',
            paidAt: isPaid ? new Date(`${dueDates[index]}T12:00:00.000Z`) : null,
          };
        }),
        tx,
      );

      // RN-18: la compra completa ocupa credito disponible desde el inicio.
      await this.cardLedger.postEntry(
        {
          userId,
          creditCardId: card.id,
          type: 'PURCHASE',
          amount: ledgerAmount,
          occurredOn: ledgerDate,
          description: dto.description,
          sourceType: 'InstallmentPlan',
          sourceId: created.id,
          createdById: userId,
        },
        tx,
      );

      await this.audit.record(
        {
          action: 'purchase.created',
          entityType: 'Purchase',
          entityId: created.id,
          userId,
          actorUserId: userId,
          changes: {
            creditCardId: card.id,
            type: dto.type,
            amount: dto.amount,
            months: dto.months,
            annualRateBps,
            firstStatementDate: firstCut,
            estimatedMonthlyPayment,
            ...(dto.firstStatementMonth
              ? {
                  firstStatementMonth: dto.firstStatementMonth,
                  paidInstallments: paidCount,
                  outstandingPrincipal,
                }
              : {}),
          },
          ...meta,
        },
        tx,
      );

      return created.id;
    });

    return this.get(userId, purchaseId);
  }

  /** RN-26: cancelar o devolver una compra se registra con un reverso. */
  async cancel(
    userId: string,
    id: string,
    dto: CancelPurchaseDto,
    meta: RequestMeta,
  ): Promise<PurchaseWithPlan> {
    const purchase = await this.purchases.findRaw(userId, id);
    if (!purchase) {
      throw new NotFoundError('La compra no existe.', { reason: 'PURCHASE_NOT_FOUND' });
    }
    if (purchase.status !== 'ACTIVE') {
      throw new ConflictError('La compra no esta activa.', { reason: 'PURCHASE_NOT_ACTIVE' });
    }

    if (purchase.installmentPlan) {
      const paidInstallments = await this.prisma.installment.count({
        where: { planId: purchase.installmentPlan.id, paidAmount: { gt: 0 } },
      });
      if (paidInstallments > 0) {
        throw new UnprocessableEntityError(
          'La compra tiene mensualidades pagadas. Corrige con un ajuste o una conciliacion.',
          { reason: 'PLAN_HAS_PAYMENTS' },
        );
      }
    }

    const today = await this.datePolicy.today(userId);

    await this.prisma.$transaction(async (tx) => {
      await this.cardLedger.postEntry(
        {
          userId,
          creditCardId: purchase.creditCardId,
          type: 'REFUND',
          amount: -purchase.amount,
          occurredOn: today,
          description: `Cancelacion: ${purchase.description}`,
          sourceType: 'PurchaseCancellation',
          sourceId: purchase.id,
          createdById: userId,
        },
        tx,
      );

      if (purchase.installmentPlan) {
        await this.purchases.updateInstallmentsStatus(
          purchase.installmentPlan.id,
          'CANCELLED',
          tx,
        );
        await tx.installmentPlan.update({
          where: { id: purchase.installmentPlan.id },
          data: { status: 'CANCELLED', outstandingPrincipal: 0, version: { increment: 1 } },
        });
      }

      await this.purchases.update(id, { status: 'CANCELLED' }, tx);

      await this.audit.record(
        {
          action: 'purchase.cancelled',
          entityType: 'Purchase',
          entityId: id,
          userId,
          actorUserId: userId,
          changes: { reason: dto.reason, amount: purchase.amount },
          ...meta,
        },
        tx,
      );
    });

    return this.get(userId, id);
  }

  /**
   * RN-21: pago anticipado de mensualidades. Por defecto reduce plazo
   * (paga las siguientes mensualidades en orden).
   */
  async prepay(
    userId: string,
    planId: string,
    dto: PrepayPlanDto,
    meta: RequestMeta,
  ): Promise<{
    plan: PlanWithPurchase;
    paymentId: string;
    allocations: Array<{ installmentId: string; amount: number }>;
    settled: boolean;
  }> {
    if (dto.mode === 'REDUCE_PAYMENT') {
      throw new UnprocessableEntityError(
        'La reduccion de mensualidad estara disponible en una fase posterior.',
        { reason: 'REDUCE_PAYMENT_NOT_AVAILABLE' },
      );
    }

    const plan = await this.getPlan(userId, planId);
    if (plan.status === 'CANCELLED') {
      throw new UnprocessableEntityError('El plan esta cancelado.', { reason: 'PLAN_CANCELLED' });
    }
    if (plan.status === 'PAID_OFF') {
      throw new UnprocessableEntityError('El plan ya esta liquidado.', { reason: 'PLAN_PAID_OFF' });
    }

    const card = await this.cardsService.get(userId, plan.creditCardId);
    if (card.status !== 'ACTIVE') {
      throw new UnprocessableEntityError('La tarjeta esta inactiva.', { reason: 'CARD_INACTIVE' });
    }

    const account = await this.prisma.cashAccount.findFirst({
      where: { id: dto.cashAccountId, userId, deletedAt: null },
    });
    if (!account) {
      throw new NotFoundError('La cuenta de efectivo no existe.', { reason: 'ACCOUNT_NOT_FOUND' });
    }
    if (account.status !== 'ACTIVE') {
      throw new UnprocessableEntityError('La cuenta de efectivo esta inactiva.', {
        reason: 'ACCOUNT_INACTIVE',
      });
    }

    await this.ledger.assertDateAllowed(userId, dto.paymentDate);

    const pending = plan.installments.filter(
      (installment) => installment.status !== 'PAID' && installment.status !== 'CANCELLED',
    );
    const totalRemaining = pending.reduce(
      (total, installment) => total + (installment.totalAmount - installment.paidAmount),
      0,
    );

    if (dto.amount > totalRemaining) {
      throw new UnprocessableEntityError('El monto excede el saldo pendiente del plan.', {
        reason: 'PREPAYMENT_EXCEEDS_PLAN',
      });
    }
    if (dto.amount > card.currentBalance) {
      throw new UnprocessableEntityError('El pago excede el saldo actual de la tarjeta.', {
        reason: 'PAYMENT_EXCEEDS_BALANCE',
      });
    }

    const settled = dto.amount >= totalRemaining;
    const today = await this.datePolicy.today(userId);

    const result = await this.prisma.$transaction(async (tx) => {
      const cashMovement = await this.ledger.postMovement(
        {
          userId,
          cashAccountId: account.id,
          type: 'CARD_PAYMENT',
          amount: -dto.amount,
          occurredOn: dto.paymentDate,
          description: `Anticipo ${plan.purchase.description}`,
          sourceType: 'InstallmentPrepayment',
          createdById: userId,
        },
        tx,
      );

      const cardEntry = await this.cardLedger.postEntry(
        {
          userId,
          creditCardId: card.id,
          type: 'PAYMENT',
          amount: -dto.amount,
          occurredOn: dto.paymentDate,
          description: `Anticipo de mensualidades ${card.alias}`,
          sourceType: 'InstallmentPrepayment',
          createdById: userId,
        },
        tx,
      );

      const payment = await tx.cardPayment.create({
        data: {
          userId,
          creditCardId: card.id,
          cashAccountId: account.id,
          installmentPlanId: plan.id,
          cashMovementId: cashMovement.id,
          cardLedgerEntryId: cardEntry.id,
          amount: dto.amount,
          paymentDate: dto.paymentDate,
          type: settled ? 'PLAN_PAYOFF' : 'INSTALLMENT_PREPAYMENT',
          status: 'APPLIED',
          notes: dto.notes,
        },
      });

      const allocations: Array<{ installmentId: string; amount: number }> = [];
      let remaining = dto.amount;

      for (const installment of pending) {
        if (remaining <= 0) {
          break;
        }

        const outstanding = installment.totalAmount - installment.paidAmount;
        if (outstanding <= 0) {
          continue;
        }

        const applied = Math.min(remaining, outstanding);
        const paidAmount = installment.paidAmount + applied;
        const fullyPaid = paidAmount >= installment.totalAmount;

        await tx.installment.update({
          where: { id: installment.id },
          data: {
            paidAmount,
            status: fullyPaid ? 'PAID' : 'PARTIALLY_PAID',
            paidAt: fullyPaid ? todayDateToUtc(today) : installment.paidAt,
          },
        });

        await tx.paymentAllocation.create({
          data: {
            userId,
            cardPaymentId: payment.id,
            statementId: installment.statementId,
            installmentId: installment.id,
            targetType: 'INSTALLMENT',
            amount: applied,
          },
        });

        allocations.push({ installmentId: installment.id, amount: applied });
        remaining -= applied;
      }

      await tx.cashMovement.update({
        where: { id: cashMovement.id },
        data: { sourceId: payment.id },
      });
      await tx.cardLedgerEntry.update({
        where: { id: cardEntry.id },
        data: { sourceId: payment.id },
      });

      await this.installments.refreshPlanState(plan.id, tx);

      await this.audit.record(
        {
          action: 'installment_plan.prepayment',
          entityType: 'InstallmentPlan',
          entityId: plan.id,
          userId,
          actorUserId: userId,
          changes: { amount: dto.amount, paymentDate: dto.paymentDate, settled },
          ...meta,
        },
        tx,
      );

      return { paymentId: payment.id, allocations };
    });

    return {
      plan: await this.getPlan(userId, planId),
      paymentId: result.paymentId,
      allocations: result.allocations,
      settled,
    };
  }
}

function todayDateToUtc(date: string): Date {
  return new Date(`${date}T12:00:00.000Z`);
}
