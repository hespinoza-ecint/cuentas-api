import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { IsLocalDate } from '../../../common/validation/is-local-date.decorator';
import { trim } from '../../../common/validation/transforms';

const MAX_MONEY = 2_147_483_647;

export class CreateCardDto {
  @Transform(trim)
  @IsString({ message: 'alias debe ser texto' })
  @IsNotEmpty({ message: 'alias es obligatorio' })
  @MaxLength(60, { message: 'alias no debe exceder 60 caracteres' })
  alias!: string;

  @Transform(trim)
  @IsString({ message: 'institution debe ser texto' })
  @IsNotEmpty({ message: 'institution es obligatoria' })
  @MaxLength(80, { message: 'institution no debe exceder 80 caracteres' })
  institution!: string;

  @Matches(/^\d{4}$/, { message: 'last4 deben ser exactamente 4 digitos' })
  last4!: string;

  @IsInt({ message: 'creditLimit debe ser un entero en centavos' })
  @Min(1, { message: 'creditLimit debe ser mayor que cero' })
  @Max(MAX_MONEY, { message: 'creditLimit excede el maximo permitido' })
  creditLimit!: number;

  @IsOptional()
  @IsInt({ message: 'annualRateBps debe ser un entero en puntos base' })
  @Min(0, { message: 'annualRateBps no puede ser negativo' })
  @Max(10_000, { message: 'annualRateBps no puede exceder 10000 (100%)' })
  annualRateBps?: number;

  @IsOptional()
  @IsInt({ message: 'annualFee debe ser un entero en centavos' })
  @Min(0, { message: 'annualFee no puede ser negativo' })
  @Max(MAX_MONEY, { message: 'annualFee excede el maximo permitido' })
  annualFee?: number;

  @IsOptional()
  @IsInt({ message: 'annualFeeMonth debe ser un entero' })
  @Min(1, { message: 'annualFeeMonth debe estar entre 1 y 12' })
  @Max(12, { message: 'annualFeeMonth debe estar entre 1 y 12' })
  annualFeeMonth?: number;

  @IsInt({ message: 'cutDay debe ser un entero' })
  @Min(1, { message: 'cutDay debe estar entre 1 y 31' })
  @Max(31, { message: 'cutDay debe estar entre 1 y 31' })
  cutDay!: number;

  @IsOptional()
  @IsIn(['FIXED_DAY', 'DAYS_AFTER_CUT'], { message: 'dueDateMode no es valido' })
  dueDateMode?: string;

  @IsOptional()
  @IsInt({ message: 'dueDay debe ser un entero' })
  @Min(1, { message: 'dueDay debe estar entre 1 y 31' })
  @Max(31, { message: 'dueDay debe estar entre 1 y 31' })
  dueDay?: number;

  @IsOptional()
  @IsInt({ message: 'dueDaysAfterCut debe ser un entero' })
  @Min(1, { message: 'dueDaysAfterCut debe ser al menos 1' })
  @Max(60, { message: 'dueDaysAfterCut no debe exceder 60' })
  dueDaysAfterCut?: number;

  @IsOptional()
  @IsIn(['PREVIOUS', 'NEXT', 'NONE'], { message: 'dueNonBusinessDayRule no es valida' })
  dueNonBusinessDayRule?: string;

  @IsOptional()
  @IsBoolean({ message: 'sameDayCutIncluded debe ser booleano' })
  sameDayCutIncluded?: boolean;

  @IsOptional()
  @IsInt({ message: 'openingBalance debe ser un entero en centavos' })
  @Min(1, { message: 'openingBalance debe ser mayor que cero' })
  @Max(MAX_MONEY, { message: 'openingBalance excede el maximo permitido' })
  openingBalance?: number;

  @IsOptional()
  @IsLocalDate({ message: 'openingDate debe ser una fecha valida YYYY-MM-DD' })
  openingDate?: string;
}

