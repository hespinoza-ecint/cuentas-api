import { Injectable } from '@nestjs/common';
import { Prisma, VerificationToken } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

export type VerificationTokenWithUser = Prisma.VerificationTokenGetPayload<{
  include: { user: true };
}>;

@Injectable()
export class VerificationTokensRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    data: Prisma.VerificationTokenUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<VerificationToken> {
    const client = tx ?? this.prisma;
    return client.verificationToken.create({ data });
  }

  findByHash(tokenHash: string, type: string): Promise<VerificationTokenWithUser | null> {
    return this.prisma.verificationToken.findFirst({
      where: {
        tokenHash,
        type,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });
  }

  async markUsed(id: string, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? this.prisma;
    await client.verificationToken.update({ where: { id }, data: { usedAt: new Date() } });
  }

  /** Invalida los tokens pendientes del mismo tipo antes de emitir otro. */
  async invalidatePending(userId: string, type: string): Promise<void> {
    await this.prisma.verificationToken.updateMany({
      where: { userId, type, usedAt: null },
      data: { usedAt: new Date() },
    });
  }
}
