import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { IsLocalDate } from '../../../common/validation/is-local-date.decorator';

const MAX_MONEY = 2_147_483_647;

export class CreateCardPaymentDto {
  @IsUUID('4', { message: 'creditCardId debe ser un UUID' })
  creditCardId!: string;

  @IsUUID('4', { message: 'cashAccountId debe ser un UUID' })
  cashAccountId!: string;

  @IsInt({ message: 'amount debe ser un entero en centavos' })
  @Min(1, { message: 'amount debe ser mayor que cero' })
  @Max(MAX_MONEY, { message: 'amount excede el maximo permitido' })
  amount!: number;

  @IsLocalDate({ message: 'paymentDate debe ser una fecha valida YYYY-MM-DD' })
  paymentDate!: string;

  @IsOptional()
  @IsString({ message: 'notes debe ser texto' })
  @MaxLength(300, { message: 'notes no debe exceder 300 caracteres' })
  notes?: string;
}

export class ReverseCardPaymentDto {
  @IsString({ message: 'reason debe ser texto' })
  @IsNotEmpty({ message: 'reason es obligatorio' })
  @MaxLength(300, { message: 'reason no debe exceder 300 caracteres' })
  reason!: string;
}

export class ListCardPaymentsQueryDto {
  @IsOptional()
  @IsUUID('4', { message: 'creditCardId debe ser un UUID' })
  creditCardId?: string;

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
