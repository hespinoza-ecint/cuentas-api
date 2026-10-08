import { Injectable } from '@nestjs/common';
import { BadRequestError, UnauthorizedError } from '../../common/errors/http-errors';
import { RequestMeta } from '../../common/http/request-meta';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SessionsRepository } from '../auth/repositories/sessions.repository';
import { PasswordService } from '../auth/services/password.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { ResetDataDto } from './dto/reset-data.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import {
  toUserResponse,
  toUserSettingsResponse,
  UserResponseDto,
  UserSettingsResponseDto,
} from './dto/user-response.dto';
import { UsersRepository } from './repositories/users.repository';

export interface ResetDataResult {
  message: string;
  scope: 'ALL' | 'CARDS';
  deleted: Record<string, number>;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersRepository,
    private readonly sessions: SessionsRepository,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
  ) {}

  async getMe(userId: string): Promise<UserResponseDto> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedError('La cuenta ya no esta disponible.');
    }
    return toUserResponse(user);
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
    meta: RequestMeta,
  ): Promise<UserResponseDto> {
    const current = await this.users.findById(userId);
    if (!current) {
      throw new UnauthorizedError('La cuenta ya no esta disponible.');
    }

    const data = {
      firstName: dto.firstName ?? current.firstName,
      lastName: dto.lastName ?? current.lastName,
    };

    if (data.firstName === current.firstName && data.lastName === current.lastName) {
      return toUserResponse(current);
    }

    const updated = await this.users.updateProfile(userId, data);

    await this.audit.record({
      action: 'user.profile.updated',
      entityType: 'User',
      entityId: userId,
      userId,
      actorUserId: userId,
      changes: {
        before: { firstName: current.firstName, lastName: current.lastName },
        after: data,
      },
      ...meta,
    });

    return toUserResponse(updated);
  }

  async changePassword(
    userId: string,
    currentSessionId: string,
    dto: ChangePasswordDto,
    meta: RequestMeta,
  ): Promise<{ message: string }> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedError('La cuenta ya no esta disponible.');
    }

    const validCurrent = await this.passwords.verify(user.passwordHash, dto.currentPassword);
    if (!validCurrent) {
      throw new BadRequestError('La contrasena actual no es correcta.', {
        reason: 'INVALID_CURRENT_PASSWORD',
      });
    }

    const samePassword = await this.passwords.verify(user.passwordHash, dto.newPassword);
    if (samePassword) {
      throw new BadRequestError('La nueva contrasena debe ser diferente a la actual.', {
        reason: 'PASSWORD_UNCHANGED',
      });
    }

    const passwordHash = await this.passwords.hash(dto.newPassword);

    await this.prisma.$transaction(async (tx) => {
      await this.users.updatePassword(userId, passwordHash, tx);
      // Se cierran todas las sesiones excepto la actual.
      await this.sessions.revokeAllForUser(userId, 'PASSWORD_CHANGED', currentSessionId, tx);
      await this.audit.record(
        {
          action: 'auth.password.changed',
          entityType: 'User',
          entityId: userId,
          userId,
          actorUserId: userId,
          ...meta,
        },
        tx,
      );
    });

    return { message: 'Contrasena actualizada. Se cerraron las demas sesiones.' };
  }

  async getSettings(userId: string): Promise<UserSettingsResponseDto> {
    const settings = await this.users.ensureSettings(userId);
    return toUserSettingsResponse(settings);
  }

  async updateSettings(
    userId: string,
    dto: UpdateSettingsDto,
    meta: RequestMeta,
  ): Promise<UserSettingsResponseDto> {
    const before = await this.users.ensureSettings(userId);
    const updated = await this.users.updateSettings(userId, dto);

    await this.audit.record({
      action: 'user.settings.updated',
      entityType: 'UserSettings',
      entityId: userId,
      userId,
      actorUserId: userId,
      changes: { before: toUserSettingsResponse(before), after: toUserSettingsResponse(updated) },
      ...meta,
    });

    return toUserSettingsResponse(updated);
  }

  async requestDeletion(
    userId: string,
    dto: DeleteAccountDto,
    meta: RequestMeta,
  ): Promise<{ message: string }> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedError('La cuenta ya no esta disponible.');
    }

    const validPassword = await this.passwords.verify(user.passwordHash, dto.password);
    if (!validPassword) {
      throw new BadRequestError('La contrasena no es correcta.', { reason: 'INVALID_PASSWORD' });
    }

    await this.prisma.$transaction(async (tx) => {
      await this.users.requestDeletion(userId, tx);
      await this.sessions.revokeAllForUser(userId, 'DELETION_REQUESTED', undefined, tx);
      await this.audit.record(
        {
          action: 'user.deletion.requested',
          entityType: 'User',
          entityId: userId,
          userId,
          actorUserId: userId,
          ...meta,
        },
        tx,
      );
    });

    return {
      message:
        'La cuenta se eliminara definitivamente en 30 dias. Inicia sesion para cancelar la eliminacion.',
    };
  }

  async cancelDeletion(userId: string, meta: RequestMeta): Promise<{ message: string }> {
    await this.users.cancelDeletion(userId);
    await this.audit.record({
      action: 'user.deletion.cancelled',
      entityType: 'User',
      entityId: userId,
      userId,
      actorUserId: userId,
      ...meta,
    });

    return { message: 'La eliminacion fue cancelada. Tu cuenta esta activa de nuevo.' };
  }

  /**
   * Restablece los datos del usuario segun el alcance:
   * - `ALL` (default): todo lo que la app lleva por el (deja el unico rastro
   *   de auditoria con los conteos eliminados).
   * - `CARDS`: solo el dominio de tarjetas (tarjetas, libro, cortes, pagos,
   *   asignaciones, compras, planes y mensualidades). El efectivo, los ingresos,
   *   los gastos y la auditoria se conservan; tambien los movimientos de
   *   efectivo de los pagos de tarjeta. Los recurrentes de efectivo se
   *   conservan; los ligados a una tarjeta se van con ella porque no pueden
   *   existir sin tarjeta.
   * Solo se permite con la contrasena actual.
   */
  async resetData(
    userId: string,
    dto: ResetDataDto,
    meta: RequestMeta,
  ): Promise<ResetDataResult> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedError('La cuenta ya no esta disponible.');
    }

    const validPassword = await this.passwords.verify(user.passwordHash, dto.password);
    if (!validPassword) {
      throw new BadRequestError('La contrasena no es correcta.', { reason: 'INVALID_PASSWORD' });
    }

    const scope = dto.scope ?? 'ALL';
    const deleted: Record<string, number> = {};

    await this.prisma.$transaction(async (tx) => {
      const wipe = async (name: string, run: () => Promise<{ count: number }>) => {
        deleted[name] = (await run()).count;
      };

      // Dominio de tarjetas (orden hijos -> padres por las FK Restrict).
      await wipe('paymentAllocations', () =>
        tx.paymentAllocation.deleteMany({ where: { userId } }),
      );
      await wipe('installments', () => tx.installment.deleteMany({ where: { userId } }));
      await wipe('cardPayments', () => tx.cardPayment.deleteMany({ where: { userId } }));
      await wipe('installmentPlans', () => tx.installmentPlan.deleteMany({ where: { userId } }));
      await wipe('purchases', () => tx.purchase.deleteMany({ where: { userId } }));
      await wipe('cardLedgerEntries', () =>
        tx.cardLedgerEntry.deleteMany({ where: { userId } }),
      );
      await wipe('cardStatements', () => tx.cardStatement.deleteMany({ where: { userId } }));

      // Los recurrentes configurados con tarjeta no sobreviven al borrado de
      // las tarjetas (FK Restrict); con CARDS solo se van esos.
      await wipe('recurringExpenses', () =>
        tx.recurringExpense.deleteMany({
          where: {
            userId,
            ...(scope === 'CARDS' ? { creditCardId: { not: null } } : {}),
          },
        }),
      );

      await wipe('creditCards', () => tx.creditCard.deleteMany({ where: { userId } }));

      if (scope === 'ALL') {
        await wipe('expenses', () => tx.expense.deleteMany({ where: { userId } }));
        await wipe('incomeTransactions', () =>
          tx.incomeTransaction.deleteMany({ where: { userId } }),
        );
        await wipe('cashMovements', () => tx.cashMovement.deleteMany({ where: { userId } }));
        await wipe('incomeSchedules', () => tx.incomeSchedule.deleteMany({ where: { userId } }));
        await wipe('incomeSources', () => tx.incomeSource.deleteMany({ where: { userId } }));
        await wipe('cashAccounts', () => tx.cashAccount.deleteMany({ where: { userId } }));
        await wipe('recommendations', () =>
          tx.recommendationHistory.deleteMany({ where: { userId } }),
        );
        await wipe('ruleOverrides', () =>
          tx.userRecommendationRuleOverride.deleteMany({ where: { userId } }),
        );
        await wipe('categories', () =>
          tx.category.deleteMany({ where: { userId, isSystem: false } }),
        );
        await wipe('idempotencyRecords', () =>
          tx.idempotencyRecord.deleteMany({ where: { userId } }),
        );
        await wipe('auditLogs', () =>
          tx.auditLog.deleteMany({ where: { OR: [{ userId }, { actorUserId: userId }] } }),
        );
      }

      await this.audit.record(
        {
          action: 'user.data.reset',
          entityType: 'User',
          entityId: userId,
          userId,
          actorUserId: userId,
          changes: { scope, deleted },
          ...meta,
        },
        tx,
      );
    });

    return {
      message:
        scope === 'CARDS'
          ? 'Tarjetas restablecidas. Tu efectivo, ingresos, gastos y preferencias siguen intactos.'
          : 'Datos restablecidos. Tu cuenta, sesion y preferencias siguen intactas.',
      scope,
      deleted,
    };
  }

  /**
   * Exportacion completa de los datos del usuario: perfil, configuracion,
   * sesiones y todas las colecciones financieras.
   */
  async exportData(userId: string): Promise<Record<string, unknown>> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedError('La cuenta ya no esta disponible.');
    }

    const settings = await this.users.ensureSettings(userId);
    const sessions = await this.sessions.listActiveByUser(userId);
    const orderBy = { createdAt: 'asc' } as const;

    const [
      cashAccounts,
      cashMovements,
      categories,
      incomeSources,
      incomeSchedules,
      incomeTransactions,
      recurringExpenses,
      expenses,
      creditCards,
      cardLedgerEntries,
      cardStatements,
      cardPayments,
      paymentAllocations,
      purchases,
      installmentPlans,
      installments,
      recommendationHistory,
      ruleOverrides,
    ] = await Promise.all([
      this.prisma.cashAccount.findMany({ where: { userId }, orderBy }),
      this.prisma.cashMovement.findMany({ where: { userId }, orderBy }),
      this.prisma.category.findMany({ where: { userId }, orderBy }),
      this.prisma.incomeSource.findMany({ where: { userId }, orderBy }),
      this.prisma.incomeSchedule.findMany({ where: { userId }, orderBy }),
      this.prisma.incomeTransaction.findMany({ where: { userId }, orderBy }),
      this.prisma.recurringExpense.findMany({ where: { userId }, orderBy }),
      this.prisma.expense.findMany({ where: { userId }, orderBy }),
      this.prisma.creditCard.findMany({ where: { userId }, orderBy }),
      this.prisma.cardLedgerEntry.findMany({ where: { userId }, orderBy }),
      this.prisma.cardStatement.findMany({ where: { userId }, orderBy }),
      this.prisma.cardPayment.findMany({ where: { userId }, orderBy }),
      this.prisma.paymentAllocation.findMany({ where: { userId }, orderBy }),
      this.prisma.purchase.findMany({ where: { userId }, orderBy }),
      this.prisma.installmentPlan.findMany({ where: { userId }, orderBy }),
      this.prisma.installment.findMany({ where: { userId }, orderBy }),
      this.prisma.recommendationHistory.findMany({ where: { userId }, orderBy }),
      this.prisma.userRecommendationRuleOverride.findMany({ where: { userId }, orderBy }),
    ]);

    return {
      exportedAt: new Date().toISOString(),
      schemaVersion: 2,
      user: toUserResponse(user),
      settings: toUserSettingsResponse(settings),
      sessions: sessions.map((session) => ({
        id: session.id,
        clientType: session.clientType,
        deviceName: session.deviceName,
        ip: session.ip,
        userAgent: session.userAgent,
        createdAt: session.createdAt,
        lastUsedAt: session.lastUsedAt,
      })),
      financial: {
        cashAccounts,
        cashMovements,
        categories,
        incomeSources,
        incomeSchedules,
        incomeTransactions,
        recurringExpenses,
        expenses,
        creditCards,
        cardLedgerEntries,
        cardStatements,
        cardPayments,
        paymentAllocations,
        purchases,
        installmentPlans,
        installments,
        recommendationHistory,
        ruleOverrides,
      },
    };
  }
}
