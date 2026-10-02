import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { normalizeEmail } from '../../../common/validation/transforms';
import { CLIENT_TYPES, ClientType } from '../auth.constants';

export class LoginDto {
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'email debe ser un correo valido' })
  @MaxLength(254, { message: 'email no debe exceder 254 caracteres' })
  email!: string;

  @IsString({ message: 'password debe ser texto' })
  @IsNotEmpty({ message: 'password es obligatorio' })
  @MaxLength(128, { message: 'password no debe exceder 128 caracteres' })
  password!: string;

  @IsOptional()
  @IsIn([...CLIENT_TYPES], { message: 'clientType debe ser WEB o NATIVE' })
  clientType?: ClientType;
}
