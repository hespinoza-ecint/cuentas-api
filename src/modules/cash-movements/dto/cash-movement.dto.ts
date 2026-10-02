import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  NotEquals,
} from 'class-validator';
import { IsLocalDate } from '../../../common/validation/is-local-date.decorator';

const MOVEMENT_TYPES = [
  'OPENING_BALANCE',
  'INCOME',
  'EXPENSE',
  'CARD_PAYMENT',
  'ADJUSTMENT',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'REVERSAL',
];

export class AdjustmentDto {
  @IsUUID('4', { message: 'cashAccountId debe ser un UUID' })
  cashAccountId!: string;

  /** Monto con signo: positivo aumenta el saldo, negativo lo reduce. */
  @IsInt({ message: 'amount debe ser un entero en centavos' })
  @NotEquals(0, { message: 'amount debe ser distinto de cero' })
  @Max(2_147_483_647, { message: 'amount excede el maximo permitido' })
  amount!: number;

  @IsLocalDate({ message: 'occurredOn debe ser una fecha valida YYYY-MM-DD' })
  occurredOn!: string;

  @IsString({ message: 'description debe ser texto' })
  @IsNotEmpty({ message: 'description es obligatoria' })
  @MaxLength(200, { message: 'description no debe exceder 200 caracteres' })
  description!: string;

  /** RN-05: todo ajuste manual exige motivo. */
  @IsString({ message: 'reason debe ser texto' })
  @IsNotEmpty({ message: 'reason es obligatorio en los ajustes' })
  @MaxLength(300, { message: 'reason no debe exceder 300 caracteres' })
  reason!: string;
}

export class ReverseMovementDto {
  @IsString({ message: 'reason debe ser texto' })
  @IsNotEmpty({ message: 'reason es obligatorio' })
  @MaxLength(300, { message: 'reason no debe exceder 300 caracteres' })
  reason!: string;
}

export class ListMovementsQueryDto {
  @IsOptional()
  @IsUUID('4', { message: 'cashAccountId debe ser un UUID' })
  cashAccountId?: string;

  @IsOptional()
  @IsIn(MOVEMENT_TYPES, { message: 'type no es un tipo de movimiento valido' })
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
  @Max(100, { message: 'limit no debe exceder 100' })
  limit?: number;

  @IsOptional()
  @IsUUID('4', { message: 'cursor debe ser un UUID' })
  cursor?: string;
}
