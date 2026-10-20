import { Prisma } from '@prisma/client';

export type UserDataScope = 'ALL' | 'CARDS';

interface DeleteUserDataOptions {
  /** CARDS borra solo el dominio de tarjetas; ALL borra todo menos el usuario. */
  scope?: UserDataScope;
  /** Acumula cuantos registros se borraron por tabla. */
  deleted?: Record<string, number>;
}

/**
 * Borra los datos de un usuario en orden hijos -> padres.
 *
 * El orden importa: MySQL no resuelve todas las cascadas de `User` en un orden
 * valido porque hay FK `Restrict` cruzadas (por ejemplo CardPayment ->
 * CashMovement). Borrar solo con `user.delete()` falla en MySQL aunque en
 * SQLite funcione; este helper explicita el orden.
 *
 * No borra el usuario: el llamador decide si eliminarlo (purga) o mantenerlo
 * (reset de datos).
 */
export async function deleteUserData(
  tx: Prisma.TransactionClient,
  userId: string,
  options: DeleteUserDataOptions = {},
): Promise<void> {
  const scope = options.scope ?? 'ALL';

  const wipe = async (name: string, run: () => Promise<{ count: number }>) => {
    const result = await run();
    if (options.deleted) {
      options.deleted[name] = result.count;
    }
  };

  // Dominio de tarjetas (orden hijos -> padres por las FK Restrict).
  await wipe('paymentAllocations', () => tx.paymentAllocation.deleteMany({ where: { userId } }));
  await wipe('installments', () => tx.installment.deleteMany({ where: { userId } }));
  await wipe('cardPayments', () => tx.cardPayment.deleteMany({ where: { userId } }));
  await wipe('installmentPlans', () => tx.installmentPlan.deleteMany({ where: { userId } }));
  await wipe('purchases', () => tx.purchase.deleteMany({ where: { userId } }));
  await wipe('cardLedgerEntries', () => tx.cardLedgerEntry.deleteMany({ where: { userId } }));
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
    await wipe('incomeTransactions', () => tx.incomeTransaction.deleteMany({ where: { userId } }));
    await wipe('cashMovements', () => tx.cashMovement.deleteMany({ where: { userId } }));
    await wipe('incomeSchedules', () => tx.incomeSchedule.deleteMany({ where: { userId } }));
    await wipe('incomeSources', () => tx.incomeSource.deleteMany({ where: { userId } }));
    await wipe('cashAccounts', () => tx.cashAccount.deleteMany({ where: { userId } }));
    await wipe('recommendations', () => tx.recommendationHistory.deleteMany({ where: { userId } }));
    await wipe('ruleOverrides', () =>
      tx.userRecommendationRuleOverride.deleteMany({ where: { userId } }),
    );
    await wipe('categories', () => tx.category.deleteMany({ where: { userId, isSystem: false } }));
    await wipe('idempotencyRecords', () =>
      tx.idempotencyRecord.deleteMany({ where: { userId } }),
    );
    await wipe('auditLogs', () =>
      tx.auditLog.deleteMany({ where: { OR: [{ userId }, { actorUserId: userId }] } }),
    );
  }
}
