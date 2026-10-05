import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { CashflowService } from './cashflow.service';
import { ProjectionQueryDto } from './dto/cashflow.dto';

@ApiTags('cashflow')
@ApiBearerAuth('access-token')
@Controller('cashflow')
export class CashflowController {
  constructor(private readonly cashflowService: CashflowService) {}

  @Get('projection')
  projection(@CurrentUser() user: AuthenticatedUser, @Query() query: ProjectionQueryDto) {
    return this.cashflowService.projection(user.id, query);
  }
}
