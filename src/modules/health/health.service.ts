import { Injectable } from '@nestjs/common';
import { ServiceUnavailableError } from '../../common/errors/http-errors';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

export interface HealthReport {
  status: 'ok';
  version: string;
  environment: string;
  uptimeSeconds: number;
  timestamp: string;
  checks: {
    database: {
      status: 'up' | 'down';
      latencyMs: number;
    };
  };
}

export interface LivenessReport {
  status: 'ok';
  timestamp: string;
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async check(): Promise<HealthReport> {
    const startedAt = Date.now();

    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableError('La base de datos no esta disponible.', {
        checks: { database: { status: 'down', latencyMs: Date.now() - startedAt } },
      });
    }

    return {
      status: 'ok',
      version: this.config.appVersion,
      environment: this.config.nodeEnv,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      checks: {
        database: { status: 'up', latencyMs: Date.now() - startedAt },
      },
    };
  }

  live(): LivenessReport {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
