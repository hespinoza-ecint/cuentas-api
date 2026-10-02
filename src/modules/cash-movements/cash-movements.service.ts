import { Injectable } from '@nestjs/common';
import { CashMovement } from '@prisma/client';
import { NotFoundError } from '../../common/errors/http-errors';
import { RequestMeta } from '../../common/http/request-meta';
import { AuditService } from '../audit/audit.service';
import { LedgerService } from '../ledger/ledger.service';
import {
  AdjustmentDto,
  ListMovementsQueryDto,
  ReverseMovementDto,
} from './dto/cash-movement.dto';
import { CashMovementsRepository } from './repositories/cash-movements.repository';

export interface PaginatedMovements {
  data: CashMovement[];
  meta: { limit: number; nextCursor: string | null; hasMore: boolean };
}

@Injectable()
export class CashMovementsService {
  constructor(
    private readonly movements: CashMovementsRepository,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
  ) {}

  async list(userId: string, query: ListMovementsQueryDto): Promise<PaginatedMovements> {
    const limit = query.limit ?? 20;
    const { items, nextCursor } = await this.movements.list(userId, query, limit);

    return {
      data: items,
      meta: { limit, nextCursor, hasMore: nextCursor !== null },
    };
  }

  async get(userId: string, id: string): Promise<CashMovement> {
    const movement = await this.movements.findById(userId, id);
    if (!movement) {
      throw new NotFoundError('El movimiento no existe.', { reason: 'MOVEMENT_NOT_FOUND' });
    }
    return movement;
  }

  /** RN-05: los ajustes manuales exigen motivo y quedan auditados. */
  async createAdjustment(
    userId: string,
    dto: AdjustmentDto,
    meta: RequestMeta,
  ): Promise<CashMovement> {
    const movement = await this.ledger.postMovement({
      userId,
      cashAccountId: dto.cashAccountId,
      type: 'ADJUSTMENT',
      amount: dto.amount,
      occurredOn: dto.occurredOn,
      description: dto.description,
      reason: dto.reason,
      sourceType: 'Adjustment',
      createdById: userId,
    });

    await this.audit.record({
      action: 'cash_movement.adjustment_created',
      entityType: 'CashMovement',
      entityId: movement.id,
      userId,
      actorUserId: userId,
      changes: {
        cashAccountId: dto.cashAccountId,
        amount: dto.amount,
        occurredOn: dto.occurredOn,
        reason: dto.reason,
      },
      ...meta,
    });

    return movement;
  }

  async reverse(
    userId: string,
    id: string,
    dto: ReverseMovementDto,
    meta: RequestMeta,
  ): Promise<CashMovement> {
    const movement = await this.get(userId, id);

    const reversal = await this.ledger.reverseMovement(userId, id, dto.reason, userId);

    await this.audit.record({
      action: 'cash_movement.reversed',
      entityType: 'CashMovement',
      entityId: movement.id,
      userId,
      actorUserId: userId,
      changes: { reversalMovementId: reversal.id, reason: dto.reason, amount: -movement.amount },
      ...meta,
    });

    return reversal;
  }
}
