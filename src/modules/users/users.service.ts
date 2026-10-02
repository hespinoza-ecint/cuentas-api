import { Injectable } from '@nestjs/common';
import { BadRequestError, UnauthorizedError } from '../../common/errors/http-errors';
import { RequestMeta } from '../../common/http/request-meta';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SessionsRepository } from '../auth/repositories/sessions.repository';
import { PasswordService } from '../auth/services/password.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import {
  toUserResponse,
  toUserSettingsResponse,
  UserResponseDto,
  UserSettingsResponseDto,
} from './dto/user-response.dto';
import { UsersRepository } from './repositories/users.repository';

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
   * Exportacion completa de los datos del usuario. Las colecciones
   * financieras se agregaran en las fases 3 a 6.
   */
  async exportData(userId: string): Promise<Record<string, unknown>> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedError('La cuenta ya no esta disponible.');
    }

    const settings = await this.users.ensureSettings(userId);
    const sessions = await this.sessions.listActiveByUser(userId);

    return {
      exportedAt: new Date().toISOString(),
      schemaVersion: 1,
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
      financial: {},
    };
  }
}
