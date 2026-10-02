import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AllowPendingDeletion } from '../../common/auth/allow-pending-deletion.decorator';
import { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Public } from '../../common/auth/public.decorator';
import { ForbiddenError, UnauthorizedError } from '../../common/errors/http-errors';
import { clearCookie, parseCookie, serializeCookie } from '../../common/http/cookies';
import { requestMeta } from '../../common/http/request-meta';
import { AppConfigService } from '../../config/app-config.service';
import { AuthService, AuthSessionResult } from './auth.service';
import { AUTH_THROTTLE, REFRESH_COOKIE_NAME, REFRESH_COOKIE_PATH } from './auth.constants';
import { AuthResponseDto, RegisterResponseDto } from './dto/auth-response.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SessionResponseDto } from './dto/session-response.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';

interface MessageResponse {
  message: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfigService,
  ) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('register')
  register(@Body() dto: RegisterDto, @Req() request: FastifyRequest): Promise<RegisterResponseDto> {
    return this.auth.register(dto, requestMeta(request));
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthResponseDto> {
    const result = await this.auth.login(dto, requestMeta(request));

    if (result.clientType === 'WEB') {
      this.setRefreshCookie(reply, result);
    }

    return this.toAuthResponse(result);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Body() dto: RefreshDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthResponseDto> {
    const cookieToken = parseCookie(request.headers.cookie, REFRESH_COOKIE_NAME);
    const fromCookie = typeof cookieToken === 'string' && cookieToken.length > 0;

    if (fromCookie) {
      this.assertTrustedOrigin(request);
    }

    const token = fromCookie ? cookieToken : dto.refreshToken;
    if (!token) {
      throw new UnauthorizedError('No se envio un refresh token.', {
        reason: 'MISSING_REFRESH_TOKEN',
      });
    }

    const result = await this.auth.refresh(token, fromCookie, requestMeta(request));

    if (fromCookie) {
      this.setRefreshCookie(reply, result);
    }

    return this.toAuthResponse(result);
  }

  @Post('logout')
  @HttpCode(204)
  @AllowPendingDeletion()
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    await this.auth.logout(user.id, user.sessionId, requestMeta(request));
    this.clearRefreshCookie(reply);
  }

  @Post('logout-all')
  @HttpCode(204)
  @AllowPendingDeletion()
  async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    await this.auth.logoutAll(user.id, requestMeta(request));
    this.clearRefreshCookie(reply);
  }

  @Get('sessions')
  @ApiBearerAuth('access-token')
  listSessions(@CurrentUser() user: AuthenticatedUser): Promise<SessionResponseDto[]> {
    return this.auth.listSessions(user.id, user.sessionId);
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  @ApiBearerAuth('access-token')
  async revokeSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) sessionId: string,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    await this.auth.revokeSession(user.id, sessionId, requestMeta(request));
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('verify-email')
  @HttpCode(200)
  verifyEmail(@Body() dto: VerifyEmailDto, @Req() request: FastifyRequest): Promise<MessageResponse> {
    return this.auth.verifyEmail(dto.token, requestMeta(request));
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('resend-verification')
  @HttpCode(202)
  resendVerification(
    @Body() dto: ResendVerificationDto,
    @Req() request: FastifyRequest,
  ): Promise<MessageResponse> {
    return this.auth.resendVerification(dto.email, requestMeta(request));
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('forgot-password')
  @HttpCode(202)
  forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @Req() request: FastifyRequest,
  ): Promise<MessageResponse> {
    return this.auth.forgotPassword(dto.email, requestMeta(request));
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('reset-password')
  @HttpCode(200)
  resetPassword(
    @Body() dto: ResetPasswordDto,
    @Req() request: FastifyRequest,
  ): Promise<MessageResponse> {
    return this.auth.resetPassword(dto.token, dto.newPassword, requestMeta(request));
  }

  private toAuthResponse(result: AuthSessionResult): AuthResponseDto {
    const response: AuthResponseDto = {
      accessToken: result.accessToken,
      tokenType: 'Bearer',
      expiresInSeconds: result.expiresInSeconds,
      user: result.user,
    };

    if (result.clientType === 'NATIVE') {
      response.refreshToken = result.refreshToken;
    }

    return response;
  }

  private setRefreshCookie(reply: FastifyReply, result: AuthSessionResult): void {
    void reply.header(
      'set-cookie',
      serializeCookie(REFRESH_COOKIE_NAME, result.refreshToken, {
        httpOnly: true,
        secure: this.config.cookieSecure,
        sameSite: 'Strict',
        path: REFRESH_COOKIE_PATH,
        expires: result.refreshExpiresAt,
      }),
    );
  }

  private clearRefreshCookie(reply: FastifyReply): void {
    void reply.header('set-cookie', clearCookie(REFRESH_COOKIE_NAME, REFRESH_COOKIE_PATH));
  }

  /** La cookie de refresh solo se acepta desde los origenes permitidos. */
  private assertTrustedOrigin(request: FastifyRequest): void {
    const origin = request.headers.origin;
    if (!origin || !this.config.corsOrigins.includes(origin)) {
      throw new ForbiddenError('Origen no permitido para esta operacion.', {
        reason: 'UNTRUSTED_ORIGIN',
      });
    }
  }
}
