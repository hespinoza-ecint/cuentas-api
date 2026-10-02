import { UserResponseDto } from '../../users/dto/user-response.dto';

export class AuthResponseDto {
  accessToken!: string;
  tokenType!: string;
  expiresInSeconds!: number;
  /** Solo se devuelve en el flujo NATIVE; la PWA usa la cookie httpOnly. */
  refreshToken?: string;
  user!: UserResponseDto;
}

export class RegisterResponseDto {
  message!: string;
  user!: UserResponseDto;
}

export class MessageResponseDto {
  message!: string;
}
