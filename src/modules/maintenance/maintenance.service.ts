import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { deleteUserData } from '../users/user-data-purge';

export interface MaintenanceReport {
  ranAt: string;
  sessionsDeleted: number;
  tokensDeleted: number;
  idempotencyDeleted: number;
  usersPurged: number;
}

const RETENTION_DAYS = 30;
const USER_PURGE_DAYS = 30;

/**
 * Tareas de mantenimiento:
 * - Purga definitiva de cuentas con eliminacion solicitada hace mas de 30 dias.
 * - Limpieza de sesiones y tokens expirados/revocados con mas de 30 dias.
 * - Limpieza de registros de idempotencia vencidos.
 */
@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'maintenance' })
  async scheduledRun(): Promise<void> {
    const report = await this.run();
    this.logger.log(`Mantenimiento ejecutado: ${JSON.stringify(report)}`);
  }

  async run(): Promise<MaintenanceReport> {
    const now = new Date();
    const retentionCutoff = new Date(now.getTime() - RETENTION_DAYS * 86_400_000);
    const deletionCutoff = new Date(now.getTime() - USER_PURGE_DAYS * 86_400_000);

    const sessions = await this.prisma.session.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: retentionCutoff } },
          { revokedAt: { lt: retentionCutoff } },
        ],
      },
    });

    const tokens = await this.prisma.verificationToken.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: retentionCutoff } }, { usedAt: { lt: retentionCutoff } }],
      },
    });

    const idempotency = await this.prisma.idempotencyRecord.deleteMany({
      where: { expiresAt: { lt: now } },
    });

    const pendingUsers = await this.prisma.user.findMany({
      where: {
        status: 'PENDING_DELETION',
        deletionRequestedAt: { lte: deletionCutoff },
      },
      select: { id: true, email: true },
    });

    let usersPurged = 0;
    for (const user of pendingUsers) {
      try {
        await this.prisma.$transaction(async (tx) => {
          // MySQL no resuelve la cascada de User con las FK Restrict cruzadas
          // (CardPayment -> CashMovement): hay que borrar en orden explicito.
          await deleteUserData(tx, user.id);

          await tx.auditLog.create({
            data: {
              action: 'user.purged',
              entityType: 'User',
              entityId: user.id,
              userId: user.id,
              changes: JSON.stringify({ email: user.email, reason: 'PURGE_AFTER_GRACE_PERIOD' }),
            },
          });
          await tx.user.delete({ where: { id: user.id } });
        });
        usersPurged += 1;
      } catch (error) {
        // Una cuenta problematica no debe frenar la purga de las demas.
        this.logger.error(
          `No se pudo purgar la cuenta ${user.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return {
      ranAt: now.toISOString(),
      sessionsDeleted: sessions.count,
      tokensDeleted: tokens.count,
      idempotencyDeleted: idempotency.count,
      usersPurged,
    };
  }
}
