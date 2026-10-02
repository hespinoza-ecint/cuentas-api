import { Injectable } from '@nestjs/common';
import { CardStatement, PaymentAllocation, Prisma } from '@prisma/client';
import { NotFoundError } from '../../common/errors/http-errors';
import { RequestMeta } from '../../common/http/request-meta';
import { NonBusinessDayRule } from '../../domain/calendar/business-calendar';
import {
  DueDateConfig,
  dueDateFor,
  enumerateCutDates,
  isInStatementPeriod,
  nextCutDate,
  previousCutDate,
  statementPeriodStart,
  statementStatusFor,
} from '../../domain/cards/card-cycle';
import { addDays, compareLocalDates } from '../../domain/shared/local-date';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { HolidayCalendarService } from '../holidays/holiday-calendar.service';
import { FinancialDatePolicy } from '../ledger/financial-date.policy';
import { UpdateStatementDto } from './dto/card.dto';
import { CardsRepository } from './repositories/cards.repository';
import { CardsService } from './cards.service';

const CHARGE_TYPES = new Set([
  'OPENING_BALANCE',
  'PURCHASE',
  'INSTALLMENT_PRINCIPAL',
  'INTEREST',
  'FEE',
  'ANNUAL_FEE',
  'ADJUSTMENT',
]);

const MINIMUM_PAYMENT_BPS = 125; // 1.25% estimado del saldo al corte

export interface StatementWithAllocations extends CardStatement {
  allocations: Array<PaymentAllocation & { cardPayment?: { id: string; paymentDate: string; amount: number } }>;
}

