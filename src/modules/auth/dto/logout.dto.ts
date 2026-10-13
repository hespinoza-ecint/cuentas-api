import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Cuerpo opcional del logout (clientes NATIVE sin cookie de refresh). */
export class LogoutDto {
  @IsOptional()
  @IsString({ message: 'refreshToken debe ser texto' })
  @MaxLength(512, { message: 'refreshToken no debe exceder 512 caracteres' })
  refreshToken?: string;
}
