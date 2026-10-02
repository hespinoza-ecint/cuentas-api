import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
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
import { IsLocalDate } from '../../../common/validation/is-local-date.decorator';
import { trim } from '../../../common/validation/transforms';
import { FREQUENCIES, NON_BUSINESS_RULES } from '../../../domain/schedules/schedule-config';

const MAX_MONEY = 2_147_483_647;

export class IncomeScheduleInputDto {
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

  @IsOptional()
  @IsInt({ message: 'amountOverride debe ser un entero en centavos' })
  @Min(1, { message: 'amountOverride debe ser mayor que cero' })
  @Max(MAX_MONEY, { message: 'amountOverride excede el maximo permitido' })
  amountOverride?: number;

  @IsLocalDate({ message: 'startDate debe ser una fecha valida YYYY-MM-DD' })
  startDate!: string;

  @IsOptional()
  @IsLocalDate({ message: 'endDate debe ser una fecha valida YYYY-MM-DD' })
  endDate?: string;
}

export class CreateIncomeSourceDto {
  @Transform(trim)
  @IsString({ message: 'name debe ser texto' })
  @IsNotEmpty({ message: 'name es obligatorio' })
  @MaxLength(120, { message: 'name no debe exceder 120 caracteres' })
  name!: string;

  @IsUUID('4', { message: 'cashAccountId debe ser un UUID' })
  cashAccountId!: string;

  @IsOptional()
  @IsUUID('4', { message: 'categoryId debe ser un UUID' })
  categoryId?: string;

  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'payer debe ser texto' })
  @MaxLength(120, { message: 'payer no debe exceder 120 caracteres' })
  payer?: string;

  @IsOptional()
  @IsIn(['FIXED', 'VARIABLE'], { message: 'amountType debe ser FIXED o VARIABLE' })
  amountType?: string;

  @IsInt({ message: 'estimatedAmount debe ser un entero en centavos' })
  @Min(1, { message: 'estimatedAmount debe ser mayor que cero' })
  @Max(MAX_MONEY, { message: 'estimatedAmount excede el maximo permitido' })
  estimatedAmount!: number;

  @IsArray({ message: 'schedules debe ser un arreglo' })
  @ArrayMinSize(1, { message: 'Debes indicar al menos un calendario de pago' })
  @ValidateNested({ each: true })
  @Type(() => IncomeScheduleInputDto)
  schedules!: IncomeScheduleInputDto[];
}

export class UpdateIncomeSourceDto {
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'name debe ser texto' })
  @IsNotEmpty({ message: 'name no puede estar vacio' })
  @MaxLength(120, { message: 'name no debe exceder 120 caracteres' })
  name?: string;

  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'payer debe ser texto' })
  @MaxLength(120, { message: 'payer no debe exceder 120 caracteres' })
  payer?: string;

  @IsOptional()
  @IsIn(['FIXED', 'VARIABLE'], { message: 'amountType debe ser FIXED o VARIABLE' })
  amountType?: string;

  @IsOptional()
  @IsInt({ message: 'estimatedAmount debe ser un entero en centavos' })
  @Min(1, { message: 'estimatedAmount debe ser mayor que cero' })
  @Max(MAX_MONEY, { message: 'estimatedAmount excede el maximo permitido' })
  estimatedAmount?: number;

  @IsOptional()
  @IsUUID('4', { message: 'cashAccountId debe ser un UUID' })
  cashAccountId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'categoryId debe ser un UUID' })
  categoryId?: string;

  @IsOptional()
  @IsBoolean({ message: 'isActive debe ser booleano' })
  isActive?: boolean;
}

export class UpdateIncomeScheduleDto {
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
  @IsInt({ message: 'amountOverride debe ser un entero en centavos' })
  @Min(1, { message: 'amountOverride debe ser mayor que cero' })
  @Max(MAX_MONEY, { message: 'amountOverride excede el maximo permitido' })
  amountOverride?: number;

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

export class ConfirmIncomeDto {
  @IsUUID('4', { message: 'incomeSourceId debe ser un UUID' })
  incomeSourceId!: string;

  @IsUUID('4', { message: 'incomeScheduleId debe ser un UUID' })
  incomeScheduleId!: string;

  @IsLocalDate({ message: 'expectedDate debe ser una fecha valida YYYY-MM-DD' })
  expectedDate!: string;

  @IsOptional()
  @IsInt({ message: 'actualAmount debe ser un entero en centavos' })
  @Min(1, { message: 'actualAmount debe ser mayor que cero' })
  @Max(MAX_MONEY, { message: 'actualAmount excede el maximo permitido' })
  actualAmount?: number;

  @IsOptional()
  @IsLocalDate({ message: 'actualDate debe ser una fecha valida YYYY-MM-DD' })
  actualDate?: string;

  @IsOptional()
  @IsString({ message: 'notes debe ser texto' })
  @MaxLength(300, { message: 'notes no debe exceder 300 caracteres' })
  notes?: string;
}

export class SkipIncomeDto {
  @IsUUID('4', { message: 'incomeSourceId debe ser un UUID' })
  incomeSourceId!: string;

  @IsUUID('4', { message: 'incomeScheduleId debe ser un UUID' })
  incomeScheduleId!: string;

  @IsLocalDate({ message: 'expectedDate debe ser una fecha valida YYYY-MM-DD' })
  expectedDate!: string;

  @IsOptional()
  @IsString({ message: 'notes debe ser texto' })
  @MaxLength(300, { message: 'notes no debe exceder 300 caracteres' })
  notes?: string;
}

export class ListIncomeTransactionsQueryDto {
  @IsOptional()
  @IsUUID('4', { message: 'incomeSourceId debe ser un UUID' })
  incomeSourceId?: string;

  @IsOptional()
  @IsIn(['CONFIRMED', 'SKIPPED', 'RESCHEDULED'], {
    message: 'status debe ser CONFIRMED, SKIPPED o RESCHEDULED',
  })
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit debe ser un entero' })
  @Max(100, { message: 'limit no debe exceder 100' })
  limit?: number;

  @IsOptional()
  @IsUUID('4', { message: 'cursor debe ser un UUID' })
  cursor?: string;
}

export class UpcomingIncomeQueryDto {
  @IsOptional()
  @IsUUID('4', { message: 'incomeSourceId debe ser un UUID' })
  incomeSourceId?: string;

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
