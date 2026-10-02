import { SetMetadata } from '@nestjs/common';

export const ALLOW_PENDING_DELETION_KEY = 'allowPendingDeletion';

/**
 * Permite acceder a la ruta aunque la cuenta este en estado PENDING_DELETION.
 * Se usa en cancelar-eliminacion, exportar datos y cerrar sesion.
 */
export const AllowPendingDeletion = () => SetMetadata(ALLOW_PENDING_DELETION_KEY, true);
