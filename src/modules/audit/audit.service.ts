import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string;
  /** Usuario dueno del recurso afectado. */
  userId?: string;
  /** Usuario que ejecuto la accion (normalmente el mismo). */
  actorUserId?: string;
  /** Estado antes/despues o datos relevantes; nunca contrasenas ni tokens. */
  changes?: unknown;
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

/**
 * Bitacora de auditoria. En operaciones financieras (fases 3+) se escribe
 * dentro de la misma transaccion que la operacion.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? this.prisma;

    await client.auditLog.create({
      data: {
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        userId: entry.userId,
        actorUserId: entry.actorUserId,
        changes: entry.changes === undefined ? undefined : JSON.stringify(entry.changes),
        ip: entry.ip,
        userAgent: entry.userAgent,
        requestId: entry.requestId,
      },
    });
  }
}
