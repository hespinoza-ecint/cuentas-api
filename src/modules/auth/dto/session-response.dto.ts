export class SessionResponseDto {
  id!: string;
  clientType!: string;
  deviceName?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  createdAt!: Date;
  lastUsedAt!: Date;
  current!: boolean;
}
