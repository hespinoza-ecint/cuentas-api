import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString({ message: 'currentPassword debe ser texto' })
  @IsNotEmpty({ message: 'currentPassword es obligatorio' })
  @MaxLength(128, { message: 'currentPassword no debe exceder 128 caracteres' })
  currentPassword!: string;

  @IsString({ message: 'newPassword debe ser texto' })
  @MinLength(10, { message: 'newPassword debe tener al menos 10 caracteres' })
  @MaxLength(128, { message: 'newPassword no debe exceder 128 caracteres' })
  newPassword!: string;
}
