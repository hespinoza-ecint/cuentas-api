import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { normalizeEmail, trim } from '../../../common/validation/transforms';

export class RegisterDto {
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'email debe ser un correo valido' })
  @MaxLength(254, { message: 'email no debe exceder 254 caracteres' })
  email!: string;

  @IsString({ message: 'password debe ser texto' })
  @MinLength(10, { message: 'password debe tener al menos 10 caracteres' })
  @MaxLength(128, { message: 'password no debe exceder 128 caracteres' })
  password!: string;

  @Transform(trim)
  @IsString({ message: 'firstName debe ser texto' })
  @IsNotEmpty({ message: 'firstName es obligatorio' })
  @MaxLength(80, { message: 'firstName no debe exceder 80 caracteres' })
  firstName!: string;

  @Transform(trim)
  @IsString({ message: 'lastName debe ser texto' })
  @IsNotEmpty({ message: 'lastName es obligatorio' })
  @MaxLength(80, { message: 'lastName no debe exceder 80 caracteres' })
  lastName!: string;
}
