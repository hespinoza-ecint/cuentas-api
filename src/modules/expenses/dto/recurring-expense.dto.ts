import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { FREQUENCIES, NON_BUSINESS_RULES } from '../../../domain/schedules/schedule-config';
import { IsLocalDate } from '../../../common/validation/is-local-date.decorator';
import { trim } from '../../../common/validation/transforms';

export class RecurringScheduleDto {
  @IsIn([...FREQUENCIES], { message: 'frequency no es valida' })
  frequency!: string;

  @IsOptional()
  @IsObject({ message: 'config debe ser un objeto' })
  config?: Record<string, unknown>;

  @IsOptional()
  @IsIn([...NON_BUSINESS_RULES], { message: 'nonBusinessDayRule no es valida' })
  nonBusinessDayRule?: string;

  @IsOptional()
  @IsBoolean({ message: 'useHolidays debe ser booleano' })
  useHolidays?: boolean;

  @IsLocalDate({ message: 'startDate debe ser una fecha valida YYYY-MM-DD' })
  startDate!: string;

  @IsOptional()
  @IsLocalDate({ message: 'endDate debe ser una fecha valida YYYY-MM-DD' })
  endDate?: string;
}

export class CreateRecurringExpenseDto {
  @Transform(trim)
  @IsString({ message: 'name debe ser texto' })
  @IsNotEmpty({ message: 'name es obligatorio' })
  @MaxLength(120, { message: 'name no debe exceder 120 caracteres' })
  name!: string;

  @IsInt({ message: 'amount debe ser un entero en centavos' })
  @Min(1, { message: 'amount debe ser mayor que cero' })
  @Max(2_147_483_647, { message: 'amount excede el maximo permitido' })
  amount!: number;

  @IsOptional()
  @IsIn(['FIXED', 'VARIABLE'], { message: 'amountType debe ser FIXED o VARIABLE' })
  amountType?: string;

  @IsOptional()
  @IsUUID('4', { message: 'categoryId debe ser un UUID' })
  categoryId?: string;

  @IsOptional()
  @IsIn(['CASH_ACCOUNT', 'CREDIT_CARD'], {
    message: 'paymentMethod debe ser CASH_ACCOUNT o CREDIT_CARD',
  })
  paymentMethod?: string;

  @IsOptional()
  @IsUUID('4', { message: 'cashAccountId debe ser un UUID' })
  cashAccountId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'creditCardId debe ser un UUID' })
  creditCardId?: string;

  @ValidateNested()
  @Type(() => RecurringScheduleDto)
  schedule!: RecurringScheduleDto;
}

export class UpdateRecurringExpenseDto {
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'name debe ser texto' })
  @IsNotEmpty({ message: 'name no puede estar vacio' })
  @MaxLength(120, { message: 'name no debe exceder 120 caracteres' })
  name?: string;

  @IsOptional()
  @IsInt({ message: 'amount debe ser un entero en centavos' })
  @Min(1, { message: 'amount debe ser mayor que cero' })
  @Max(2_147_483_647, { message: 'amount excede el maximo permitido' })
  amount?: number;

  @IsOptional()
  @IsIn(['FIXED', 'VARIABLE'], { message: 'amountType debe ser FIXED o VARIABLE' })
  amountType?: string;

  @IsOptional()
  @IsUUID('4', { message: 'categoryId debe ser un UUID' })
  categoryId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'cashAccountId debe ser un UUID' })
  cashAccountId?: string;

  @IsOptional()
  @IsIn(['CASH_ACCOUNT', 'CREDIT_CARD'], {
    message: 'paymentMethod debe ser CASH_ACCOUNT o CREDIT_CARD',
  })
  paymentMethod?: string;

  @IsOptional()
  @IsUUID('4', { message: 'creditCardId debe ser un UUID' })
  creditCardId?: string;

  @IsOptional()
  @IsObject({ message: 'config debe ser un objeto' })
  config?: Record<string, unknown>;

  @IsOptional()
  @IsIn([...NON_BUSINESS_RULES], { message: 'nonBusinessDayRule no es valida' })
  nonBusinessDayRule?: string;

  @IsOptional()
  @IsBoolean({ message: 'useHolidays debe ser booleano' })
  useHolidays?: boolean;

  @IsOptional()
  @IsLocalDate({ message: 'startDate debe ser una fecha valida YYYY-MM-DD' })
  startDate?: string;

  @IsOptional()
  @IsLocalDate({ message: 'endDate debe ser una fecha valida YYYY-MM-DD' })
  endDate?: string;

  @IsOptional()
  @IsBoolean({ message: 'isActive debe ser booleano' })
  isActive?: boolean;
}

export class ConfirmRecurringExpenseDto {
  @IsLocalDate({ message: 'occurrenceDate debe ser una fecha valida YYYY-MM-DD' })
  occurrenceDate!: string;

  @IsOptional()
  @IsInt({ message: 'actualAmount debe ser un entero en centavos' })
  @Min(1, { message: 'actualAmount debe ser mayor que cero' })
  @Max(2_147_483_647, { message: 'actualAmount excede el maximo permitido' })
  actualAmount?: number;

  @IsOptional()
  @IsLocalDate({ message: 'actualDate debe ser una fecha valida YYYY-MM-DD' })
  actualDate?: string;

  @IsOptional()
  @IsString({ message: 'notes debe ser texto' })
  @MaxLength(300, { message: 'notes no debe exceder 300 caracteres' })
  notes?: string;
}

export class UpcomingQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'days debe ser un entero' })
  @Min(1, { message: 'days debe ser al menos 1' })
  @Max(365, { message: 'days no debe exceder 365' })
  days?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit debe ser un entero' })
  @Min(1, { message: 'limit debe ser al menos 1' })
  @Max(100, { message: 'limit no debe exceder 100' })
  limit?: number;
}
