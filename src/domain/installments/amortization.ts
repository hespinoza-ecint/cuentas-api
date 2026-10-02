/**
 * Amortizacion de mensualidades en centavos (enteros). Garantiza que la suma
 * de las parcialidades sea exactamente el principal y que los residuos de
 * redondeo queden en la ultima mensualidad (RN-19 y RN-20).
 */

export interface ScheduleRow {
  number: number;
  principal: number;
  interest: number;
  iva: number;
  fee: number;
  totalAmount: number;
}

export interface ScheduleResult {
  rows: ScheduleRow[];
  totalInterest: number;
  totalIva: number;
  totalFee: number;
  estimatedMonthlyPayment: number;
}

function assertInputs(principal: number, months: number): void {
  if (!Number.isInteger(principal) || principal <= 0) {
    throw new Error('El principal debe ser un entero mayor que cero.');
  }
  if (!Number.isInteger(months) || months < 2 || months > 48) {
    throw new Error('El numero de mensualidades debe estar entre 2 y 48.');
  }
}

/** Meses sin intereses: cuotas iguales con el residuo en la ultima. */
export function buildMsiSchedule(principal: number, months: number): ScheduleResult {
  assertInputs(principal, months);

  const base = Math.floor(principal / months);
  const residue = principal - base * months;

  const rows: ScheduleRow[] = Array.from({ length: months }, (_, index) => {
    const isLast = index === months - 1;
    const rowPrincipal = isLast ? base + residue : base;

    return {
      number: index + 1,
      principal: rowPrincipal,
      interest: 0,
      iva: 0,
      fee: 0,
      totalAmount: rowPrincipal,
    };
  });

  return {
    rows,
    totalInterest: 0,
    totalIva: 0,
    totalFee: 0,
    estimatedMonthlyPayment: rows[0].totalAmount,
  };
}

export interface FrenchScheduleParams {
  principal: number;
  months: number;
  annualRateBps: number;
  ivaRateBps: number;
  commissionAmount?: number;
  commissionMode?: 'NONE' | 'UPFRONT' | 'PRORATED';
}

/**
 * Amortizacion francesa (cuota fija sobre saldo insoluto) con IVA sobre los
 * intereses. La ultima cuota absorbe los residuos de redondeo.
 */
export function buildFrenchSchedule(params: FrenchScheduleParams): ScheduleResult {
  const { principal, months, annualRateBps, ivaRateBps } = params;
  assertInputs(principal, months);

  if (annualRateBps < 0 || annualRateBps > 10_000) {
    throw new Error('La tasa anual debe estar entre 0 y 10000 puntos base.');
  }

  const commission = params.commissionAmount ?? 0;
  const commissionMode = params.commissionMode ?? 'NONE';
  const monthlyRate = annualRateBps / 10_000 / 12;
  const ivaRate = ivaRateBps / 10_000;

  const rawPayment =
    monthlyRate === 0
      ? principal / months
      : (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months));

  const rows: ScheduleRow[] = [];
  let outstanding = principal;
  let totalInterest = 0;
  let totalIva = 0;
  let accumulatedPrincipal = 0;

  for (let index = 1; index <= months; index += 1) {
    const isLast = index === months;
    const interest = Math.round(outstanding * monthlyRate);
    const iva = Math.round(interest * ivaRate);

    let principalPart: number;
    if (isLast) {
      principalPart = outstanding;
    } else {
      principalPart = Math.max(Math.round(rawPayment) - interest - iva, 0);
    }

    const totalAmount = principalPart + interest + iva;

    outstanding -= principalPart;
    accumulatedPrincipal += principalPart;
    totalInterest += interest;
    totalIva += iva;

    rows.push({
      number: index,
      principal: principalPart,
      interest,
      iva,
      fee: 0,
      totalAmount,
    });
  }

  // Cualquier residuo por redondeo se cierra en la ultima mensualidad.
  const difference = principal - accumulatedPrincipal;
  if (difference !== 0) {
    const last = rows[rows.length - 1];
    last.principal += difference;
    last.totalAmount += difference;
  }

  if (commission > 0 && commissionMode === 'UPFRONT') {
    rows[0].fee += commission;
    rows[0].totalAmount += commission;
  } else if (commission > 0 && commissionMode === 'PRORATED') {
    const base = Math.floor(commission / months);
    const residue = commission - base * months;
    rows.forEach((row, index) => {
      const fee = index === months - 1 ? base + residue : base;
      row.fee += fee;
      row.totalAmount += fee;
    });
  }

  return {
    rows,
    totalInterest,
    totalIva,
    totalFee: commission,
    estimatedMonthlyPayment: rows[0].totalAmount,
  };
}

/** Principal pendiente de un plan a partir de sus mensualidades. */
export function outstandingPrincipalOf(
  installments: Array<{ principal: number; paidAmount: number; status: string }>,
): number {
  return installments
    .filter((installment) => installment.status !== 'CANCELLED')
    .reduce((total, installment) => {
      const paidPrincipal = Math.min(installment.paidAmount, installment.principal);
      return total + Math.max(installment.principal - paidPrincipal, 0);
    }, 0);
}
