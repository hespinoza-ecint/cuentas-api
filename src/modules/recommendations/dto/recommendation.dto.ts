import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { IsLocalDate } from '../../../common/validation/is-local-date.decorator';

const MAX_MONEY = 2_147_483_647;

export class CreateRecommendationDto {
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
  @IsArray({ message: 'eligibleCardIds debe ser un arreglo' })
  @ArrayMaxSize(20, { message: 'eligibleCardIds no debe exceder 20 tarjetas' })
  @IsUUID('4', { each: true, message: 'eligibleCardIds debe contener UUIDs' })
  eligibleCardIds?: string[];
}

export class UpdateRuleOverrideDto {
  @IsOptional()
  @IsBoolean({ message: 'isEnabled debe ser booleano' })
  isEnabled?: boolean;

  @IsOptional()
  @IsInt({ message: 'weight debe ser un entero' })
  @Min(0, { message: 'weight no puede ser negativo' })
  @Max(100, { message: 'weight no debe exceder 100' })
  weight?: number;

  @IsOptional()
  @IsObject({ message: 'params debe ser un objeto' })
  params?: Record<string, unknown>;
}

export class AdminUpdateRuleDto {
  @IsOptional()
  @IsBoolean({ message: 'isEnabled debe ser booleano' })
  isEnabled?: boolean;

  @IsOptional()
  @IsInt({ message: 'weight debe ser un entero' })
  @Min(0, { message: 'weight no puede ser negativo' })
  @Max(100, { message: 'weight no debe exceder 100' })
  weight?: number;

  @IsOptional()
  @IsObject({ message: 'params debe ser un objeto' })
  params?: Record<string, unknown>;
}

export class ListRecommendationsQueryDto {
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
