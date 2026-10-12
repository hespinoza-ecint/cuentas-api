import { Injectable } from '@nestjs/common';
import { CardStatement, CreditCard, PaymentAllocation, Prisma } from '@prisma/client';
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
import { addDays, compareLocalDates, daysBetween } from '../../domain/shared/local-date';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { HolidayCalendarService } from '../holidays/holiday-calendar.service';
import { InstallmentsService } from '../installments/installments.service';
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
  estimatedInterest: number;
  estimatedInterestDays: number;
}

@Injectable()
export class StatementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cards: CardsRepository,
    private readonly cardsService: CardsService,
    private readonly holidays: HolidayCalendarService,
    private readonly datePolicy: FinancialDatePolicy,
    private readonly installmentsService: InstallmentsService,
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
      select: { amount: true, type: true, occurredOn: true, sourceType: true },
    });

    // RN-17: las mensualidades se exigen por su monto completo; el avance de
    // pago vive en paidAmount (asignaciones), no restando lo exigible.
    const installments = await this.prisma.installment.findMany({
      where: {
        userId,
        plan: { creditCardId: card.id },
        status: { not: 'CANCELLED' },
      },
      select: { statementCutDate: true, totalAmount: true },
    });
    const dueByCut = new Map<string, number>();
    for (const installment of installments) {
      dueByCut.set(
        installment.statementCutDate,
        (dueByCut.get(installment.statementCutDate) ?? 0) + installment.totalAmount,
      );
    }

    const config: DueDateConfig = {
      mode: card.dueDateMode as DueDateConfig['mode'],
      dueDay: card.dueDay,
      dueDaysAfterCut: card.dueDaysAfterCut,
      rule: card.dueNonBusinessDayRule as NonBusinessDayRule,
    };

    await this.prisma.$transaction(
      async (tx) => {
        let previousUnpaid = 0;

        for (const cutDate of cuts) {
          const periodStart = statementPeriodStart(
            card.cutDay,
            cutDate,
            card.sameDayCutIncluded,
          );

          const statementBalance = entries
            .filter((entry) => compareLocalDates(entry.occurredOn, cutDate) <= 0)
            .reduce((total, entry) => total + entry.amount, 0);

          const regularCycleCharges = this.periodCharges(
            entries,
            periodStart,
            cutDate,
            card.sameDayCutIncluded,
          );

          // RN-17: pago para no generar intereses = cargos del periodo +
          // mensualidades exigibles + saldo anterior no cubierto.
          const dueInstallments = dueByCut.get(cutDate) ?? 0;
          const noInterestPaymentCalc = regularCycleCharges + dueInstallments + previousUnpaid;

          const dueDate = dueDateFor(cutDate, config, holidays);
          const minimumPaymentEstimated = Math.max(
            Math.round((statementBalance * MINIMUM_PAYMENT_BPS) / 10_000),
            0,
          );

          const base = {
            periodStart,
            dueDate,
            statementBalance,
            cycleCharges: regularCycleCharges,
            noInterestPaymentCalc,
            minimumPaymentEstimated,
          };

          let statement = await this.cards.findStatement(card.id, cutDate, tx);
          if (!statement) {
            statement = await this.cards.createStatement(
              {
                userId,
                creditCardId: card.id,
                cutDate,
                ...base,
                paidAmount: 0,
                status: 'CLOSED',
              },
              tx,
            );
          } else {
            statement = await this.cards.updateStatement(statement.id, base, tx);
          }

          // Las mensualidades del corte quedan facturadas y ligadas al estado
          // (tambien las pagadas parcialmente por anticipos).
          await tx.installment.updateMany({
            where: {
              userId,
              plan: { creditCardId: card.id },
              statementCutDate: cutDate,
              statementId: null,
              status: { in: ['SCHEDULED', 'PARTIALLY_PAID'] },
            },
            data: { statementId: statement.id, status: 'BILLED' },
          });

          // RN-23: los anticipos del ciclo abierto se abonan a este corte.
          await this.adoptOrphanAllocations(tx, card.id, statement, noInterestPaymentCalc);

          const amountToAvoidInterest =
            statement.noInterestPaymentReported ?? noInterestPaymentCalc;
          const paid = await this.cards.sumAllocations(statement.id, tx);
          const status = statementStatusFor(amountToAvoidInterest, paid, statement.dueDate, today);

          if (paid !== statement.paidAmount || status !== statement.status) {
            await this.cards.updateStatement(statement.id, { paidAmount: paid, status }, tx);
          }

          previousUnpaid = Math.max(amountToAvoidInterest - paid, 0);
        }
      },
      { timeout: 15_000 },
    );

    return this.cards.listStatements(userId, card.id);
  }

  /**
   * Cargos regulares del periodo (RN-14 y RN-17): excluye las compras a meses
   * (se cobran por mensualidad) e incluye los creditos del periodo (devolucion
   * de compras eliminadas y ajustes negativos).
   */
  private periodCharges(
    entries: Array<{ amount: number; type: string; occurredOn: string; sourceType: string | null }>,
    periodStart: string,
    cutDate: string,
    sameDayCutIncluded: boolean,
  ): number {
    return entries
      .filter(
        (entry) =>
          isInStatementPeriod(entry.occurredOn, periodStart, cutDate, sameDayCutIncluded) &&
          entry.sourceType !== 'InstallmentPlan' &&
          ((CHARGE_TYPES.has(entry.type) && entry.amount > 0) ||
            ((entry.type === 'REFUND' || entry.type === 'ADJUSTMENT') && entry.amount < 0)),
      )
      .reduce((total, entry) => total + entry.amount, 0);
  }

  /**
   * RN-23: adopta las asignaciones huerfanas (pagos hechos antes del corte)
   * por este corte: primero las ligadas a mensualidades facturadas aqui y
   * despues el credito generico contra lo exigible. Si el credito excede lo
   * exigible, conserva el sobrante como revolvente para cortes posteriores.
   */
  private async adoptOrphanAllocations(
    tx: Prisma.TransactionClient,
    cardId: string,
    statement: CardStatement,
    amountToAvoidInterest: number,
  ): Promise<void> {
    await tx.paymentAllocation.updateMany({
      where: {
        statementId: null,
        targetType: 'INSTALLMENT',
        cardPayment: { status: 'APPLIED', creditCardId: cardId },
        installment: { statementId: statement.id },
      },
      data: { statementId: statement.id },
    });

    const paid = await this.cards.sumAllocations(statement.id, tx);
    let outstanding = Math.max(amountToAvoidInterest - paid, 0);
    if (outstanding <= 0) {
      return;
    }

    const orphans = await tx.paymentAllocation.findMany({
      where: {
        statementId: null,
        targetType: { in: ['REVOLVING', 'STATEMENT'] },
        cardPayment: { status: 'APPLIED', creditCardId: cardId },
      },
      orderBy: { createdAt: 'asc' },
    });

    for (const orphan of orphans) {
      if (outstanding <= 0) {
        break;
      }

      const applied = Math.min(orphan.amount, outstanding);
      await tx.paymentAllocation.update({
        where: { id: orphan.id },
        data: { statementId: statement.id, amount: applied },
      });
      if (applied < orphan.amount) {
        await tx.paymentAllocation.create({
          data: {
            userId: orphan.userId,
            cardPaymentId: orphan.cardPaymentId,
            statementId: null,
            targetType: 'REVOLVING',
            amount: orphan.amount - applied,
          },
        });
      }

      outstanding -= applied;
    }
  }

  async list(userId: string, cardId: string): Promise<Array<CardStatement & { estimatedInterest: number; estimatedInterestDays: number }>> {
    const statements = await this.sync(userId, cardId);
    const card = await this.cardsService.get(userId, cardId);
    const today = await this.datePolicy.today(userId);
    return statements.map((statement) => this.withEstimatedInterest(statement, card, today));
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

    const card = await this.cardsService.get(userId, cardId);
    const today = await this.datePolicy.today(userId);

    return { ...this.withEstimatedInterest(statement, card, today), allocations };
  }

  /**
   * RN-22: interes estimado (aproximado) cuando el corte esta vencido y no se
   * pago el total: saldo insoluto x tasa anual / 360 x dias x 1.16 (IVA).
   */
  private withEstimatedInterest(
    statement: CardStatement,
    card: CreditCard,
    today: string,
  ): CardStatement & { estimatedInterest: number; estimatedInterestDays: number } {
    const amountToAvoidInterest =
      statement.noInterestPaymentReported ?? statement.noInterestPaymentCalc;
    const outstanding = Math.max(amountToAvoidInterest - statement.paidAmount, 0);
    const days = Math.max(daysBetween(statement.dueDate, today), 0);
    const isOverdue = outstanding > 0 && compareLocalDates(statement.dueDate, today) < 0;

    if (!isOverdue || card.annualRateBps <= 0) {
      return { ...statement, estimatedInterest: 0, estimatedInterestDays: 0 };
    }

    const estimatedInterest = Math.round(
      ((outstanding * (card.annualRateBps / 10_000)) / 360) * days * 1.16,
    );

    return { ...statement, estimatedInterest, estimatedInterestDays: days };
  }

  /** Ciclo abierto (aun sin corte): previsto para el motor y la PWA. */
  async currentCycle(userId: string, cardId: string) {
    const card = await this.cardsService.get(userId, cardId);
    const today = await this.datePolicy.today(userId);

    const lastCutDate = previousCutDate(card.cutDay, today);
    const nextCutDateValue = nextCutDate(card.cutDay, today);
    const currentPeriodStart = statementPeriodStart(
      card.cutDay,
      nextCutDateValue,
      card.sameDayCutIncluded,
    );

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
      select: { amount: true, type: true, occurredOn: true, sourceType: true },
    });

    // Misma regla que los cortes: excluye compras a meses y resta creditos.
    const cycleChargesToDate = this.periodCharges(
      entries,
      currentPeriodStart,
      nextCutDateValue,
      card.sameDayCutIncluded,
    );

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

  /**
   * Obligacion proyectada del siguiente corte (aun sin materializar): cargos
   * del ciclo abierto + mensualidades que se facturaran ahi menos el credito
   * disponible de anticipos genericos. La usan el flujo, el dashboard y el
   * motor de recomendaciones para no ignorar el ciclo abierto.
   */
  async projectedNextCut(
    userId: string,
    card: CreditCard,
  ): Promise<{ cutDate: string; dueDate: string; amount: number }> {
    const today = await this.datePolicy.today(userId);
    const cutDate = nextCutDate(card.cutDay, today);
    const periodStart = statementPeriodStart(card.cutDay, cutDate, card.sameDayCutIncluded);

    const [settings, entries, installments, orphanCredit] = await Promise.all([
      this.prisma.userSettings.upsert({
        where: { userId },
        update: {},
        create: { userId },
      }),
      this.prisma.cardLedgerEntry.findMany({
        where: { userId, creditCardId: card.id, occurredOn: { gte: periodStart, lte: today } },
        select: { amount: true, type: true, occurredOn: true, sourceType: true },
      }),
      this.prisma.installment.findMany({
        where: {
          userId,
          plan: { creditCardId: card.id },
          statementCutDate: cutDate,
          status: { in: ['SCHEDULED', 'PARTIALLY_PAID'] },
        },
        select: { totalAmount: true, paidAmount: true },
      }),
      this.prisma.paymentAllocation.aggregate({
        where: {
          statementId: null,
          targetType: { in: ['REVOLVING', 'STATEMENT'] },
          cardPayment: { status: 'APPLIED', creditCardId: card.id },
        },
        _sum: { amount: true },
      }),
    ]);

    const charges = this.periodCharges(entries, periodStart, cutDate, card.sameDayCutIncluded);
    const dueInstallments = installments.reduce(
      (total, installment) =>
        total + Math.max(installment.totalAmount - installment.paidAmount, 0),
      0,
    );
    const credit = Math.max(orphanCredit._sum.amount ?? 0, 0);

    const holidays = await this.holidays.getHolidaySet(
      settings.holidayCalendarCode,
      addDays(cutDate, -15),
      addDays(cutDate, 90),
    );
    const dueDate = dueDateFor(
      cutDate,
      {
        mode: card.dueDateMode as DueDateConfig['mode'],
        dueDay: card.dueDay,
        dueDaysAfterCut: card.dueDaysAfterCut,
        rule: card.dueNonBusinessDayRule as NonBusinessDayRule,
      },
      holidays,
    );

    return {
      cutDate,
      dueDate,
      amount: Math.max(charges + dueInstallments - credit, 0),
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

  /** Aplica un pago a los cortes exigibles (RN-23), abonando mensualidades. */
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
    const touchedPlans = new Set<string>();
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
      let leftover = applied;

      // 1) Mensualidades exigibles del corte, de la mas antigua a la mas nueva.
      const installments = await tx.installment.findMany({
        where: {
          userId,
          statementId: statement.id,
          status: { in: ['BILLED', 'PARTIALLY_PAID'] },
        },
        orderBy: { number: 'asc' },
      });

      for (const installment of installments) {
        if (leftover <= 0) {
          break;
        }

        const installmentOutstanding = installment.totalAmount - installment.paidAmount;
        if (installmentOutstanding <= 0) {
          continue;
        }

        const installmentApplied = Math.min(leftover, installmentOutstanding);
        const paidAmount = installment.paidAmount + installmentApplied;
        const fullyPaid = paidAmount >= installment.totalAmount;

        await tx.installment.update({
          where: { id: installment.id },
          data: {
            paidAmount,
            status: fullyPaid ? 'PAID' : 'PARTIALLY_PAID',
            paidAt: fullyPaid ? new Date() : installment.paidAt,
          },
        });

        allocations.push(
          await tx.paymentAllocation.create({
            data: {
              userId,
              cardPaymentId: paymentId,
              statementId: statement.id,
              installmentId: installment.id,
              targetType: 'INSTALLMENT',
              amount: installmentApplied,
            },
          }),
        );

        touchedPlans.add(installment.planId);
        leftover -= installmentApplied;
      }

      // 2) El resto del monto aplicado cubre cargos regulares del corte.
      if (leftover > 0) {
        allocations.push(
          await tx.paymentAllocation.create({
            data: {
              userId,
              cardPaymentId: paymentId,
              statementId: statement.id,
              targetType: 'STATEMENT',
              amount: leftover,
            },
          }),
        );
      }

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

    for (const planId of touchedPlans) {
      await this.installmentsService.refreshPlanState(planId, tx);
    }

    return { allocations, firstStatementId };
  }
}
