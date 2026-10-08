import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { IsLocalDate } from '../../../common/validation/is-local-date.decorator';
import { trim } from '../../../common/validation/transforms';

const MAX_MONEY = 2_147_483_647;

export class CreatePurchaseDto {
  @IsUUID('4', { message: 'creditCardId debe ser un UUID' })
  creditCardId!: string;

  @IsOptional()
  @IsUUID('4', { message: 'categoryId debe ser un UUID' })
  categoryId?: string;

  @Transform(trim)
  @IsString({ message: 'description debe ser texto' })
  @IsNotEmpty({ message: 'description es obligatoria' })
  @MaxLength(200, { message: 'description no debe exceder 200 caracteres' })
  description!: string;

  @IsInt({ message: 'amount debe ser un entero en centavos' })
  @Min(1, { message: 'amount debe ser mayor que cero' })
  @Max(MAX_MONEY, { message: 'amount excede el maximo permitido' })
  amount!: number;

  @IsLocalDate({ message: 'purchaseDate debe ser una fecha valida YYYY-MM-DD' })
  purchaseDate!: string;

  @IsIn(['REGULAR', 'MSI', 'DEFERRED_INTEREST'], {
    message: 'type debe ser REGULAR, MSI o DEFERRED_INTEREST',
  })
  type!: string;

  @IsOptional()
  @IsInt({ message: 'months debe ser un entero' })
  @Min(2, { message: 'months debe estar entre 2 y 48' })
  @Max(48, { message: 'months debe estar entre 2 y 48' })
  months?: number;

  @IsOptional()
  @IsInt({ message: 'annualRateBps debe ser un entero en puntos base' })
  @Min(0, { message: 'annualRateBps no puede ser negativo' })
  @Max(10_000, { message: 'annualRateBps no puede exceder 10000 (100%)' })
  annualRateBps?: number;

  @IsOptional()
  @IsInt({ message: 'commissionAmount debe ser un entero en centavos' })
  @Min(0, { message: 'commissionAmount no puede ser negativo' })
  @Max(MAX_MONEY, { message: 'commissionAmount excede el maximo permitido' })
  commissionAmount?: number;

  @IsOptional()
  @IsIn(['NONE', 'UPFRONT', 'PRORATED'], { message: 'commissionMode no es valido' })
  commissionMode?: string;

  /**
   * Mes del primer corte ("YYYY-MM") para compras a MSI/diferidas ya iniciadas:
   * las mensualidades ya vencidas quedan pagadas y la tarjeta solo suma el
   * principal pendiente.
   */
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'firstStatementMonth debe ser un mes YYYY-MM',
  })
  firstStatementMonth?: string;

  @IsOptional()
  @IsString({ message: 'notes debe ser texto' })
  @MaxLength(300, { message: 'notes no debe exceder 300 caracteres' })
  notes?: string;

  /** Liga la compra con la recomendacion que la origino (Fase 6). */
  @IsOptional()
  @IsUUID('4', { message: 'recommendationId debe ser un UUID' })
  recommendationId?: string;
}

export class ListPurchasesQueryDto {
  @IsOptional()
  @IsUUID('4', { message: 'creditCardId debe ser un UUID' })
  creditCardId?: string;

  @IsOptional()
  @IsIn(['REGULAR', 'MSI', 'DEFERRED_INTEREST'], { message: 'type no es valido' })
  type?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'PAID', 'CANCELLED', 'REFUNDED'], { message: 'status no es valido' })
  status?: string;

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
  @IsUUID('4', { message: 'cursor debe ser un UUID' })
  cursor?: string;
}

export class CancelPurchaseDto {
  @IsString({ message: 'reason debe ser texto' })
  @IsNotEmpty({ message: 'reason es obligatorio' })
  @MaxLength(300, { message: 'reason no debe exceder 300 caracteres' })
  reason!: string;
}

/** Eliminacion definitiva de una compra (regular, MSI o diferida). */
export class DeletePurchaseDto {
  @IsString({ message: 'reason debe ser texto' })
  @IsNotEmpty({ message: 'reason es obligatorio' })
  @MaxLength(300, { message: 'reason no debe exceder 300 caracteres' })
  reason!: string;
}

export class PrepayPlanDto {
  @IsUUID('4', { message: 'cashAccountId debe ser un UUID' })
  cashAccountId!: string;

  @IsInt({ message: 'amount debe ser un entero en centavos' })
  @Min(1, { message: 'amount debe ser mayor que cero' })
  @Max(MAX_MONEY, { message: 'amount excede el maximo permitido' })
  amount!: number;

  @IsLocalDate({ message: 'paymentDate debe ser una fecha valida YYYY-MM-DD' })
  paymentDate!: string;

  @IsOptional()
  @IsIn(['REDUCE_TERM', 'REDUCE_PAYMENT'], { message: 'mode no es valido' })
  mode?: string;

  @IsOptional()
  @IsString({ message: 'notes debe ser texto' })
  @MaxLength(300, { message: 'notes no debe exceder 300 caracteres' })
  notes?: string;
}
