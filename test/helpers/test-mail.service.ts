import { MailService } from '../../src/infrastructure/mail/mail.service';

/**
 * Adaptador de correo para pruebas: guarda en memoria el ultimo token
 * enviado a cada correo. Los tokens reales solo se guardan hasheados en la
 * base de datos, por lo que esta es la unica forma de probar los flujos.
 */
export class TestMailService extends MailService {
  private readonly verificationTokens = new Map<string, string>();
  private readonly passwordResetTokens = new Map<string, string>();

  async sendEmailVerification(to: string, token: string): Promise<void> {
    this.verificationTokens.set(to, token);
  }

  async sendPasswordReset(to: string, token: string): Promise<void> {
    this.passwordResetTokens.set(to, token);
  }

  verificationTokenFor(email: string): string {
    const token = this.verificationTokens.get(email);
    if (!token) {
      throw new Error(`No hay token de verificacion para ${email}`);
    }
    return token;
  }

  resetTokenFor(email: string): string {
    const token = this.passwordResetTokens.get(email);
    if (!token) {
      throw new Error(`No hay token de restablecimiento para ${email}`);
    }
    return token;
  }
}
