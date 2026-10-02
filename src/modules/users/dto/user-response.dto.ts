import { UserSettings } from '@prisma/client';

export class UserResponseDto {
  id!: string;
  email!: string;
  firstName!: string;
  lastName!: string;
  role!: string;
  status!: string;
  emailVerified!: boolean;
  createdAt!: Date;
  updatedAt!: Date;
}

export class UserSettingsResponseDto {
  timezone!: string;
  locale!: string;
  holidayCalendarCode!: string;
  minCashBuffer!: number;
  maxUtilizationBps!: number;
  variableIncomeFactorBps!: number;
  pendingIncomeGraceDays!: number;
  backdateLimitDays!: number;
  projectionMinDays!: number;
  updatedAt!: Date;
}

/** Campos minimos para construir la respuesta publica de un usuario. */
export interface UserResponseSource {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Mapea el usuario de la base de datos al contrato publico (sin hash). */
export function toUserResponse(user: UserResponseSource): UserResponseDto {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    status: user.status,
    emailVerified: user.emailVerifiedAt !== null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export function toUserSettingsResponse(settings: UserSettings): UserSettingsResponseDto {
  return {
    timezone: settings.timezone,
    locale: settings.locale,
    holidayCalendarCode: settings.holidayCalendarCode,
    minCashBuffer: settings.minCashBuffer,
    maxUtilizationBps: settings.maxUtilizationBps,
    variableIncomeFactorBps: settings.variableIncomeFactorBps,
    pendingIncomeGraceDays: settings.pendingIncomeGraceDays,
    backdateLimitDays: settings.backdateLimitDays,
    projectionMinDays: settings.projectionMinDays,
    updatedAt: settings.updatedAt,
  };
}
