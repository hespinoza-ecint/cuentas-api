import { Transform } from 'class-transformer';
import { IsEmail, MaxLength } from 'class-validator';
import { normalizeEmail } from '../../../common/validation/transforms';

export class ResendVerificationDto {
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'email debe ser un correo valido' })
  @MaxLength(254, { message: 'email no debe exceder 254 caracteres' })
  email!: string;
}
