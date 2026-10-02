import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AppConfigModule } from '../../config/app-config.module';
import { AppConfigService } from '../../config/app-config.service';
import { MailModule } from '../../infrastructure/mail/mail.module';
import { AuditModule } from '../audit/audit.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionsRepository } from './repositories/sessions.repository';
import { VerificationTokensRepository } from './repositories/verification-tokens.repository';
import { PasswordService } from './services/password.service';
import { TokenService } from './services/token.service';

/**
 * Modulo global: los guards registrados en AppModule necesitan el JwtModule,
 * el repositorio de sesiones y el servicio de contrasenas.
 */
@Global()
@Module({
  imports: [
    AppConfigModule,
    MailModule,
    AuditModule,
    UsersModule,
    JwtModule.registerAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        secret: config.jwtSecret,
        signOptions: { expiresIn: `${config.jwtAccessTtlMinutes}m` },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, TokenService, SessionsRepository, VerificationTokensRepository],
  exports: [JwtModule, SessionsRepository, PasswordService],
})
export class AuthModule {}
