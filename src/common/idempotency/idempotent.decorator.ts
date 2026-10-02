import { SetMetadata } from '@nestjs/common';

export const IDEMPOTENT_KEY = 'idempotent';

/**
 * Activa la idempotencia en un POST financiero: si el cliente envia la
 * cabecera `Idempotency-Key`, un reintento con la misma llave y el mismo
 * cuerpo devuelve la respuesta original sin duplicar la operacion.
 */
export const Idempotent = () => SetMetadata(IDEMPOTENT_KEY, true);
