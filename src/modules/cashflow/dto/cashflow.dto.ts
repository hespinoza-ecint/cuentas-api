import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { IsLocalDate } from '../../../common/validation/is-local-date.decorator';

export class ProjectionQueryDto {
  /** Inicio de la ventana (YYYY-MM-DD). Default hoy; no puede ser anterior a hoy. */
  @IsOptional()
  @IsLocalDate({ message: 'from debe ser una fecha valida YYYY-MM-DD' })
  from?: string;

  /** Fin de la ventana (YYYY-MM-DD). Default: desde + 30 dias; maxima 5 anios. */
  @IsOptional()
  @IsLocalDate({ message: 'to debe ser una fecha valida YYYY-MM-DD' })
  to?: string;

  /** Compatibilidad: ventana de N dias a partir de hoy (1-365). */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'days debe ser un entero' })
  @Min(1, { message: 'days debe ser mayor o igual a 1' })
  @Max(365, { message: 'days no debe exceder 365' })
  days?: number;
}
