import { Body, Controller, Get, HttpCode, Patch, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AllowPendingDeletion } from '../../common/auth/allow-pending-deletion.decorator';
import { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { requestMeta } from '../../common/http/request-meta';
import { ChangePasswordDto } from './dto/change-password.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { UserResponseDto, UserSettingsResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

interface MessageResponse {
  message: string;
}

@ApiTags('users')
@ApiBearerAuth('access-token')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getMe(@CurrentUser() user: AuthenticatedUser): Promise<UserResponseDto> {
    return this.usersService.getMe(user.id);
  }

  @Patch('me')
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
    @Req() request: FastifyRequest,
  ): Promise<UserResponseDto> {
    return this.usersService.updateProfile(user.id, dto, requestMeta(request));
  }

  @Post('me/change-password')
  @HttpCode(200)
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @Req() request: FastifyRequest,
  ): Promise<MessageResponse> {
    return this.usersService.changePassword(user.id, user.sessionId, dto, requestMeta(request));
  }

  @Get('me/settings')
  getSettings(@CurrentUser() user: AuthenticatedUser): Promise<UserSettingsResponseDto> {
    return this.usersService.getSettings(user.id);
  }

  @Patch('me/settings')
  updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateSettingsDto,
    @Req() request: FastifyRequest,
  ): Promise<UserSettingsResponseDto> {
    return this.usersService.updateSettings(user.id, dto, requestMeta(request));
  }

  @Post('me/delete')
  @HttpCode(200)
  requestDeletion(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DeleteAccountDto,
    @Req() request: FastifyRequest,
  ): Promise<MessageResponse> {
    return this.usersService.requestDeletion(user.id, dto, requestMeta(request));
  }

  @Post('me/cancel-deletion')
  @HttpCode(200)
  @AllowPendingDeletion()
  cancelDeletion(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
  ): Promise<MessageResponse> {
    return this.usersService.cancelDeletion(user.id, requestMeta(request));
  }

  @Get('me/export')
  @AllowPendingDeletion()
  async exportData(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Record<string, unknown>> {
    const data = await this.usersService.exportData(user.id);
    const date = new Date().toISOString().slice(0, 10);
    void reply.header('content-disposition', `attachment; filename="cuentas-export-${date}.json"`);
    return data;
  }
}
