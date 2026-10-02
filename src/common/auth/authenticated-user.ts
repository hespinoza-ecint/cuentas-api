/**
 * Usuario autenticado que los guards adjuntan a la peticion.
 * Todos los datos financieros se filtran por este `id`.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
  status: string;
  emailVerified: boolean;
  sessionId: string;
}
