import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class VerifyEmailDto {
  @IsString({ message: 'token debe ser texto' })
  @IsNotEmpty({ message: 'token es obligatorio' })
  @MaxLength(512, { message: 'token no debe exceder 512 caracteres' })
  token!: string;
}
