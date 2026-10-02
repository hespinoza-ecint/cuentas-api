import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marca una ruta o controlador como publico (sin access token). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
