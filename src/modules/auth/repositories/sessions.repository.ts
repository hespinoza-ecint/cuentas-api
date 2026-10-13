import { Injectable } from '@nestjs/common';
import { Prisma, Session } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

/** Campos del usuario que viajan con la sesion (nunca el hash de contrasena). */
export const sessionUserSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  status: true,
  emailVerifiedAt: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export type SessionWithUser = Prisma.SessionGetPayload<{
  include: { user: { select: typeof sessionUserSelect } };
}>;

@Injectable()
export class SessionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.SessionUncheckedCreateInput): Promise<Session> {
    return this.prisma.session.create({ data });
  }

  findByTokenHash(tokenHash: string): Promise<SessionWithUser | null> {
    return this.prisma.session.findUnique({
      where: { tokenHash },
      include: { user: { select: sessionUserSelect } },
    });
  }

  findActiveByIdForUser(sessionId: string, userId: string): Promise<SessionWithUser | null> {
    return this.prisma.session.findFirst({
      where: {
        id: sessionId,
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { user: { select: sessionUserSelect } },
    });
  }

  findByIdForUser(id: string, userId: string): Promise<Session | null> {
    return this.prisma.session.findFirst({ where: { id, userId } });
  }

  listActiveByUser(userId: string): Promise<Session[]> {
    return this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revoke(id: string, reason: string, replacedBySessionId?: string): Promise<void> {
    await this.prisma.session.update({
      where: { id },
      data: {
        revokedAt: new Date(),
        revokedReason: reason,
        replacedBySessionId,
        lastUsedAt: new Date(),
      },
    });
  }

  /** Revoca toda la familia (se usa al detectar reutilizacion de un token). */
  async revokeFamily(familyId: string, reason: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  async revokeAllForUser(
    userId: string,
    reason: string,
    exceptSessionId?: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    const result = await client.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    return result.count;
  }

  /**
   * Rotacion atomica: revoca la sesion anterior solo si seguia vigente y crea
   * la nueva. Si otra peticion gano la carrera devuelve null (no se crea nada).
   */
  rotate(oldSessionId: string, data: Prisma.SessionUncheckedCreateInput): Promise<Session | null> {
    return this.prisma.$transaction(async (tx) => {
      const revoked = await tx.session.updateMany({
        where: { id: oldSessionId, revokedAt: null },
        data: {
          revokedAt: new Date(),
          revokedReason: 'ROTATED',
          lastUsedAt: new Date(),
        },
      });
      if (revoked.count === 0) {
        return null;
      }

      const created = await tx.session.create({ data });
      await tx.session.update({
        where: { id: oldSessionId },
        data: { replacedBySessionId: created.id },
      });
      return created;
    });
  }
}
