import { Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/auth/roles.decorator';
import { MaintenanceService } from './maintenance.service';

@ApiTags('admin')
@ApiBearerAuth('access-token')
@Roles('ADMIN')
@Controller('admin/maintenance')
export class MaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  @Post('run')
  @HttpCode(200)
  run() {
    return this.maintenanceService.run();
  }
}
