import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { MailService } from './mail.service';

/**
 * Adaptador de desarrollo: los correos se escriben en el log con el enlace
 * listo para abrir. Nunca se registra el token en produccion (aqui solo
 * se usa cuando NODE_ENV no es production).
 */
@Injectable()
export class ConsoleMailService extends MailService {
  private readonly logger = new Logger(ConsoleMailService.name);

  constructor(private readonly config: AppConfigService) {
    super();
  }

  async sendEmailVerification(to: string, token: string): Promise<void> {
    const link = `${this.config.webAppUrl}/verificar-correo?token=${encodeURIComponent(token)}`;
    this.logger.log(`[CORREO DEV] Verificacion de correo para ${to}: ${link}`);
  }

  async sendPasswordReset(to: string, token: string): Promise<void> {
    const link = `${this.config.webAppUrl}/restablecer-contrasena?token=${encodeURIComponent(token)}`;
    this.logger.log(`[CORREO DEV] Restablecimiento de contrasena para ${to}: ${link}`);
  }
}