export class UpdateCardDto {
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'alias debe ser texto' })
  @IsNotEmpty({ message: 'alias no puede estar vacio' })
  @MaxLength(60, { message: 'alias no debe exceder 60 caracteres' })
  alias?: string;

  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'institution debe ser texto' })
  @IsNotEmpty({ message: 'institution no puede estar vacia' })
  @MaxLength(80, { message: 'institution no debe exceder 80 caracteres' })
  institution?: string;

  @IsOptional()
  @IsInt({ message: 'creditLimit debe ser un entero en centavos' })
  @Min(1, { message: 'creditLimit debe ser mayor que cero' })
  @Max(MAX_MONEY, { message: 'creditLimit excede el maximo permitido' })
  creditLimit?: number;

  @IsOptional()
  @IsInt({ message: 'annualRateBps debe ser un entero en puntos base' })
  @Min(0, { message: 'annualRateBps no puede ser negativo' })
  @Max(10_000, { message: 'annualRateBps no puede exceder 10000 (100%)' })
  annualRateBps?: number;

  @IsOptional()
  @IsInt({ message: 'annualFee debe ser un entero en centavos' })
  @Min(0, { message: 'annualFee no puede ser negativo' })
  @Max(MAX_MONEY, { message: 'annualFee excede el maximo permitido' })
  annualFee?: number;

  @IsOptional()
  @IsInt({ message: 'annualFeeMonth debe ser un entero' })
  @Min(1, { message: 'annualFeeMonth debe estar entre 1 y 12' })
  @Max(12, { message: 'annualFeeMonth debe estar entre 1 y 12' })
  annualFeeMonth?: number;

  @IsOptional()
  @IsInt({ message: 'cutDay debe ser un entero' })
  @Min(1, { message: 'cutDay debe estar entre 1 y 31' })
  @Max(31, { message: 'cutDay debe estar entre 1 y 31' })
  cutDay?: number;

  @IsOptional()
  @IsIn(['FIXED_DAY', 'DAYS_AFTER_CUT'], { message: 'dueDateMode no es valido' })
  dueDateMode?: string;

  @IsOptional()
  @IsInt({ message: 'dueDay debe ser un entero' })
  @Min(1, { message: 'dueDay debe estar entre 1 y 31' })
  @Max(31, { message: 'dueDay debe estar entre 1 y 31' })
  dueDay?: number;

  @IsOptional()
  @IsInt({ message: 'dueDaysAfterCut debe ser un entero' })
  @Min(1, { message: 'dueDaysAfterCut debe ser al menos 1' })
  @Max(60, { message: 'dueDaysAfterCut no debe exceder 60' })
  dueDaysAfterCut?: number;

  @IsOptional()
  @IsIn(['PREVIOUS', 'NEXT', 'NONE'], { message: 'dueNonBusinessDayRule no es valida' })
  dueNonBusinessDayRule?: string;

  @IsOptional()
  @IsBoolean({ message: 'sameDayCutIncluded debe ser booleano' })
  sameDayCutIncluded?: boolean;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'], { message: 'status debe ser ACTIVE o INACTIVE' })
  status?: string;
}

export class ReconcileCardDto {
  @IsInt({ message: 'reportedBalance debe ser un entero en centavos' })
  @Min(0, { message: 'reportedBalance no puede ser negativo' })
  @Max(MAX_MONEY, { message: 'reportedBalance excede el maximo permitido' })
  reportedBalance!: number;

  @IsLocalDate({ message: 'asOfDate debe ser una fecha valida YYYY-MM-DD' })
  asOfDate!: string;

  @IsString({ message: 'reason debe ser texto' })
  @IsNotEmpty({ message: 'reason es obligatorio' })
  @MaxLength(300, { message: 'reason no debe exceder 300 caracteres' })
  reason!: string;
}

export class UpdateStatementDto {
  @IsOptional()
  @IsInt({ message: 'noInterestPaymentReported debe ser un entero en centavos' })
  @Min(0, { message: 'noInterestPaymentReported no puede ser negativo' })
  @Max(MAX_MONEY, { message: 'noInterestPaymentReported excede el maximo permitido' })
  noInterestPaymentReported?: number;

  @IsOptional()
  @IsInt({ message: 'minimumPaymentReported debe ser un entero en centavos' })
  @Min(0, { message: 'minimumPaymentReported no puede ser negativo' })
  @Max(MAX_MONEY, { message: 'minimumPaymentReported excede el maximo permitido' })
  minimumPaymentReported?: number;
}

export class ListCardLedgerQueryDto {
  @IsOptional()
  @IsIn(
    [
      'OPENING_BALANCE',
      'PURCHASE',
      'INSTALLMENT_PRINCIPAL',
      'INTEREST',
      'FEE',
      'ANNUAL_FEE',
      'PAYMENT',
      'REFUND',
      'ADJUSTMENT',
      'REVERSAL',
    ],
    { message: 'type no es un tipo de movimiento de tarjeta valido' },
  )
  type?: string;

  @IsOptional()
  @IsLocalDate({ message: 'from debe ser una fecha valida YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @IsLocalDate({ message: 'to debe ser una fecha valida YYYY-MM-DD' })
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit debe ser un entero' })
  @Min(1, { message: 'limit debe ser al menos 1' })
  @Max(100, { message: 'limit no debe exceder 100' })
  limit?: number;

  @IsOptional()
  @IsString({ message: 'cursor debe ser texto' })
  cursor?: string;
}

/** Motivo obligatorio para reiniciar o eliminar una tarjeta con su historial. */
export class CardPurgeDto {
  @Transform(trim)
  @IsString({ message: 'reason debe ser texto' })
  @IsNotEmpty({ message: 'reason es obligatorio' })
  @MaxLength(300, { message: 'reason no debe exceder 300 caracteres' })
  reason!: string;
}
