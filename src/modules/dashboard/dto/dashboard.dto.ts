import { IsOptional, Matches } from 'class-validator';

export class DashboardSummaryQueryDto {
  /** Mes a resumir en formato YYYY-MM (default: mes actual del usuario). */
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'month debe tener el formato YYYY-MM' })
  month?: string;
}
