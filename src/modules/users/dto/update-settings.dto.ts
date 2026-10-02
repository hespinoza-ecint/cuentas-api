import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpdateSettingsDto {
  @IsOptional()
  @IsString({ message: 'timezone debe ser texto' })
  @MaxLength(64, { message: 'timezone no debe exceder 64 caracteres' })
  timezone?: string;

  @IsOptional()
  @IsString({ message: 'locale debe ser texto' })
  @MaxLength(10, { message: 'locale no debe exceder 10 caracteres' })
  locale?: string;

  @IsOptional()
  @IsIn(['MX_LABOR', 'MX_BANKING'], {
    message: 'holidayCalendarCode debe ser MX_LABOR o MX_BANKING',
  })
  holidayCalendarCode?: string;

  @IsOptional()
  @IsInt({ message: 'minCashBuffer debe ser un entero en centavos' })
  @Min(0, { message: 'minCashBuffer no puede ser negativo' })
  @Max(2_147_483_647, { message: 'minCashBuffer excede el maximo permitido' })
  minCashBuffer?: number;

  @IsOptional()
  @IsInt({ message: 'maxUtilizationBps debe ser un entero en puntos base' })
  @Min(0, { message: 'maxUtilizationBps no puede ser negativo' })
  @Max(10_000, { message: 'maxUtilizationBps no puede exceder 10000 (100%)' })
  maxUtilizationBps?: number;

  @IsOptional()
  @IsInt({ message: 'variableIncomeFactorBps debe ser un entero en puntos base' })
  @Min(0, { message: 'variableIncomeFactorBps no puede ser negativo' })
  @Max(10_000, { message: 'variableIncomeFactorBps no puede exceder 10000 (100%)' })
  variableIncomeFactorBps?: number;

  @IsOptional()
  @IsInt({ message: 'pendingIncomeGraceDays debe ser un entero' })
  @Min(0, { message: 'pendingIncomeGraceDays no puede ser negativo' })
  @Max(30, { message: 'pendingIncomeGraceDays no puede exceder 30' })
  pendingIncomeGraceDays?: number;

  @IsOptional()
  @IsInt({ message: 'backdateLimitDays debe ser un entero' })
  @Min(0, { message: 'backdateLimitDays no puede ser negativo' })
  @Max(365, { message: 'backdateLimitDays no puede exceder 365' })
  backdateLimitDays?: number;

  @IsOptional()
  @IsInt({ message: 'projectionMinDays debe ser un entero' })
  @Min(1, { message: 'projectionMinDays debe ser al menos 1' })
  @Max(365, { message: 'projectionMinDays no puede exceder 365' })
  projectionMinDays?: number;
}
