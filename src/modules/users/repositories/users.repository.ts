import { Injectable } from '@nestjs/common';
import { Prisma, User, UserSettings } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

/**
 * Acceso a usuarios y su configuracion. Todas las operaciones usan el
 * `userId` del token; aqui no existe forma de leer un usuario por `id` sin
 * que el llamador ya sea ese usuario (el filtro se hace en los servicios).
 */
@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findFirst({ where: { email, deletedAt: null } });
  }

  findById(id: string): Promise<(User & { settings: UserSettings | null }) | null> {
    return this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: { settings: true },
    });
  }

  createWithSettings(
    data: { email: string; passwordHash: string; firstName: string; lastName: string },
    tx?: Prisma.TransactionClient,
  ): Promise<User> {
    const client = tx ?? this.prisma;
    return client.user.create({
      data: {
        ...data,
        settings: { create: {} },
      },
    });
  }

  async updateProfile(userId: string, data: { firstName: string; lastName: string }): Promise<User> {
    return this.prisma.user.update({ where: { id: userId }, data });
  }

  async updatePassword(
    userId: string,
    passwordHash: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.user.update({
      where: { id: userId },
      data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
    });
  }

  async setEmailVerified(userId: string, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? this.prisma;
    await client.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date(), status: 'ACTIVE' },
    });
  }

  async clearFailedLogins(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
  }

  /**
   * Suma un intento fallido. Al alcanzar el maximo se bloquea la cuenta por
   * `lockMinutes` y el contador se reinicia (para el siguiente periodo).
   */
  async registerFailedLogin(
    userId: string,
    maxAttempts: number,
    lockMinutes: number,
  ): Promise<{ attempts: number; lockedUntil: Date | null }> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: { failedLoginCount: { increment: 1 } },
      });

      const alreadyLocked = user.lockedUntil && user.lockedUntil > new Date();
      if (user.failedLoginCount >= maxAttempts && !alreadyLocked) {
        const lockedUntil = new Date(Date.now() + lockMinutes * 60_000);
        await tx.user.update({
          where: { id: userId },
          data: { lockedUntil, failedLoginCount: 0 },
        });
        return { attempts: user.failedLoginCount, lockedUntil };
      }

      return { attempts: user.failedLoginCount, lockedUntil: user.lockedUntil };
    });
  }

  async getSettings(userId: string): Promise<UserSettings | null> {
    return this.prisma.userSettings.findUnique({ where: { userId } });
  }

  async ensureSettings(userId: string): Promise<UserSettings> {
    return this.prisma.userSettings.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
  }

  async updateSettings(userId: string, data: Prisma.UserSettingsUpdateInput): Promise<UserSettings> {
    await this.ensureSettings(userId);
    return this.prisma.userSettings.update({ where: { userId }, data });
  }

  async requestDeletion(userId: string, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? this.prisma;
    await client.user.update({
      where: { id: userId },
      data: { status: 'PENDING_DELETION', deletionRequestedAt: new Date() },
    });
  }

  async cancelDeletion(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { status: 'ACTIVE', deletionRequestedAt: null },
    });
  }
}
