import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export const CATEGORY_KINDS = ['EXPENSE', 'INCOME', 'BOTH'];

export class CreateCategoryDto {
  @IsString({ message: 'name debe ser texto' })
  @IsNotEmpty({ message: 'name es obligatorio' })
  @MaxLength(60, { message: 'name no debe exceder 60 caracteres' })
  name!: string;

  @IsIn(CATEGORY_KINDS, { message: 'kind debe ser EXPENSE, INCOME o BOTH' })
  kind!: string;

  @IsOptional()
  @IsUUID('4', { message: 'parentId debe ser un UUID' })
  parentId?: string;

  @IsOptional()
  @IsString({ message: 'icon debe ser texto' })
  @MaxLength(40, { message: 'icon no debe exceder 40 caracteres' })
  icon?: string;
}

export class UpdateCategoryDto {
  @IsOptional()
  @IsString({ message: 'name debe ser texto' })
  @IsNotEmpty({ message: 'name no puede estar vacio' })
  @MaxLength(60, { message: 'name no debe exceder 60 caracteres' })
  name?: string;

  @IsOptional()
  @IsIn(CATEGORY_KINDS, { message: 'kind debe ser EXPENSE, INCOME o BOTH' })
  kind?: string;

  /** null para desligar la categoria de su padre. */
  @IsOptional()
  @IsUUID('4', { message: 'parentId debe ser un UUID' })
  parentId?: string | null;

  @IsOptional()
  @IsString({ message: 'icon debe ser texto' })
  @MaxLength(40, { message: 'icon no debe exceder 40 caracteres' })
  icon?: string;
}
