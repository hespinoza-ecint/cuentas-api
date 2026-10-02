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

export class CreateExpenseDto {
  @IsUUID('4', { message: 'cashAccountId debe ser un UUID' })
  cashAccountId!: string;

  @IsOptional()
  @IsUUID('4', { message: 'categoryId debe ser un UUID' })
  categoryId?: string;

  @IsString({ message: 'description debe ser texto' })
  @IsNotEmpty({ message: 'description es obligatoria' })
  @MaxLength(200, { message: 'description no debe exceder 200 caracteres' })
  description!: string;

  @IsInt({ message: 'amount debe ser un entero en centavos' })
  @Min(1, { message: 'amount debe ser mayor que cero' })
  @Max(2_147_483_647, { message: 'amount excede el maximo permitido' })
  amount!: number;

  @IsLocalDate({ message: 'expenseDate debe ser una fecha valida YYYY-MM-DD' })
  expenseDate!: string;

  @IsOptional()
  @IsString({ message: 'notes debe ser texto' })
  @MaxLength(300, { message: 'notes no debe exceder 300 caracteres' })
  notes?: string;
}

export class ReverseExpenseDto {
  @IsString({ message: 'reason debe ser texto' })
  @IsNotEmpty({ message: 'reason es obligatorio' })
  @MaxLength(300, { message: 'reason no debe exceder 300 caracteres' })
  reason!: string;
}

export class ListExpensesQueryDto {
  @IsOptional()
  @IsUUID('4', { message: 'cashAccountId debe ser un UUID' })
  cashAccountId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'categoryId debe ser un UUID' })
  categoryId?: string;

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
