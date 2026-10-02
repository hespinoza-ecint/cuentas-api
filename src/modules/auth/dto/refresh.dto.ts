import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RefreshDto {
  /** Solo lo envia la app nativa; la PWA usa la cookie httpOnly. */
  @IsOptional()
  @IsString({ message: 'refreshToken debe ser texto' })
  @MaxLength(512, { message: 'refreshToken no debe exceder 512 caracteres' })
  refreshToken?: string;
}
