import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import {
  AccountLockedError,
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from '../../common/errors/http-errors';
import { RequestMeta } from '../../common/http/request-meta';
import { AppConfigService } from '../../config/app-config.service';
import { MailService } from '../../infrastructure/mail/mail.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { toUserResponse, UserResponseDto } from '../users/dto/user-response.dto';
import { UsersRepository } from '../users/repositories/users.repository';
import {
  ClientType,
  TOKEN_TYPE_EMAIL_VERIFY,
  TOKEN_TYPE_PASSWORD_RESET,
} from './auth.constants';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SessionResponseDto } from './dto/session-response.dto';
import { SessionsRepository } from './repositories/sessions.repository';
import { VerificationTokensRepository } from './repositories/verification-tokens.repository';
import { PasswordService } from './services/password.service';
import { TokenService } from './services/token.service';
import type { SessionWithUser } from './repositories/sessions.repository';

export interface AuthSessionResult {
  accessToken: string;
  expiresInSeconds: number;
  refreshToken: string;
  refreshExpiresAt: Date;
  clientType: ClientType;
  user: UserResponseDto;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersRepository,
    private readonly sessions: SessionsRepository,
    private readonly tokens: VerificationTokensRepository,
    private readonly passwords: PasswordService,
    private readonly tokenService: TokenService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly config: AppConfigService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto, meta: RequestMeta): Promise<{ message: string; user: UserResponseDto }> {
    const existing = await this.users.findByEmail(dto.email);
    if (existing) {
      throw new ConflictError('Ya existe una cuenta con ese correo.', {
        reason: 'EMAIL_ALREADY_REGISTERED',
      });
    }

    const passwordHash = await this.passwords.hash(dto.password);
    const { token, tokenHash } = this.tokenService.generate();
    const expiresAt = new Date(Date.now() + this.config.emailVerificationTtlHours * 3_600_000);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await this.users.createWithSettings(
        {
          email: dto.email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
        },
        tx,
      );

      await this.tokens.create(
        { userId: created.id, type: TOKEN_TYPE_EMAIL_VERIFY, tokenHash, expiresAt },
        tx,
      );

      await this.audit.record(
        {
          action: 'auth.register',
          entityType: 'User',
          entityId: created.id,
          userId: created.id,
          actorUserId: created.id,
          ...meta,
        },
        tx,
      );

      return created;
    });

    await this.mail.sendEmailVerification(user.email, token);

    return {
      message: 'Cuenta creada. Revisa tu correo para verificarla.',
      user: toUserResponse(user),
    };
  }

  async login(dto: LoginDto, meta: RequestMeta): Promise<AuthSessionResult> {
    const user = await this.users.findByEmail(dto.email);

    if (!user || user.deletedAt || user.status === 'DELETED') {
      await this.audit.record({
        action: 'auth.login.failed',
        entityType: 'User',
        userId: user?.id,
        changes: { reason: 'UNKNOWN_EMAIL' },
        ...meta,
      });
      throw new UnauthorizedError('Credenciales invalidas.', { reason: 'INVALID_CREDENTIALS' });
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      const minutes = Math.max(1, Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000));
      throw new AccountLockedError(
        `La cuenta esta bloqueada temporalmente. Intenta de nuevo en ${minutes} minuto(s).`,
        { reason: 'ACCOUNT_LOCKED' },
      );
    }

    const validPassword = await this.passwords.verify(user.passwordHash, dto.password);
    if (!validPassword) {
      const { lockedUntil } = await this.users.registerFailedLogin(
        user.id,
        this.config.authMaxFailedAttempts,
        this.config.authLockMinutes,
      );

      await this.audit.record({
        action: lockedUntil ? 'auth.login.locked' : 'auth.login.failed',
        entityType: 'User',
        entityId: user.id,
        userId: user.id,
        actorUserId: user.id,
        changes: { reason: 'INVALID_PASSWORD' },
        ...meta,
      });

      if (lockedUntil) {
        throw new AccountLockedError(
          `Demasiados intentos fallidos. La cuenta estara bloqueada ${this.config.authLockMinutes} minutos.`,
          { reason: 'ACCOUNT_LOCKED' },
        );
      }

      throw new UnauthorizedError('Credenciales invalidas.', { reason: 'INVALID_CREDENTIALS' });
    }

    await this.users.clearFailedLogins(user.id);
    user.lastLoginAt = new Date();

    const result = await this.issueSession(user.id, user, dto.clientType ?? 'WEB', meta);

    await this.audit.record({
      action: 'auth.login.success',
      entityType: 'Session',
      entityId: result.sessionId,
      userId: user.id,
      actorUserId: user.id,
      ...meta,
    });

    return result;
  }

  /**
   * Rota el refresh token. Si se detecta la reutilizacion de un token ya
   * rotado, se revoca toda la familia de sesiones (proteccion contra robo).
   */
  async refresh(token: string, fromCookie: boolean, meta: RequestMeta): Promise<AuthSessionResult> {
    const session = await this.sessions.findByTokenHash(this.tokenService.hash(token));

    if (!session) {
      throw new UnauthorizedError('La sesion no existe o ya fue revocada.', {
        reason: 'INVALID_REFRESH_TOKEN',
      });
    }

    if (session.revokedAt) {
      await this.sessions.revokeFamily(session.familyId, 'REUSE_DETECTED');
      await this.audit.record({
        action: 'auth.refresh.reuse_detected',
        entityType: 'Session',
        entityId: session.id,
        userId: session.userId,
        actorUserId: session.userId,
        ...meta,
      });
      throw new UnauthorizedError(
        'La sesion fue revocada por seguridad. Inicia sesion de nuevo.',
        { reason: 'REFRESH_TOKEN_REUSED' },
      );
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      await this.sessions.revoke(session.id, 'EXPIRED');
      throw new UnauthorizedError('La sesion expiro. Inicia sesion de nuevo.', {
        reason: 'REFRESH_TOKEN_EXPIRED',
      });
    }

    const user = session.user;
    if (user.deletedAt || user.status === 'DELETED') {
      await this.sessions.revoke(session.id, 'LOGOUT');
      throw new UnauthorizedError('La cuenta ya no esta disponible.', { reason: 'ACCOUNT_DELETED' });
    }

    const { token: newToken, tokenHash } = this.tokenService.generate();
    const expiresAt = new Date(Date.now() + this.config.jwtRefreshTtlDays * 86_400_000);

    const newSession = await this.sessions.rotate(session.id, {
      userId: session.userId,
      familyId: session.familyId,
      tokenHash,
      clientType: fromCookie ? 'WEB' : 'NATIVE',
      ip: meta.ip,
      userAgent: meta.userAgent,
      expiresAt,
    });

    return {
      accessToken: await this.signAccessToken(user.id, newSession.id, user.role),
      expiresInSeconds: this.config.jwtAccessTtlMinutes * 60,
      refreshToken: newToken,
      refreshExpiresAt: expiresAt,
      clientType: fromCookie ? 'WEB' : 'NATIVE',
      user: toUserResponse(user),
    };
  }

  async logout(userId: string, sessionId: string, meta: RequestMeta): Promise<void> {
    await this.sessions.revoke(sessionId, 'LOGOUT');
    await this.audit.record({
      action: 'auth.logout',
      entityType: 'Session',
      entityId: sessionId,
      userId,
      actorUserId: userId,
      ...meta,
    });
  }

  async logoutAll(userId: string, meta: RequestMeta): Promise<{ revokedSessions: number }> {
    const revokedSessions = await this.sessions.revokeAllForUser(userId, 'LOGOUT_ALL');
    await this.audit.record({
      action: 'auth.logout_all',
      entityType: 'User',
      entityId: userId,
      userId,
      actorUserId: userId,
      changes: { revokedSessions },
      ...meta,
    });
    return { revokedSessions };
  }

  async listSessions(userId: string, currentSessionId: string): Promise<SessionResponseDto[]> {
    const sessions = await this.sessions.listActiveByUser(userId);

    return sessions.map((session) => ({
      id: session.id,
      clientType: session.clientType,
      deviceName: session.deviceName,
      ip: session.ip,
      userAgent: session.userAgent,
      createdAt: session.createdAt,
      lastUsedAt: session.lastUsedAt,
      current: session.id === currentSessionId,
    }));
  }

  async revokeSession(userId: string, sessionId: string, meta: RequestMeta): Promise<void> {
    const session = await this.sessions.findByIdForUser(sessionId, userId);
    if (!session) {
      // 404 (no 403) para no revelar sesiones de otros usuarios.
      throw new NotFoundError('La sesion indicada no existe.', { reason: 'SESSION_NOT_FOUND' });
    }

    await this.sessions.revoke(sessionId, 'LOGOUT');
    await this.audit.record({
      action: 'auth.session.revoked',
      entityType: 'Session',
      entityId: sessionId,
      userId,
      actorUserId: userId,
      ...meta,
    });
  }

  async verifyEmail(token: string, meta: RequestMeta): Promise<{ message: string }> {
    const record = await this.tokens.findByHash(
      this.tokenService.hash(token),
      TOKEN_TYPE_EMAIL_VERIFY,
    );

    if (!record) {
      throw new BadRequestError('El enlace de verificacion es invalido o expiro.', {
        reason: 'INVALID_VERIFICATION_TOKEN',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await this.tokens.markUsed(record.id, tx);
      await this.users.setEmailVerified(record.userId, tx);
      await this.audit.record(
        {
          action: 'auth.email.verified',
          entityType: 'User',
          entityId: record.userId,
          userId: record.userId,
          actorUserId: record.userId,
          ...meta,
        },
        tx,
      );
    });

    return { message: 'Correo verificado correctamente.' };
  }

  async resendVerification(email: string, meta: RequestMeta): Promise<{ message: string }> {
    const user = await this.users.findByEmail(email);

    if (user && !user.emailVerifiedAt) {
      await this.tokens.invalidatePending(user.id, TOKEN_TYPE_EMAIL_VERIFY);
      const { token, tokenHash } = this.tokenService.generate();
      const expiresAt = new Date(Date.now() + this.config.emailVerificationTtlHours * 3_600_000);

      await this.tokens.create({
        userId: user.id,
        type: TOKEN_TYPE_EMAIL_VERIFY,
        tokenHash,
        expiresAt,
      });
      await this.mail.sendEmailVerification(user.email, token);
      await this.audit.record({
        action: 'auth.email.verification_resent',
        entityType: 'User',
        entityId: user.id,
        userId: user.id,
        actorUserId: user.id,
        ...meta,
      });
    }

    return {
      message: 'Si el correo esta registrado y sin verificar, enviaremos un nuevo enlace.',
    };
  }

  async forgotPassword(email: string, meta: RequestMeta): Promise<{ message: string }> {
    const user = await this.users.findByEmail(email);

    if (user) {
      await this.tokens.invalidatePending(user.id, TOKEN_TYPE_PASSWORD_RESET);
      const { token, tokenHash } = this.tokenService.generate();
      const expiresAt = new Date(Date.now() + this.config.passwordResetTtlMinutes * 60_000);

      await this.tokens.create({
        userId: user.id,
        type: TOKEN_TYPE_PASSWORD_RESET,
        tokenHash,
        expiresAt,
      });
      await this.mail.sendPasswordReset(user.email, token);
      await this.audit.record({
        action: 'auth.password.reset_requested',
        entityType: 'User',
        entityId: user.id,
        userId: user.id,
        actorUserId: user.id,
        ...meta,
      });
    }

    return {
      message: 'Si el correo esta registrado, enviaremos instrucciones para restablecer la contrasena.',
    };
  }

  async resetPassword(token: string, newPassword: string, meta: RequestMeta): Promise<{ message: string }> {
    const record = await this.tokens.findByHash(
      this.tokenService.hash(token),
      TOKEN_TYPE_PASSWORD_RESET,
    );

    if (!record) {
      throw new BadRequestError('El enlace de restablecimiento es invalido o expiro.', {
        reason: 'INVALID_RESET_TOKEN',
      });
    }

    const passwordHash = await this.passwords.hash(newPassword);

    await this.prisma.$transaction(async (tx) => {
      await this.tokens.markUsed(record.id, tx);
      await this.users.updatePassword(record.userId, passwordHash, tx);
      // Cambiar la contrasena cierra todas las sesiones activas.
      await this.sessions.revokeAllForUser(record.userId, 'PASSWORD_RESET', undefined, tx);
      await this.audit.record(
        {
          action: 'auth.password.reset',
          entityType: 'User',
          entityId: record.userId,
          userId: record.userId,
          actorUserId: record.userId,
          ...meta,
        },
        tx,
      );
    });

    return { message: 'Contrasena restablecida. Inicia sesion con tu nueva contrasena.' };
  }

  private async issueSession(
    userId: string,
    user: SessionWithUser['user'],
    clientType: ClientType,
    meta: RequestMeta,
  ): Promise<AuthSessionResult & { sessionId: string }> {
    const { token, tokenHash } = this.tokenService.generate();
    const expiresAt = new Date(Date.now() + this.config.jwtRefreshTtlDays * 86_400_000);

    const session = await this.sessions.create({
      userId,
      familyId: randomUUID(),
      tokenHash,
      clientType,
      ip: meta.ip,
      userAgent: meta.userAgent,
      expiresAt,
    });

    return {
      accessToken: await this.signAccessToken(userId, session.id, user.role),
      expiresInSeconds: this.config.jwtAccessTtlMinutes * 60,
      refreshToken: token,
      refreshExpiresAt: expiresAt,
      clientType,
      user: toUserResponse(user),
      sessionId: session.id,
    };
  }

  private signAccessToken(userId: string, sessionId: string, role: string): Promise<string> {
    return this.jwt.signAsync({ sub: userId, sid: sessionId, role });
  }
}
