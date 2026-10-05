import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class ProjectionQueryDto {
  /** Horizonte de la proyeccion en dias (default 60, maximo 365). */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'days debe ser un entero' })
  @Min(1, { message: 'days debe ser mayor o igual a 1' })
  @Max(365, { message: 'days no debe exceder 365' })
  days?: number;
}
