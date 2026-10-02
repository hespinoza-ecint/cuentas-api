import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString({ message: 'token debe ser texto' })
  @IsNotEmpty({ message: 'token es obligatorio' })
  @MaxLength(512, { message: 'token no debe exceder 512 caracteres' })
  token!: string;

  @IsString({ message: 'newPassword debe ser texto' })
  @MinLength(10, { message: 'newPassword debe tener al menos 10 caracteres' })
  @MaxLength(128, { message: 'newPassword no debe exceder 128 caracteres' })
  newPassword!: string;
}
