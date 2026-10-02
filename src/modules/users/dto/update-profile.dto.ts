import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { trim } from '../../../common/validation/transforms';

export class UpdateProfileDto {
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'firstName debe ser texto' })
  @MinLength(1, { message: 'firstName no puede estar vacio' })
  @MaxLength(80, { message: 'firstName no debe exceder 80 caracteres' })
  firstName?: string;

  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'lastName debe ser texto' })
  @MinLength(1, { message: 'lastName no puede estar vacio' })
  @MaxLength(80, { message: 'lastName no debe exceder 80 caracteres' })
  lastName?: string;
}
