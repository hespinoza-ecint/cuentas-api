/**
 * Servicio de correo. En desarrollo se usa el adaptador de consola; en
 * produccion se cambiara por SMTP/SendGrid/Resend sin tocar los llamadores.
 */
export abstract class MailService {
  abstract sendEmailVerification(to: string, token: string): Promise<void>;
  abstract sendPasswordReset(to: string, token: string): Promise<void>;
}