@Injectable()
export class StatementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cards: CardsRepository,
    private readonly cardsService: CardsService,
    private readonly holidays: HolidayCalendarService,
    private readonly datePolicy: FinancialDatePolicy,
    private readonly audit: AuditService,
  ) {}

  /**
   * Materializa (crea o actualiza) los cortes ya ocurridos a partir del libro
   * de la tarjeta. El libro es la fuente de verdad: los montos se recalculan.
   */
  async sync(userId: string, cardId: string): Promise<CardStatement[]> {
    const card = await this.cardsService.get(userId, cardId);

    const firstEntry = await this.prisma.cardLedgerEntry.findFirst({
      where: { userId, creditCardId: card.id },
      orderBy: { occurredOn: 'asc' },
      select: { occurredOn: true },
    });
    if (!firstEntry) {
      return [];
    }

    const today = await this.datePolicy.today(userId);
    const cuts = enumerateCutDates(card.cutDay, firstEntry.occurredOn, today);
    if (cuts.length === 0) {
      return this.cards.listStatements(userId, card.id);
    }

    const settings = await this.prisma.userSettings.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
    const holidays = await this.holidays.getHolidaySet(
      settings.holidayCalendarCode,
      addDays(cuts[0], -15),
      addDays(today, 90),
    );

    const entries = await this.prisma.cardLedgerEntry.findMany({
      where: { userId, creditCardId: card.id },
      select: { amount: true, type: true, occurredOn: true },
    });

    const config: DueDateConfig = {
      mode: card.dueDateMode as DueDateConfig['mode'],
      dueDay: card.dueDay,
      dueDaysAfterCut: card.dueDaysAfterCut,
      rule: card.dueNonBusinessDayRule as NonBusinessDayRule,
    };

    for (const cutDate of cuts) {
      const periodStart = statementPeriodStart(card.cutDay, cutDate);

      const statementBalance = entries
        .filter((entry) => compareLocalDates(entry.occurredOn, cutDate) <= 0)
        .reduce((total, entry) => total + entry.amount, 0);

      const cycleCharges = entries
        .filter(
          (entry) =>
            isInStatementPeriod(
              entry.occurredOn,
              periodStart,
              cutDate,
              card.sameDayCutIncluded,
            ) &&
            CHARGE_TYPES.has(entry.type) &&
            entry.amount > 0,
        )
        .reduce((total, entry) => total + entry.amount, 0);

      const dueDate = dueDateFor(cutDate, config, holidays);
      const minimumPaymentEstimated = Math.max(
        Math.round((statementBalance * MINIMUM_PAYMENT_BPS) / 10_000),
        0,
      );

      const base = {
        periodStart,
        dueDate,
        statementBalance,
        cycleCharges,
        noInterestPaymentCalc: statementBalance,
        minimumPaymentEstimated,
      };

      let statement = await this.cards.findStatement(card.id, cutDate);
      if (!statement) {
        statement = await this.cards.createStatement({
          userId,
          creditCardId: card.id,
          cutDate,
          ...base,
          paidAmount: 0,
          status: 'CLOSED',
        });
      } else {
        statement = await this.cards.updateStatement(statement.id, base);
      }

      const paid = await this.cards.sumAllocations(statement.id);
      const amountToAvoidInterest =
        statement.noInterestPaymentReported ?? statement.noInterestPaymentCalc;
      const status = statementStatusFor(amountToAvoidInterest, paid, statement.dueDate, today);

      if (paid !== statement.paidAmount || status !== statement.status) {
        await this.cards.updateStatement(statement.id, {
          paidAmount: paid,
          status,
        });
      }
    }

    return this.cards.listStatements(userId, card.id);
  }

  async list(userId: string, cardId: string): Promise<CardStatement[]> {
    return this.sync(userId, cardId);
  }

  async get(userId: string, cardId: string, statementId: string): Promise<StatementWithAllocations> {
    await this.sync(userId, cardId);

    const statement = await this.cards.findStatementById(userId, cardId, statementId);
    if (!statement) {
      throw new NotFoundError('El estado de cuenta no existe.', { reason: 'STATEMENT_NOT_FOUND' });
    }

    const allocations = await this.prisma.paymentAllocation.findMany({
      where: { statementId },
      orderBy: { createdAt: 'asc' },
      include: { cardPayment: { select: { id: true, paymentDate: true, amount: true } } },
    });

    return { ...statement, allocations };
  }

  /** Ciclo abierto (aun sin corte): previsto para el motor y la PWA. */
  async currentCycle(userId: string, cardId: string) {
    const card = await this.cardsService.get(userId, cardId);
    const today = await this.datePolicy.today(userId);

    const lastCutDate = previousCutDate(card.cutDay, today);
    const nextCutDateValue = nextCutDate(card.cutDay, today);
    const currentPeriodStart = statementPeriodStart(card.cutDay, nextCutDateValue);

    const settings = await this.prisma.userSettings.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
    const holidays = await this.holidays.getHolidaySet(
      settings.holidayCalendarCode,
      addDays(currentPeriodStart, -15),
      addDays(nextCutDateValue, 90),
    );

    const entries = await this.prisma.cardLedgerEntry.findMany({
      where: {
        userId,
        creditCardId: card.id,
        occurredOn: { gte: currentPeriodStart, lte: today },
      },
      select: { amount: true, type: true, occurredOn: true },
    });

    const cycleChargesToDate = entries
      .filter((entry) => CHARGE_TYPES.has(entry.type) && entry.amount > 0)
      .reduce((total, entry) => total + entry.amount, 0);

    const dueDate = dueDateFor(
      nextCutDateValue,
      {
        mode: card.dueDateMode as DueDateConfig['mode'],
        dueDay: card.dueDay,
        dueDaysAfterCut: card.dueDaysAfterCut,
        rule: card.dueNonBusinessDayRule as NonBusinessDayRule,
      },
      holidays,
    );

    return {
      cardId: card.id,
      today,
      lastCutDate,
      nextCutDate: nextCutDateValue,
      currentPeriodStart,
      cycleChargesToDate,
      currentBalance: card.currentBalance,
      availableCredit: card.availableCredit,
      projectedDueDate: dueDate,
    };
  }

  /** RN-16 y RN-17: el usuario puede sobrescribir el minimo y el pago requerido. */
  async updateReportedAmounts(
    userId: string,
    cardId: string,
    statementId: string,
    dto: UpdateStatementDto,
    meta: RequestMeta,
  ): Promise<CardStatement> {
    await this.sync(userId, cardId);

    const statement = await this.cards.findStatementById(userId, cardId, statementId);
    if (!statement) {
      throw new NotFoundError('El estado de cuenta no existe.', { reason: 'STATEMENT_NOT_FOUND' });
    }

    const today = await this.datePolicy.today(userId);
    const updated = await this.cards.updateStatement(statement.id, {
      ...(dto.noInterestPaymentReported !== undefined
        ? { noInterestPaymentReported: dto.noInterestPaymentReported }
        : {}),
      ...(dto.minimumPaymentReported !== undefined
        ? { minimumPaymentReported: dto.minimumPaymentReported }
        : {}),
    });

    const amountToAvoidInterest =
      updated.noInterestPaymentReported ?? updated.noInterestPaymentCalc;
    const paid = await this.cards.sumAllocations(updated.id);
    const finalStatement = await this.cards.updateStatement(updated.id, {
      status: statementStatusFor(amountToAvoidInterest, paid, updated.dueDate, today),
    });

    await this.audit.record({
      action: 'card_statement.reported_amounts_updated',
      entityType: 'CardStatement',
      entityId: statement.id,
      userId,
      actorUserId: userId,
      changes: { ...dto },
      ...meta,
    });

    return finalStatement;
  }

  /** Aplica un pago a los cortes con saldo exigible (RN-23). */
  async applyPaymentAllocations(
    userId: string,
    cardId: string,
    paymentId: string,
    amount: number,
    tx: Prisma.TransactionClient,
  ): Promise<{ allocations: PaymentAllocation[]; firstStatementId: string | null }> {
    const today = await this.datePolicy.today(userId);
    const statements = await tx.cardStatement.findMany({
      where: { userId, creditCardId: cardId, status: { not: 'PAID' } },
      orderBy: { cutDate: 'asc' },
    });

    const allocations: PaymentAllocation[] = [];
    let remaining = amount;
    let firstStatementId: string | null = null;

    for (const statement of statements) {
      if (remaining <= 0) {
        break;
      }

      const amountToAvoidInterest =
        statement.noInterestPaymentReported ?? statement.noInterestPaymentCalc;
      const outstanding = amountToAvoidInterest - statement.paidAmount;
      if (outstanding <= 0) {
        continue;
      }

      const applied = Math.min(remaining, outstanding);
      allocations.push(
        await tx.paymentAllocation.create({
          data: {
            userId,
            cardPaymentId: paymentId,
            statementId: statement.id,
            targetType: 'STATEMENT',
            amount: applied,
          },
        }),
      );

      const paidAmount = statement.paidAmount + applied;
      await tx.cardStatement.update({
        where: { id: statement.id },
        data: {
          paidAmount,
          status: statementStatusFor(amountToAvoidInterest, paidAmount, statement.dueDate, today),
        },
      });

      if (!firstStatementId) {
        firstStatementId = statement.id;
      }

      remaining -= applied;
    }

    if (remaining > 0) {
      allocations.push(
        await tx.paymentAllocation.create({
          data: {
            userId,
            cardPaymentId: paymentId,
            statementId: null,
            targetType: 'REVOLVING',
            amount: remaining,
          },
        }),
      );
    }

    return { allocations, firstStatementId };
  }
}
