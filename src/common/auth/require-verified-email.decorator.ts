import { SetMetadata } from '@nestjs/common';

export const REQUIRE_VERIFIED_EMAIL_KEY = 'requireVerifiedEmail';

/**
 * Exige que el correo este verificado. Se aplicara a las operaciones
 * financieras (fases 3+) para permitir el uso limitado mientras tanto.
 */
export const RequireVerifiedEmail = () => SetMetadata(REQUIRE_VERIFIED_EMAIL_KEY, true);
