import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AppConfigService } from '../../config/app-config.service';

/**
 * Cliente Prisma administrado por Nest.
 *
 * En SQLite activa WAL (mejor concurrencia de lectura/escritura) y un
 * `busy_timeout` de 5 segundos para evitar errores "database is locked".
 * Estas instrucciones se omiten automaticamente al migrar a MySQL.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly isSqlite: boolean;

  constructor(appConfig: AppConfigService) {
    super({
      datasourceUrl: appConfig.databaseUrl,
      log: appConfig.isTest ? [] : ['warn', 'error'],
    });
    this.isSqlite = appConfig.databaseUrl.startsWith('file:');
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();

    if (this.isSqlite) {
      // Primero el timeout de bloqueo: asi las siguientes instrucciones
      // esperan si otra conexion esta usando la base (comun en pruebas).
      await this.$queryRawUnsafe('PRAGMA busy_timeout = 5000;');
      await this.ensureWal();
      this.logger.log('SQLite configurado en modo WAL (busy_timeout = 5000 ms)');
    }
  }

  /**
   * Activa WAL solo si hace falta. El modo es persistente en el archivo
   * (el seed lo activa al crear la base), por lo que en arranques normales
   * esto no hace ninguna escritura. Si hay contencion, reintenta y no es fatal.
   */
  private async ensureWal(attempts = 3): Promise<void> {
    const rows = await this.$queryRawUnsafe<Array<{ journal_mode: string }>>('PRAGMA journal_mode;');
    if ((rows[0]?.journal_mode ?? '').toLowerCase() === 'wal') {
      return;
    }

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        // `queryRawUnsafe` porque los PRAGMA devuelven filas.
        await this.$queryRawUnsafe('PRAGMA journal_mode = WAL;');
        return;
      } catch (error) {
        if (attempt === attempts) {
          this.logger.warn(
            `No se pudo activar WAL en este arranque (se reintentara despues): ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
