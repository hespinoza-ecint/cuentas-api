import { Injectable } from '@nestjs/common';
import { InstallmentPlan, Prisma } from '@prisma/client';
import { NotFoundError } from '../../common/errors/http-errors';
import { outstandingPrincipalOf } from '../../domain/installments/amortization';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

/**
 * Estado de los planes de mensualidades. Es global porque lo usan tanto los
 * pagos (que abonan mensualidades de un corte) como los anticipos del plan.
 */
@Injectable()
export class InstallmentsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Recalcula el principal pendiente y el estado del plan y de la compra. */
  async refreshPlanState(
    planId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<InstallmentPlan> {
    const client = tx ?? this.prisma;

    const plan = await client.installmentPlan.findUnique({
      where: { id: planId },
      include: { installments: true },
    });

    if (!plan) {
      throw new NotFoundError('El plan de mensualidades no existe.', { reason: 'PLAN_NOT_FOUND' });
    }

    const outstandingPrincipal = outstandingPrincipalOf(plan.installments);
    const allPaid = plan.installments.every(
      (installment) => installment.status === 'PAID' || installment.status === 'CANCELLED',
    );

    const status =
      plan.status === 'CANCELLED' ? 'CANCELLED' : allPaid ? 'PAID_OFF' : 'ACTIVE';

    const updated = await client.installmentPlan.update({
      where: { id: planId },
      data: { outstandingPrincipal, status, version: { increment: 1 } },
    });

    if (plan.status !== 'CANCELLED') {
      await client.purchase.update({
        where: { id: plan.purchaseId },
        data: { status: allPaid ? 'PAID' : 'ACTIVE' },
      });
    }

    return updated;
  }
}
