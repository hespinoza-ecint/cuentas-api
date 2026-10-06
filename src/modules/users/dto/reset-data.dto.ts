import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ResetDataDto {
  /** Se exige la contrasena actual para confirmar el restablecimiento. */
  @IsString({ message: 'password debe ser texto' })
  @IsNotEmpty({ message: 'password es obligatorio' })
  @MaxLength(128, { message: 'password no debe exceder 128 caracteres' })
  password!: string;

  /**
   * Alcance del restablecimiento:
   * - `ALL` (default): todo lo que la app lleva por el usuario.
   * - `CARDS`: solo el dominio de tarjetas (conserva efectivo, ingresos,
   *   gastos y recurrentes).
   */
  @IsOptional()
  @IsIn(['ALL', 'CARDS'], { message: 'scope debe ser ALL o CARDS' })
  scope?: 'ALL' | 'CARDS';
}
