import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class DeleteAccountDto {
  /** Se exige la contrasena actual para confirmar la eliminacion. */
  @IsString({ message: 'password debe ser texto' })
  @IsNotEmpty({ message: 'password es obligatorio' })
  @MaxLength(128, { message: 'password no debe exceder 128 caracteres' })
  password!: string;
}
