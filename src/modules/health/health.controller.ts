import { Controller, Get } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthService } from './health.service';

@ApiTags('health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Estado general del servicio (incluye la base de datos)' })
  @ApiOkResponse({ description: 'Servicio y base de datos operativos' })
  @ApiServiceUnavailableResponse({ description: 'La base de datos no esta disponible' })
  check() {
    return this.healthService.check();
  }

  @Get('live')
  @ApiOperation({ summary: 'Liveness: confirma que el proceso responde' })
  @ApiOkResponse({ description: 'Proceso activo' })
  live() {
    return this.healthService.live();
  }
}
