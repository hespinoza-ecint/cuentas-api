import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
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
import { trim } from '../../../common/validation/transforms';

export class CreateCashAccountDto {
  @Transform(trim)
  @IsString({ message: 'name debe ser texto' })
  @IsNotEmpty({ message: 'name es obligatorio' })
  @MaxLength(80, { message: 'name no debe exceder 80 caracteres' })
  name!: string;

  @IsOptional()
  @IsIn(['CASH', 'DEBIT', 'SAVINGS', 'OTHER'], {
    message: 'type debe ser CASH, DEBIT, SAVINGS u OTHER',
  })
  type?: string;

  @IsOptional()
  @IsBoolean({ message: 'isSpendable debe ser booleano' })
  isSpendable?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'isDefault debe ser booleano' })
  isDefault?: boolean;

  @IsOptional()
  @IsInt({ message: 'openingBalance debe ser un entero en centavos' })
  @Min(1, { message: 'openingBalance debe ser mayor que cero' })
  @Max(2_147_483_647, { message: 'openingBalance excede el maximo permitido' })
  openingBalance?: number;

  @IsOptional()
  @IsLocalDate({ message: 'openingDate debe ser una fecha valida YYYY-MM-DD' })
  openingDate?: string;
}

export class UpdateCashAccountDto {
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'name debe ser texto' })
  @IsNotEmpty({ message: 'name no puede estar vacio' })
  @MaxLength(80, { message: 'name no debe exceder 80 caracteres' })
  name?: string;

  @IsOptional()
  @IsBoolean({ message: 'isSpendable debe ser booleano' })
  isSpendable?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'isDefault debe ser booleano' })
  isDefault?: boolean;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'], { message: 'status debe ser ACTIVE o INACTIVE' })
  status?: string;
}

export class OpeningBalanceDto {
  @IsInt({ message: 'amount debe ser un entero en centavos' })
  @Min(1, { message: 'amount debe ser mayor que cero' })
  @Max(2_147_483_647, { message: 'amount excede el maximo permitido' })
  amount!: number;

  @IsOptional()
  @IsLocalDate({ message: 'occurredOn debe ser una fecha valida YYYY-MM-DD' })
  occurredOn?: string;
}

export class TransferDto {
  @IsUUID('4', { message: 'fromAccountId debe ser un UUID' })
  fromAccountId!: string;

  @IsUUID('4', { message: 'toAccountId debe ser un UUID' })
  toAccountId!: string;

  @IsInt({ message: 'amount debe ser un entero en centavos' })
  @Min(1, { message: 'amount debe ser mayor que cero' })
  @Max(2_147_483_647, { message: 'amount excede el maximo permitido' })
  amount!: number;

  @IsLocalDate({ message: 'occurredOn debe ser una fecha valida YYYY-MM-DD' })
  occurredOn!: string;

  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'description debe ser texto' })
  @MaxLength(200, { message: 'description no debe exceder 200 caracteres' })
  description?: string;
}
